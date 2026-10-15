import { falsePositiveRate, getProbe, truePositiveRate } from '../sim/probe';
import { ATTACKS, FORCED_CALL_LABEL, SCENARIOS } from '../sim/scenarios';
import { MODELS, type ModelId, type SimConfig } from '../sim/simulate';
import { Seg, Slider } from './ui';

interface Props {
  cfg: SimConfig;
  set: (patch: Partial<SimConfig>) => void;
  probeReady: boolean;
}

const LAYER_PRESETS: { id: string; label: string; layers: number[]; note: string }[] = [
  { id: '10,20', label: 'L10 + L20', layers: [10, 20], note: 'Paper setting for Llama-3 and Mistral (App. C.2.1)' },
  { id: '16', label: 'L16', layers: [16], note: 'Paper setting for LLaVA-NeXT (App. C.3.1)' },
  { id: '5,10', label: 'L5 + L10', layers: [5, 10], note: 'Earlier than the paper: the harm feature is still forming' },
  { id: '24', label: 'L24', layers: [24], note: 'Later than the paper' },
];

export const attackLabel = (attackId: string, scenarioId: string) => {
  const a = ATTACKS.find((x) => x.id === attackId)!;
  const agent = SCENARIOS.find((s) => s.id === scenarioId)?.agent;
  return agent && a.id === 'prefill' ? FORCED_CALL_LABEL : a.label;
};

