import { HARM_NEURONS, LAYERS, REFUSAL_NEURONS, baseNorm, rrThreshold } from '../sim/model';
import { getProbe } from '../sim/probe';
import type { Trace } from '../sim/simulate';
import type { Vec } from '../sim/vec';
import { Plain } from './Intro';
import { div, fmt, Seg, useTip } from './ui';

export type GridMode = 'activation' | 'probe';

const HARM = new Set(HARM_NEURONS);
const REF = new Set(REFUSAL_NEURONS);

function NeuronGrid(props: { title: string; sub: string; vec: Vec; layer: number; weights?: Float64Array; mode: GridMode }) {
  const tip = useTip();
  const b = baseNorm(props.layer);
  const vals = Array.from(props.vec, (v, i) => (props.mode === 'probe' && props.weights ? (v / b) * props.weights[i] : v / b));
  const scale = props.mode === 'probe' ? Math.max(0.4, ...vals.map(Math.abs)) : 1.2;
  return (
    <div className="grid-wrap">
      <h3>{props.title}</h3>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        {props.sub}
      </div>
      <div className="neurons" role="img" aria-label={`${props.title}: 64 neuron activations`}>
        {vals.map((v, i) => (
          <div
            key={i}
            className={`neuron${HARM.has(i) ? ' harm' : ''}${REF.has(i) ? ' refusal' : ''}`}
            style={{ background: div(v / scale) }}
            onMouseMove={(e) =>
              tip(
                e,
                <div>
                  <div className="mono">neuron n{i}</div>
                  <div>
                    {props.mode === 'probe' ? 'Probe contribution' : 'Activation'}: <b className="num">{fmt(v)}</b>
                  </div>
                  {HARM.has(i) && <div>Part of the harm feature</div>}
                  {REF.has(i) && <div>Part of the refusal feature</div>}
                </div>,
              )
            }
            onMouseLeave={() => tip(null)}
          >
            <span className="idx">{i}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Readout(props: { k: string; v: number | null; max?: number; color: string; threshold?: number; digits?: number }) {
  const max = props.max ?? 1;
  const w = props.v == null ? 0 : Math.max(0, Math.min(1, props.v / max)) * 100;
  return (
    <div className="readout">
      <span className="k">{props.k}</span>
      <span className="v">{fmt(props.v, props.digits ?? 2)}</span>
      <div className="bar">
        <i style={{ width: `${w}%`, background: props.color }} />
        {props.threshold != null && <span className="thr" style={{ left: `calc(${(props.threshold / max) * 100}% - 1px)` }} />}
      </div>
    </div>
  );
}

interface Props {
  trace: Trace;
  token: number;
  layer: number;
  setLayer: (l: number) => void;
  mode: GridMode;
  setMode: (m: GridMode) => void;
}

export function Inspector({ trace, token, layer, setLayer, mode, setMode }: Props) {
  const tok = trace.tokens[Math.min(token, trace.tokens.length - 1)];
  const cfg = trace.config;
  const probe = cfg.hp !== 'off' ? getProbe(cfg.hp, cfg.probeLayer) : null;
  const weights = probe?.neuronWeights;
  const probeMode = mode === 'probe' && !!weights;
  const showLayer = probeMode ? cfg.probeLayer : layer;
  const first = Math.min(...cfg.rrConfig.targetLayers);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Inside the AI: the neurons for one word</h2>
        <span className="sub mono">
          token #{token} “{tok.text}” · layer {showLayer}
        </span>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
        <Plain>
          Each square is one neuron inside the AI while it handles the selected word. Red and blue mean it’s firing one way or the other; pale means
          quiet. The squares with <b>bold outlines</b> are the handful that fire together when the AI is producing harmful content. Compare the
          normal AI on the left with the protected AI on the right. When Breaker A trips, the right side gets scrambled. Click any word in the reply
          to inspect it.
        </Plain>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 260 }}>
            <Seg
              label="Grid shows"
              value={probeMode ? 'probe' : 'activation'}
              onChange={(m) => setMode(m)}
              options={[
                { value: 'activation', label: 'Activations' },
                { value: 'probe', label: weights ? 'Probe contribution' : 'Probe (enable HP)' },
              ]}
            />
          </div>
          <label className="slider" style={{ flex: '1 1 220px', maxWidth: 360 }} htmlFor="layer-pick">
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Layer</span>
            <output className="mono">L{showLayer}</output>
            <input
              id="layer-pick"
              type="range"
              min={0}
              max={LAYERS - 1}
              value={showLayer}
              disabled={probeMode}
              onChange={(e) => setLayer(parseInt(e.target.value, 10))}
            />
          </label>
        </div>
        <div className="inspect">
          <NeuronGrid
            title="Original model"
            sub="Frozen weights, no circuit breakers"
            vec={tok.repsOrig[showLayer]}
            layer={showLayer}
            weights={weights}
            mode={probeMode ? 'probe' : 'activation'}
          />
          <NeuronGrid
            title={cfg.rr ? 'With circuit breakers (RR)' : 'With circuit breakers (RR off)'}
            sub={cfg.rr ? `LoRA rerouting ρ = ${fmt(tok.rho[showLayer])} at this layer` : 'Turn on RR to see rerouted activations'}
            vec={tok.repsCb[showLayer]}
            layer={showLayer}
            weights={weights}
            mode={probeMode ? 'probe' : 'activation'}
          />
          <div className="readouts">
            <Readout k={`Harm feature at L${first} (original)`} v={tok.harmByLayer[first]} color="var(--seq-hi)" threshold={cfg.rr ? rrThreshold(cfg.rrConfig.sensitivity) : undefined} />
            <Readout k={`cos(orig, CB) at L${showLayer}`} v={tok.cos[showLayer]} color="var(--cos-hi)" />
            <Readout k={`‖rep‖ CB ÷ orig at L${showLayer}`} v={tok.normCb[showLayer] / tok.normOrig[showLayer]} max={5} color="var(--s-l20)" digits={2} />
            <Readout k="RR loss ReLU(cos), target layers" v={trace.rrLoss[token]} color="var(--s-l10)" />
            <Readout k={probe ? `Probe score (${probe.kind}, L${probe.layer})` : 'Probe score (HP off)'} v={tok.probe} color="var(--s-probe)" threshold={probe ? cfg.probeThreshold : undefined} />
            <div className="legend-row" style={{ marginTop: 2 }}>
              <span>
                <span className="sw" style={{ background: 'var(--div-neg)' }} /> negative
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--div-mid)' }} /> ~0
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--div-pos)' }} /> positive
              </span>
              <span>
                <span className="sw" style={{ border: '2px solid var(--ink)' }} /> harm neuron
              </span>
              <span>
                <span className="sw" style={{ border: '1.5px dashed var(--ink-2)' }} /> refusal neuron
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
