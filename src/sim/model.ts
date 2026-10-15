// A toy residual-stream model. It is NOT a language model: token choice is scripted.
// What it does model, with real vector arithmetic, is the representation geometry the paper
// describes: a harm feature that emerges in middle layers, a refusal feature, and — for the
// circuit-broken model — LoRA-style rerouting of harmful representations to an orthogonal
// direction (RR loss = ReLU(cos(rep_orig, rep_cb)), Algorithm 1).

import { gaussian, hashString, mulberry32, type Rng } from './rng';
import { cosine, norm, normalize, reject, sigmoid, type Vec, zeros } from './vec';

export const D = 64; // hidden size of the toy residual stream (shown as an 8x8 neuron grid)
export const LAYERS = 32; // Llama-3-8B and Mistral-7B both have 32 decoder layers

/** Neurons that carry the harm feature. The direction is sparse so "specific neurons" light up. */
export const HARM_NEURONS = [5, 12, 19, 27, 34, 41, 46, 58];
const HARM_SIGNS = [1, 1, -1, 1, 1, -1, 1, 1];
const HARM_WEIGHTS = [1.0, 0.9, 0.8, 1.0, 0.7, 0.85, 0.75, 0.95];
/** Neurons that carry the refusal feature (what refusal training / RepE attacks act on). */
export const REFUSAL_NEURONS = [2, 9, 23, 30, 44, 51];

function sparseDir(idx: number[], w: number[], signs?: number[]): Vec {
  const v = zeros(D);
  idx.forEach((i, k) => (v[i] = w[k] * (signs ? signs[k] : 1)));
  return normalize(v);
}

export const HARM_DIR = sparseDir(HARM_NEURONS, HARM_WEIGHTS, HARM_SIGNS);
export const REFUSAL_DIR = sparseDir(REFUSAL_NEURONS, [1, 0.8, 0.9, 1, 0.7, 0.85]);

const FEATURE_NEURONS = new Set([...HARM_NEURONS, ...REFUSAL_NEURONS]);

/** Residual norm grows with depth, as in real transformers. */
export const baseNorm = (l: number) => 4 + 0.35 * l;
/** Harm feature becomes linearly readable around layer ~8 (cf. layer 5 vs 10 in Fig. 6). */
export const harmGain = (l: number) => sigmoid((l - 7.5) / 1.6);
const refusalGain = (l: number) => sigmoid((l - 12) / 2.5);

/** Per-token semantic content: a pseudo-random vector seeded by the token text, kept off the feature neurons. */
const contentCache = new Map<string, Vec>();
export function contentVec(text: string): Vec {
  let v = contentCache.get(text);
  if (!v) {
    const rng = mulberry32(hashString(text));
    v = zeros(D);
    for (let i = 0; i < D; i++) v[i] = FEATURE_NEURONS.has(i) ? 0.08 * gaussian(rng) : gaussian(rng);
    v = normalize(v);
    contentCache.set(text, v);
  }
  return v;
}

export interface TokenState {
  /** contextual semantic vector (unit) */
  ctx: Vec;
  /** latent harmful-process strength 0..1 */
  drive: number;
  /** refusal-feature strength 0..1 */
  refuse: number;
  /** attack push against the harm direction (embedding / RepE attacks) */
  suppression: number;
  /** RepE attack: refusal direction subtracted in layers 12..21 */
  repeAttack: boolean;
}

/** Original (frozen) model representation at every layer for one token. */
export function originalReps(s: TokenState, rng: Rng, noise = 0.05): Vec[] {
  const out: Vec[] = [];
  for (let l = 0; l < LAYERS; l++) out.push(layerRep(s, l, rng, noise));
  return out;
}

export function layerRep(s: TokenState, l: number, rng: Rng, noise = 0.05): Vec {
  const b = baseNorm(l);
  const v = zeros(D);
  const h = b * 1.6 * harmGain(l) * Math.max(0, s.drive - s.suppression * harmGain(l));
  let r = b * 1.4 * refusalGain(l) * s.refuse;
  if (s.repeAttack && l >= 12 && l <= 21) r -= b * 0.9;
  for (let i = 0; i < D; i++) {
    v[i] = b * s.ctx[i] + h * HARM_DIR[i] + r * REFUSAL_DIR[i] + b * noise * gaussian(rng);
  }
  return v;
}

/** Read the harm feature back out of a representation, normalized to ≈ drive. */
export function harmReadout(v: Vec, l: number): number {
  let s = 0;
  for (let i = 0; i < D; i++) s += v[i] * HARM_DIR[i];
  return s / (baseNorm(l) * 1.6 * Math.max(harmGain(l), 1e-3));
}

export interface RRConfig {
  /** Layers where the RR loss is applied (paper: 10 and 20 for LLMs; 16 for LLaVA). */
  targetLayers: number[];
  /** 0..1 — how aggressively harmful states get rerouted (proxy for α × training steps). */
  sensitivity: number;
}

/** Threshold on the harm readout above which the trained LoRA reroutes. */
export const rrThreshold = (sens: number) => 0.62 - 0.42 * sens;

/** How much rerouting the LoRA adapters apply at layer l (LoRA spans layers 0..max(target)). */
export function rerouteRamp(l: number, cfg: RRConfig): number {
  const first = Math.min(...cfg.targetLayers);
  return sigmoid((l - (first - 1.5)) / 1.1);
}

/** Norm blow-up after rerouting: grows past the last target layer (Fig. 12: layer 20 norms explode, layer 10 less so). */
function normBlow(l: number, cfg: RRConfig): number {
  const last = Math.max(...cfg.targetLayers);
  return 0.25 + 3.2 * sigmoid((l - (last - 3)) / 2);
}

export interface RRResult {
  reps: Vec[];
  gate: number;
  rho: number[];
  cos: number[];
}

/**
 * Model with circuit breakers. `gate` is how strongly the trained adapter recognizes this token's
 * state as part of a harmful process; refusal states are protected by the retain set.
 */
export function circuitBrokenReps(orig: Vec[], s: TokenState, cfg: RRConfig, rng: Rng, gateFloor = 0): RRResult {
  const first = Math.min(...cfg.targetLayers);
  const readout = harmReadout(orig[first], first);
  // gateFloor: once broken, the model keeps attending to its own rerouted context, so it stays broken.
  const gate = Math.max(gateFloor, sigmoid((readout - rrThreshold(cfg.sensitivity)) / 0.045) * (1 - 0.95 * s.refuse));
  const reps: Vec[] = [];
  const rho: number[] = [];
  const cos: number[] = [];
  // A fixed random target direction per token (the representation it gets "shorted" into)
  const target = zeros(D);
  for (let i = 0; i < D; i++) target[i] = gaussian(rng);
  for (let l = 0; l < LAYERS; l++) {
    const o = orig[l];
    const r = gate * rerouteRamp(l, cfg);
    rho.push(r);
    if (r < 1e-4) {
      reps.push(o);
      cos.push(1);
      continue;
    }
    const perp = normalize(reject(target, o));
    const mag = norm(o) * (1 + normBlow(l, cfg) * r);
    const v = zeros(D);
    for (let i = 0; i < D; i++) v[i] = (1 - r) * o[i] + r * mag * perp[i];
    reps.push(v);
    cos.push(cosine(o, v));
  }
  return { reps, gate, rho, cos };
}