export function Controls({ cfg, set, probeReady }: Props) {
  const scenario = SCENARIOS.find((s) => s.id === cfg.scenarioId)!;
  const attack = ATTACKS.find((a) => a.id === cfg.attackId)!;
  const preset = LAYER_PRESETS.find((p) => p.layers.join(',') === cfg.rrConfig.targetLayers.join(',')) ?? LAYER_PRESETS[0];
  const probe = cfg.hp !== 'off' && probeReady ? getProbe(cfg.hp, cfg.probeLayer) : null;
  const groups: { label: string; kind: string }[] = [
    { label: 'Harmful (circuit breaker set)', kind: 'harmful' },
    { label: 'Benign (retain set)', kind: 'benign' },
    { label: 'Borderline (over-refusal test)', kind: 'borderline' },
  ];
  const attackUnavailable = (id: string) =>
    (id === 'multilingual' && !scenario.translated) || (id === 'obfuscation' && !scenario.obfuscatedPrefill);

  return (
    <aside className="panel controls" aria-label="Simulation controls">
      <div className="ctl-section">
        <div className="label">1 · The request</div>
        <p className="plain" style={{ margin: 0, fontSize: 13 }}>What someone asks the AI, and the trick they use to get past its safety training.</p>
        <label className="field" htmlFor="scenario">
          <span>Scenario</span>
          <select id="scenario" value={cfg.scenarioId} onChange={(e) => set({ scenarioId: e.target.value })}>
            {groups.map((g) => (
              <optgroup key={g.kind} label={g.label}>
                {SCENARIOS.filter((s) => s.kind === g.kind).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <p className="blurb">
          {scenario.category} · <span className="ref">{scenario.source}</span>
        </p>
        <label className="field" htmlFor="attack">
          <span>Attack</span>
          <select id="attack" value={cfg.attackId} onChange={(e) => set({ attackId: e.target.value })}>
            {ATTACKS.map((a) => (
              <option key={a.id} value={a.id} disabled={attackUnavailable(a.id)}>
                {attackLabel(a.id, cfg.scenarioId)}
              </option>
            ))}
          </select>
        </label>
        <p className="blurb" style={{ color: 'var(--ink)', fontSize: 13 }}>{attack.plain}</p>
        <p className="tech">
          {attack.blurb} ({attack.ref})
        </p>
        <div className="field">
          <span>Which AI</span>
          <Seg<ModelId>
            label="Base model"
            value={cfg.model}
            onChange={(m) => set({ model: m, probeLayer: MODELS[m].probeLayer })}
            options={[
              { value: 'llama3', label: 'Llama-3-8B' },
              { value: 'mistral', label: 'Mistral-7B' },
            ]}
          />
        </div>
        <p className="blurb">
          Two real open models from the paper. {cfg.model === 'llama3' ? 'Llama-3 reliably refuses plain harmful requests.' : 'Mistral often answers plain harmful requests.'}
        </p>
        <p className="tech">{MODELS[cfg.model].note}</p>
      </div>

      <div className="ctl-section">
        <div className="toggle-row">
          <div>
            <div className="label">2 · Breaker A</div>
            <h3>Scramble</h3>
          </div>
          <button type="button" role="switch" aria-checked={cfg.rr} aria-label="Representation Rerouting" className="switch" onClick={() => set({ rr: !cfg.rr })} />
        </div>
        <p className="plain" style={{ margin: 0, fontSize: 13 }}>
          Trained into the AI itself. When its inner state starts heading toward harmful content, the state is pushed somewhere useless. The AI
          loses the thread and stops.
        </p>
        <p className="tech">Technical name: Representation Rerouting (RR)</p>
        <div className={cfg.rr ? '' : 'disabled'} style={{ display: 'grid', gap: 8 }}>
          <div className="field">
            <span>Where it watches (layers)</span>
            <Seg
              label="Target layers"
              value={preset.id}
              onChange={(id) => set({ rrConfig: { ...cfg.rrConfig, targetLayers: LAYER_PRESETS.find((p) => p.id === id)!.layers } })}
              options={LAYER_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            />
          </div>
          <p className="blurb">{preset.note}. LoRA adapters span layers 0–{Math.max(...cfg.rrConfig.targetLayers)}.</p>
          <Slider
            id="rr-sens"
            label="How easily it trips"
            value={cfg.rrConfig.sensitivity}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => set({ rrConfig: { ...cfg.rrConfig, sensitivity: v } })}
            format={(v) => v.toFixed(2)}
          />
          <p className="blurb">Higher catches better-disguised tricks, but it also starts tripping on harmless borderline questions.</p>
        </div>
      </div>

      <div className="ctl-section">
        <div className="label">3 · Breaker B</div>
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>Alarm</h3>
        <p className="plain" style={{ margin: 0, fontSize: 13 }}>
          A separate watcher that reads the AI’s inner signals word by word. If they look harmful, it pulls the plug and shows a refusal instead.
        </p>
        <p className="tech">Technical name: Harmfulness Probe (HP). Linear = simple, MLP = small neural network.</p>
        <Seg
          label="Probe type"
          value={cfg.hp}
          onChange={(hp) => set({ hp })}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'linear', label: 'Linear' },
            { value: 'mlp', label: 'MLP 64·32' },
          ]}
        />
        <div className={cfg.hp === 'off' ? 'disabled' : ''} style={{ display: 'grid', gap: 8 }}>
          <label className="field" htmlFor="probe-layer">
            <span>Which layer it reads</span>
            <select id="probe-layer" value={cfg.probeLayer} onChange={(e) => set({ probeLayer: parseInt(e.target.value, 10) })}>
              <option value={10}>L10</option>
              <option value={16}>L16 (paper, Mistral)</option>
              <option value={20}>L20</option>
              <option value={31}>L31 · final (paper, Llama-3)</option>
            </select>
          </label>
          <Slider
            id="probe-thr"
            label="How sure before it stops the reply"
            value={cfg.probeThreshold}
            min={0.05}
            max={0.95}
            step={0.05}
            onChange={(v) => set({ probeThreshold: v })}
            format={(v) => v.toFixed(2)}
          />
          {probe ? (
            <div className="stat-line">
              <span>
                False alarms <b>{(falsePositiveRate(probe, cfg.probeThreshold) * 100).toFixed(1)}%</b>
              </span>
              <span>
                Catches <b>{(truePositiveRate(probe, cfg.probeThreshold) * 100).toFixed(1)}%</b>
              </span>
              <span>
                Acc <b>{(probe.trainAcc * 100).toFixed(1)}%</b>
              </span>
            </div>
          ) : (
            cfg.hp !== 'off' && <div className="stat-line">Training probe in your browser…</div>
          )}
          <p className="blurb">Lower stops more harmful replies but raises false alarms on harmless ones.</p>
        </div>
      </div>

      <div className="ctl-section">
        <div className="label">Randomness</div>
        <p className="blurb">The simulated AI has a little random noise. Re-sample to see a slightly different run.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 12 }}>
            seed {cfg.seed}
          </span>
          <button type="button" className="btn" onClick={() => set({ seed: cfg.seed + 1 })}>
            Re-sample noise
          </button>
        </div>
      </div>
    </aside>
  );
}
