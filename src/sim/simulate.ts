import {
  LAYERS,
  circuitBrokenReps,
  contentVec,
  harmReadout,
  originalReps,
  type RRConfig,
  type TokenState,
} from './model';
import { getProbe, probeScore, type ProbeKind } from './probe';
import { mulberry32 } from './rng';
import { ATTACKS, SCENARIOS, parsePrompt, parseScript, type Attack, type Scenario, type ScriptToken } from './scenarios';
import { norm, normalize, type Vec, zeros, clamp } from './vec';

export type ModelId = 'llama3' | 'mistral';

export const MODELS: Record<ModelId, { label: string; refusalStrength: number; probeLayer: number; note: string }> = {
  llama3: {
    label: 'Llama-3-8B-Instruct',
    refusalStrength: 1,
    probeLayer: 31,
    note: 'Strong refusal training (12.4% no-attack ASR). HP reads the final layer.',
  },
  mistral: {
    label: 'Mistral-7B-Instruct-v2',
    refusalStrength: 0.33,
    probeLayer: 16,
    note: 'Weak refusal training (57.8% no-attack ASR). HP reads layer 16.',
  },
};

export interface SimConfig {
  scenarioId: string;
  attackId: string;
  model: ModelId;
  rr: boolean;
  hp: 'off' | ProbeKind;
  rrConfig: RRConfig;
  probeLayer: number;
  probeThreshold: number;
  seed: number;
  maxNewTokens: number;
}

export type Role = 'attack' | 'prompt' | 'prefill' | 'gen' | 'refusal' | 'gibberish' | 'eos';

export interface TraceToken {
  text: string;
  role: Role;
  harm: number;
  drive: number;
  refuse: number;
  /** Harm-feature readout per layer on the original (frozen) model. */
  harmByLayer: number[];
  repsOrig: Vec[];
  repsCb: Vec[];
  /** Rerouting strength per layer (0 when RR is off). */
  rho: number[];
  /** cos(rep_orig, rep_cb) per layer — the quantity the RR loss drives to ≤ 0. */
  cos: number[];
  normOrig: number[];
  normCb: number[];
  gate: number;
  probe: number | null;
  flagged: boolean;
  /** Token the undefended model would have produced here but was never shown (HP halt). */
  withheld?: boolean;
}

export type Outcome =
  | 'harmful-completion'
  | 'refused'
  | 'circuit-broken'
  | 'probe-halted'
  | 'answered'
  | 'false-positive'
  | 'over-refusal';

export interface Trace {
  config: SimConfig;
  scenario: Scenario;
  attack: Attack;
  tokens: TraceToken[];
  /** index of first response token (prefill or generated) */
  responseStart: number;
  /** index of last prefill token, or -1 */
  prefillEnd: number;
  /** first token where the circuit breaker (RR) engaged on a response token, or -1 */
  rrTrip: number;
  /** token where the probe crossed threshold, or -1 */
  hpTrip: number;
  outcome: Outcome;
  /** RR loss value (mean ReLU cosine at target layers) per token */
  rrLoss: number[];
}

const GIBBERISH = ['.', 'I', ':', 'A', '.', 'You', 'HOW', '.', 'I'];

function attackFor(scn: Scenario, attack: Attack) {
  let promptSrc = scn.prompt;
  if (attack.useObfuscation && scn.obfuscatedPrompt) promptSrc = scn.obfuscatedPrompt;
  if (attack.useTranslation && scn.translated) promptSrc = scn.translated.prompt;
  const prompt = parsePrompt(promptSrc);
  const prefix = attack.prefix ? parsePrompt(attack.prefix) : [];
  const suffix = attack.suffix ? parsePrompt(attack.suffix) : [];
  let prefill: ScriptToken[] = [];
  if (attack.usePrefill) {
    const src = attack.useObfuscation && scn.obfuscatedPrefill ? scn.obfuscatedPrefill : scn.prefill;
    prefill = parsePrompt(src);
  }
  return { prompt, prefix, suffix, prefill };
}

