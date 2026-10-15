// Harmfulness Probes (HP), §4.4 / Table 2: a linear probe and an MLP probe (hidden 64, 32)
// trained in the browser to separate circuit-breaker-set activations from retain-set activations.

import { D, baseNorm, contentVec, layerRep, type TokenState } from './model';
import { gaussian, mulberry32, type Rng } from './rng';
import { sigmoid, type Vec, zeros, normalize } from './vec';

export type ProbeKind = 'linear' | 'mlp';

interface Sample {
  x: Float64Array;
  y: number;
}

function randomCtx(rng: Rng): Vec {
  // mix of a random "token" content vector and gaussian noise, like contextual states
  const base = contentVec('w' + Math.floor(rng() * 5000));
  const v = zeros(D);
  for (let i = 0; i < D; i++) v[i] = 0.8 * base[i] + 0.2 * gaussian(rng) / Math.sqrt(D);
  return normalize(v);
}

export function makeDataset(layer: number, n: number, seed: number): Sample[] {
  const rng = mulberry32(seed);
  const out: Sample[] = [];
  for (let k = 0; k < n; k++) {
    const harmful = k % 2 === 0;
    const s: TokenState = {
      ctx: randomCtx(rng),
      // Circuit Breaker set: harmful completions. Retain set: UltraChat-like, XSTest borderline, refusals.
      drive: harmful ? 0.4 + 0.6 * rng() : rng() < 0.25 ? 0.12 + 0.18 * rng() : 0.08 * rng(),
      refuse: harmful ? 0 : rng() < 0.3 ? 0.6 + 0.4 * rng() : 0,
      suppression: 0,
      repeAttack: false,
    };
    const v = layerRep(s, layer, rng);
    const x = new Float64Array(D);
    const b = baseNorm(layer);
    for (let i = 0; i < D; i++) x[i] = v[i] / b;
    out.push({ x, y: harmful ? 1 : 0 });
  }
  return out;
}

export interface Probe {
  kind: ProbeKind;
  layer: number;
  /** linear: w (D), b. mlp: W1 (64xD), b1, W2 (32x64), b2, w3 (32), b3 */
  params: Float64Array[];
  /** Effective per-neuron weight (linear weights, or input-gradient magnitude at a harmful point for the MLP). */
  neuronWeights: Float64Array;
  trainAcc: number;
  /** Held-out retain-set scores, used to report false-positive rate at a threshold. */
  retainScores: number[];
  harmfulScores: number[];
}

function forward(p: Float64Array[], kind: ProbeKind, x: Float64Array, cache?: { h1: Float64Array; h2: Float64Array }): number {
  if (kind === 'linear') {
    const [w, b] = p;
    let z = b[0];
    for (let i = 0; i < D; i++) z += w[i] * x[i];
    return sigmoid(z);
  }
  const [W1, b1, W2, b2, w3, b3] = p;
  const h1 = cache?.h1 ?? new Float64Array(64);
  const h2 = cache?.h2 ?? new Float64Array(32);
  for (let j = 0; j < 64; j++) {
    let z = b1[j];
    for (let i = 0; i < D; i++) z += W1[j * D + i] * x[i];
    h1[j] = z > 0 ? z : 0;
  }
  for (let j = 0; j < 32; j++) {
    let z = b2[j];
    for (let i = 0; i < 64; i++) z += W2[j * 64 + i] * h1[i];
    h2[j] = z > 0 ? z : 0;
  }
  let z = b3[0];
  for (let i = 0; i < 32; i++) z += w3[i] * h2[i];
  return sigmoid(z);
}

function initParams(kind: ProbeKind, rng: Rng): Float64Array[] {
  const he = (n: number, fanIn: number) => {
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) a[i] = gaussian(rng) * Math.sqrt(2 / fanIn);
    return a;
  };
  if (kind === 'linear') return [he(D, D).map((v) => v * 0.1), new Float64Array(1)];
  return [he(64 * D, D), new Float64Array(64), he(32 * 64, 64), new Float64Array(32), he(32, 32), new Float64Array(1)];
}