export function simulate(cfg: SimConfig): Trace {
  const scenario = SCENARIOS.find((s) => s.id === cfg.scenarioId) ?? SCENARIOS[0];
  const attack = ATTACKS.find((a) => a.id === cfg.attackId) ?? ATTACKS[0];
  const model = MODELS[cfg.model];
  const rng = mulberry32(cfg.seed * 7919 + 17);
  const probe = cfg.hp === 'off' ? null : getProbe(cfg.hp, cfg.probeLayer);
  const parts = attackFor(scenario, attack);
  const hs = attack.harmScale;
  const tokens: TraceToken[] = [];
  const rrLoss: number[] = [];

  let ctx: Vec = zeros(64);
  let drive = 0;
  let promptHarm = 0;
  let stickyGate = 0;

  const push = (text: string, role: Role, harm: number, refuse: number, isResponse: boolean) => {
    ctx = normalize(
      (() => {
        const c = contentVec(text);
        const v = zeros(c.length);
        for (let i = 0; i < c.length; i++) v[i] = 0.6 * c[i] + 0.4 * ctx[i];
        return v;
      })(),
    );
    const h = harm * hs;
    if (!isResponse) {
      // Reading a request represents intent, which is weaker than an unfolding harmful process.
      drive = clamp(Math.max(0.8 * drive, 0.35 * h));
    } else {
      drive = clamp(0.72 * drive + 0.55 * h + 0.08 * promptHarm);
    }
    const suppression = (attack.harmSuppression ?? 0) * (attack.id === 'embed' && isResponse ? 0.5 : 1);
    const state: TokenState = { ctx, drive, refuse, suppression, repeAttack: attack.id === 'repe' };
    const repsOrig = originalReps(state, rng);
    let repsCb = repsOrig;
    let rho = new Array(LAYERS).fill(0);
    let cos = new Array(LAYERS).fill(1);
    let gate = 0;
    if (cfg.rr) {
      const floor = role === 'gibberish' || role === 'eos' ? stickyGate : 0;
      const r = circuitBrokenReps(repsOrig, state, cfg.rrConfig, rng, floor);
      if (isResponse) stickyGate = Math.max(stickyGate, r.gate);
      repsCb = r.reps;
      rho = r.rho;
      cos = r.cos;
      gate = r.gate;
    }
    const active = cfg.rr ? repsCb : repsOrig;
    const probeVal = probe && isResponse ? probeScore(probe, active[probe.layer]) : null;
    const tok: TraceToken = {
      text,
      role,
      harm: h,
      drive,
      refuse,
      harmByLayer: repsOrig.map((v, l) => harmReadout(v, l)),
      repsOrig,
      repsCb,
      rho,
      cos,
      normOrig: repsOrig.map(norm),
      normCb: repsCb.map(norm),
      gate,
      probe: probeVal,
      flagged: probeVal !== null && probeVal > cfg.probeThreshold,
    };
    tokens.push(tok);
    rrLoss.push(cfg.rrConfig.targetLayers.reduce((s, l) => s + Math.max(0, cos[l]), 0) / cfg.rrConfig.targetLayers.length);
    return tok;
  };

  // ---- prompt ----
  for (const t of parts.prefix) push(t.text, 'attack', t.harm, 0, false);
  for (const t of parts.prompt) {
    promptHarm = Math.max(promptHarm, t.harm * hs);
    push(t.text, 'prompt', t.harm, 0, false);
  }
  for (const t of parts.suffix) push(t.text, 'attack', t.harm, 0, false);

  const responseStart = tokens.length;
  let rrTrip = -1;
  let hpTrip = -1;
  let refused = false;
  let gibberishRun = 0;

  const checkTrips = (tok: TraceToken, idx: number) => {
    if (cfg.rr && rrTrip < 0 && tok.rho[LAYERS - 1] > 0.5) rrTrip = idx;
    if (tok.flagged && hpTrip < 0) hpTrip = idx;
  };

  // ---- prefill (attacker-controlled response start) ----
  for (const t of parts.prefill) {
    const tok = push(t.text, 'prefill', t.harm, 0, true);
    checkTrips(tok, tokens.length - 1);
    if (hpTrip >= 0) break;
  }
  const prefillEnd = parts.prefill.length ? responseStart + parts.prefill.length - 1 : -1;

  // ---- refusal decision (only when the attacker did not write the response start) ----
  if (hpTrip < 0 && !attack.usePrefill) {
    const recognized = promptHarm * model.refusalStrength * (1 - attack.refusalBypass);
    if (recognized > 0.35) refused = true;
  }

  // ---- generation ----
  if (hpTrip < 0) {
    const script = refused ? parsePrompt(scenario.refusal) : parseScript(scenario.script);
    let i = 0;
    while (i < script.length && tokens.length - responseStart < cfg.maxNewTokens + parts.prefill.length) {
      const last = tokens[tokens.length - 1];
      // Once the circuit is broken it stays broken: the rerouted state cannot recover a coherent harmful plan.
      const broken = cfg.rr && (rrTrip >= 0 || (last.rho[LAYERS - 1] > 0.5 && tokens.length > responseStart));
      if (broken && !refused) {
        if (gibberishRun >= 4) {
          push('<EOS>', 'eos', 0, 0, true);
          break;
        }
        const g = GIBBERISH[Math.floor(rng() * GIBBERISH.length)];
        const tok = push(g, 'gibberish', 0, 0, true);
        gibberishRun++;
        checkTrips(tok, tokens.length - 1);
        if (hpTrip >= 0) break;
        continue;
      }
      const t = script[i++];
      const tok = push(t.text, refused ? 'refusal' : 'gen', t.harm, refused ? 1 : 0, true);
      checkTrips(tok, tokens.length - 1);
      if (hpTrip >= 0) break;
    }
  }

  if (hpTrip >= 0) tokens[hpTrip].withheld = true;

  const harmful = scenario.kind === 'harmful';
  let outcome: Outcome;
  if (hpTrip >= 0 && (rrTrip < 0 || hpTrip <= rrTrip)) outcome = harmful ? 'probe-halted' : 'false-positive';
  else if (rrTrip >= 0) outcome = harmful ? 'circuit-broken' : 'false-positive';
  else if (refused) outcome = harmful ? 'refused' : 'over-refusal';
  else outcome = harmful ? 'harmful-completion' : 'answered';

  return { config: cfg, scenario, attack, tokens, responseStart, prefillEnd, rrTrip, hpTrip, outcome, rrLoss };
}

export const OUTCOME_INFO: Record<Outcome, { label: string; status: 'good' | 'warning' | 'critical'; detail: string }> = {
  'harmful-completion': {
    label: 'Harmful answer got through',
    status: 'critical',
    detail: 'The trick got past the AI’s safety training and nothing stopped it. The harmful text is redacted here.',
  },
  refused: {
    label: 'Refused',
    status: 'good',
    detail: 'The AI’s ordinary safety training said no, so no breaker was needed.',
  },
  'circuit-broken': {
    label: 'Stopped by Breaker A (scramble)',
    status: 'good',
    detail: 'The AI’s internal state was knocked off course, so it lost the thread, wrote nonsense, and stopped.',
  },
  'probe-halted': {
    label: 'Stopped by Breaker B (alarm)',
    status: 'good',
    detail: 'The alarm spotted the harmful pattern inside the AI and cut the reply off. The user sees a refusal.',
  },
  answered: { label: 'Answered normally', status: 'good', detail: 'A harmless question got a normal answer, and the breakers stayed quiet.' },
  'false-positive': {
    label: 'False alarm',
    status: 'warning',
    detail: 'A breaker stopped a harmless request. The setting is too sensitive.',
  },
  'over-refusal': {
    label: 'Refused a harmless request',
    status: 'warning',
    detail: 'The AI’s safety training wrongly said no.',
  },
};

export const DEFAULT_CONFIG: SimConfig = {
  scenarioId: 'meth',
  attackId: 'prefill',
  model: 'llama3',
  rr: true,
  hp: 'off',
  rrConfig: { targetLayers: [10, 20], sensitivity: 0.5 },
  probeLayer: 31,
  probeThreshold: 0.5,
  seed: 1,
  maxNewTokens: 40,
};