/** Minibatch Adam on binary cross-entropy. Small enough to run at page load. */
export function trainProbe(kind: ProbeKind, layer: number, seed = 7): Probe {
  const rng = mulberry32(seed + layer * 101 + (kind === 'mlp' ? 1 : 0));
  const train = makeDataset(layer, 2000, seed + layer);
  const test = makeDataset(layer, 400, seed + layer + 999);
  const p = initParams(kind, rng);
  const m = p.map((a) => new Float64Array(a.length));
  const v = p.map((a) => new Float64Array(a.length));
  const g = p.map((a) => new Float64Array(a.length));
  const lr = kind === 'linear' ? 0.05 : 0.015;
  const iters = kind === 'linear' ? 400 : 220;
  const bs = kind === 'linear' ? 48 : 32;
  const wd = kind === 'linear' ? 0.01 : 0.002; // L2 keeps probes from latching onto token-content directions
  const cache = { h1: new Float64Array(64), h2: new Float64Array(32) };
  const d2 = new Float64Array(32);
  const d1 = new Float64Array(64);

  for (let t = 1; t <= iters; t++) {
    g.forEach((a) => a.fill(0));
    for (let k = 0; k < bs; k++) {
      const s = train[Math.floor(rng() * train.length)];
      const yhat = forward(p, kind, s.x, cache);
      const dz = (yhat - s.y) / bs;
      if (kind === 'linear') {
        for (let i = 0; i < D; i++) g[0][i] += dz * s.x[i];
        g[1][0] += dz;
        continue;
      }
      const [, , W2, , w3] = p;
      const { h1, h2 } = cache;
      for (let i = 0; i < 32; i++) {
        g[4][i] += dz * h2[i];
        d2[i] = h2[i] > 0 ? dz * w3[i] : 0;
      }
      g[5][0] += dz;
      d1.fill(0);
      for (let j = 0; j < 32; j++) {
        if (d2[j] === 0) continue;
        g[3][j] += d2[j];
        for (let i = 0; i < 64; i++) {
          g[2][j * 64 + i] += d2[j] * h1[i];
          d1[i] += d2[j] * W2[j * 64 + i];
        }
      }
      for (let j = 0; j < 64; j++) {
        if (h1[j] <= 0 || d1[j] === 0) continue;
        g[1][j] += d1[j];
        for (let i = 0; i < D; i++) g[0][j * D + i] += d1[j] * s.x[i];
      }
    }
    // Adam step
    const b1 = 0.9, b2 = 0.999;
    for (let q = 0; q < p.length; q++) {
      const pq = p[q], mq = m[q], vq = v[q], gq = g[q];
      for (let i = 0; i < pq.length; i++) {
        const gi = gq[i] + (pq.length > 1 ? wd * pq[i] : 0);
        mq[i] = b1 * mq[i] + (1 - b1) * gi;
        vq[i] = b2 * vq[i] + (1 - b2) * gi * gi;
        const mh = mq[i] / (1 - Math.pow(b1, t));
        const vh = vq[i] / (1 - Math.pow(b2, t));
        pq[i] -= (lr * mh) / (Math.sqrt(vh) + 1e-8);
      }
    }
  }

  let correct = 0;
  const retainScores: number[] = [];
  const harmfulScores: number[] = [];
  for (const s of test) {
    const y = forward(p, kind, s.x);
    if ((y > 0.5 ? 1 : 0) === s.y) correct++;
    (s.y ? harmfulScores : retainScores).push(y);
  }

  // Per-neuron importance: linear weights, or average input gradient over harmful test points for the MLP.
  const neuronWeights = new Float64Array(D);
  if (kind === 'linear') neuronWeights.set(p[0]);
  else {
    const eps = 1e-3;
    const pts = test.filter((s) => s.y === 1).slice(0, 40);
    for (const s of pts) {
      const base = forward(p, kind, s.x);
      for (let i = 0; i < D; i++) {
        const x2 = Float64Array.from(s.x);
        x2[i] += eps;
        neuronWeights[i] += (forward(p, kind, x2) - base) / eps / pts.length;
      }
    }
  }

  return { kind, layer, params: p, neuronWeights, trainAcc: correct / test.length, retainScores, harmfulScores };
}

export function probeScore(probe: Probe, rep: Vec): number {
  const b = baseNorm(probe.layer);
  const x = new Float64Array(D);
  for (let i = 0; i < D; i++) x[i] = rep[i] / b;
  return forward(probe.params, probe.kind, x);
}

export function falsePositiveRate(probe: Probe, threshold: number): number {
  return probe.retainScores.filter((s) => s > threshold).length / probe.retainScores.length;
}

export function truePositiveRate(probe: Probe, threshold: number): number {
  return probe.harmfulScores.filter((s) => s > threshold).length / probe.harmfulScores.length;
}

const cache = new Map<string, Probe>();
export function getProbe(kind: ProbeKind, layer: number): Probe {
  const key = `${kind}:${layer}`;
  let p = cache.get(key);
  if (!p) {
    p = trainProbe(kind, layer);
    cache.set(key, p);
  }
  return p;
}

export const hasProbe = (kind: ProbeKind, layer: number) => cache.has(`${kind}:${layer}`);
