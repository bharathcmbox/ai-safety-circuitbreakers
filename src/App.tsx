import { useEffect, useMemo, useRef, useState } from 'react';
import { Compare } from './components/Compare';
import { Controls } from './components/Controls';
import { Explainer } from './components/Explainer';
import { Heatmap, type HeatMetric } from './components/Heatmap';
import { Inspector, type GridMode } from './components/Inspector';
import { Intro, Plain } from './components/Intro';
import { LineChart } from './components/LineChart';
import { Transcript } from './components/Transcript';
import { Seg, TooltipProvider } from './components/ui';
import { getProbe, hasProbe, type ProbeKind } from './sim/probe';
import { DEFAULT_CONFIG, simulate, type SimConfig, type Trace } from './sim/simulate';

function niceMax(v: number) {
  const steps = [5, 10, 15, 20, 30, 40, 50, 60, 80, 100];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 50) * 50;
}

function BreakerMark() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="6" fill="var(--surface)" stroke="var(--line-strong)" />
      <rect x="13" y="7" width="14" height="26" rx="3" fill="var(--surface-2)" stroke="var(--line-strong)" />
      <rect x="15.5" y="19" width="9" height="11" rx="2" fill="var(--critical)" />
      <path d="M22 4 17 12h4l-2 6 6-8h-4z" fill="var(--accent)" />
    </svg>
  );
}

export default function App() {
  const [cfg, setCfg] = useState<SimConfig>(DEFAULT_CONFIG);
  const set = (patch: Partial<SimConfig>) => setCfg((c) => ({ ...c, ...patch }));

  // ---- probes train in the browser; defer so the first frame paints ----
  const [probeTick, setProbeTick] = useState(0);
  const needed: [ProbeKind, number][] = [
    ['linear', cfg.probeLayer],
    ['mlp', cfg.probeLayer],
  ];
  const missing = needed.filter(([k, l]) => !hasProbe(k, l));
  const missingKey = missing.map((m) => m.join(':')).join(',');
  useEffect(() => {
    if (!missing.length) return;
    // train the one the user selected first
    const order = [...missing].sort((a) => (a[0] === cfg.hp ? -1 : 1));
    let cancelled = false;
    const run = (i: number) => {
      if (cancelled || i >= order.length) return;
      getProbe(order[i][0], order[i][1]);
      setProbeTick((t) => t + 1);
      setTimeout(() => run(i + 1), 16);
    };
    const id = setTimeout(() => run(0), 30);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [missingKey]);

  const traceReady = cfg.hp === 'off' || hasProbe(cfg.hp, cfg.probeLayer);
  const lastTrace = useRef<Trace | null>(null);
  const fresh = useMemo(() => (traceReady ? simulate(cfg) : null), [cfg, traceReady, probeTick]);
  if (fresh) lastTrace.current = fresh;
  const trace = fresh ?? lastTrace.current ?? simulate({ ...cfg, hp: 'off' });
  const allProbesReady = missing.length === 0;

  // ---- playback ----
  const [upto, setUpto] = useState(trace.responseStart);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(170);
  const [pinned, setPinned] = useState<number | null>(null);
  const [layer, setLayer] = useState(20);
  const [gridMode, setGridMode] = useState<GridMode>('activation');
  const [metric, setMetric] = useState<HeatMetric>('harm');

  useEffect(() => {
    setUpto(trace.responseStart);
    setPinned(null);
    setPlaying(true);
  }, [trace]);

  useEffect(() => {
    if (!playing) return;
    if (upto >= trace.tokens.length) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setUpto((u) => u + 1), speed);
    return () => clearTimeout(id);
  }, [playing, upto, speed, trace]);

  const done = upto >= trace.tokens.length;
  const trip = [trace.rrTrip, trace.hpTrip].filter((t) => t >= 0).sort((a, b) => a - b)[0];
  // once playback ends, land on the token where a breaker tripped
  const follow = done && trip != null ? trip : Math.max(0, upto - 1);
  const selected = Math.min(pinned ?? follow, trace.tokens.length - 1);
  const labels = trace.tokens.map((t) => t.text);
  const rrOn = trace.config.rr;

  const markers = [
    { x: trace.responseStart, label: 'response starts' },
    ...(trace.prefillEnd >= 0 ? [{ x: trace.prefillEnd, label: 'end of prefill' }] : []),
    ...(trace.rrTrip >= 0 && trace.rrTrip < upto ? [{ x: trace.rrTrip, label: 'RR trips' }] : []),
    ...(trace.hpTrip >= 0 && trace.hpTrip < upto ? [{ x: trace.hpTrip, label: 'probe halts' }] : []),
  ];

  const normMax = niceMax(Math.max(...trace.tokens.slice(0, upto).flatMap((t) => [t.normCb[10], t.normCb[20], t.normOrig[20]])));
  const normTicks = [0, normMax / 2, normMax];

  return (
    <TooltipProvider>
      <header className="topbar">
        <div className="brand">
          <BreakerMark />
          <div>
            <h1>Circuit Breaker Lab</h1>
            <p>
              See how an AI can be stopped mid-sentence, before it writes something harmful, by watching what happens inside it. Based on the
              research paper <i>Improving Alignment and Robustness with Circuit Breakers</i> (Zou et al., 2024).
            </p>
          </div>
        </div>
        <nav className="toplinks" aria-label="References">
          <span className="chip">Toy model · illustrative</span>
          <a className="chip" href="https://arxiv.org/abs/2406.04313" target="_blank" rel="noreferrer">
            Paper ↗
          </a>
          <a className="chip" href="https://github.com/GraySwanAI/circuit-breakers" target="_blank" rel="noreferrer">
            Original code ↗
          </a>
        </nav>
      </header>

      <Intro />

      <div className="layout">
        <Controls cfg={cfg} set={set} probeReady={traceReady} />

        <main className="bench">
          <Transcript
            trace={trace}
            onEnableRR={() => set({ rr: true })}
            onEnableHP={() => set({ hp: 'linear' })}
            upto={upto}
            selected={selected}
            onSelect={(i) => {
              setPinned(i);
              setPlaying(false);
            }}
            playing={playing}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onStep={(d) => {
              setPlaying(false);
              setPinned(null);
              setUpto((u) => Math.max(trace.responseStart, Math.min(trace.tokens.length, u + d)));
            }}
            onScrub={(v) => {
              setPlaying(false);
              setPinned(null);
              setUpto(v);
            }}
            onRestart={() => {
              setPinned(null);
              setUpto(trace.responseStart);
              setPlaying(true);
            }}
            speed={speed}
            setSpeed={setSpeed}
          />

          <Inspector trace={trace} token={selected} layer={layer} setLayer={setLayer} mode={gridMode} setMode={setGridMode} />

          <div className="panel">
            <div className="panel-head">
              <h2>Where the harm signal shows up</h2>
              <div style={{ width: 300, maxWidth: '100%' }}>
                <Seg
                  label="Heatmap metric"
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { value: 'harm', label: 'Harm feature (original)' },
                    { value: 'reroute', label: '1 − cos(orig, CB)' },
                  ]}
                />
              </div>
            </div>
            <div className="panel-body">
              <Plain>
                Each column is one word and each row is one of the AI’s 32 processing stages, with the first at the bottom. Darker means a
                stronger signal. The harm signal barely exists in the early stages and becomes clear in the middle ones. That’s why the breakers
                watch the middle.
              </Plain>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
                {metric === 'harm'
                  ? 'How strongly each layer represents a harmful process. It becomes readable around layer 8, which is why the RR loss targets layers 10 and 20.'
                  : rrOn
                    ? 'How far the circuit-broken model has rerouted each representation away from the original. Layers before the first target barely move.'
                    : 'Turn on Representation Rerouting to see rerouting.'}{' '}
                Copper ◂ marks RR target layers; the dashed violet row is the probe layer. Click a cell to inspect it.
              </p>
              <Heatmap
                trace={trace}
                upto={upto}
                metric={metric}
                selToken={selected}
                selLayer={gridMode === 'probe' && cfg.hp !== 'off' ? cfg.probeLayer : layer}
                onSelect={(t, l) => {
                  setPinned(t);
                  setLayer(l);
                  setGridMode('activation');
                  setPlaying(false);
                }}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>The gauges, word by word</h2>
              <span className="sub">x-axis: word number · hover for values · click to inspect a word</span>
            </div>
            <div className="panel-body" style={{ paddingBottom: 0 }}>
              <Plain>
                Three readings over the course of the reply. <b>Left:</b> how similar the protected AI’s thinking is to the normal AI’s (1 means
                identical). A sudden drop means Breaker A kicked in. <b>Middle:</b> how loud the inner signal is. It spikes when the breaker
                scrambles it. <b>Right:</b> Breaker B’s alarm meter. Crossing the dashed line stops the reply.
              </Plain>
            </div>
            <div className="panel-body charts">
              {rrOn ? (
                <LineChart
                  title="Cosine between original and circuit-broken representations"
                  subtitle="Cf. paper Fig. 6. Layer 5 stays near 1, layers 10 and 20 collapse."
                  series={[
                    { id: 'l5', label: 'Layer 5', color: 'var(--s-l5)', values: trace.tokens.map((t) => t.cos[5]) },
                    { id: 'l10', label: 'Layer 10', color: 'var(--s-l10)', values: trace.tokens.map((t) => t.cos[10]) },
                    { id: 'l20', label: 'Layer 20', color: 'var(--s-l20)', values: trace.tokens.map((t) => t.cos[20]) },
                  ]}
                  xLabels={labels}
                  upto={upto}
                  yDomain={[-0.2, 1.05]}
                  yTicks={[0, 0.5, 1]}
                  markers={markers}
                  selected={selected}
                  onSelect={(i) => {
                    setPinned(i);
                    setPlaying(false);
                  }}
                />
              ) : (
                <div>
                  <div className="chart-title">Cosine between original and circuit-broken representations</div>
                  <div className="empty-note">Turn on Representation Rerouting to compare the two models.</div>
                </div>
              )}
              {rrOn ? (
                <LineChart
                  title="Representation norms"
                  subtitle="Cf. paper Fig. 12. Dashed is the standard model, solid has circuit breakers."
                  series={[
                    { id: 'n10s', label: 'L10 standard', color: 'var(--s-l10)', dashed: true, values: trace.tokens.map((t) => t.normOrig[10]) },
                    { id: 'n10c', label: 'L10 with CB', color: 'var(--s-l10)', values: trace.tokens.map((t) => t.normCb[10]) },
                    { id: 'n20s', label: 'L20 standard', color: 'var(--s-l20)', dashed: true, values: trace.tokens.map((t) => t.normOrig[20]) },
                    { id: 'n20c', label: 'L20 with CB', color: 'var(--s-l20)', values: trace.tokens.map((t) => t.normCb[20]) },
                  ]}
                  xLabels={labels}
                  upto={upto}
                  yDomain={[0, normMax]}
                  yTicks={normTicks}
                  yFormat={(v) => v.toFixed(0)}
                  markers={markers.filter((m) => m.label !== 'response starts')}
                  selected={selected}
                  onSelect={(i) => {
                    setPinned(i);
                    setPlaying(false);
                  }}
                />
              ) : (
                <div>
                  <div className="chart-title">Representation norms</div>
                  <div className="empty-note">Turn on Representation Rerouting to see the norm blow-up.</div>
                </div>
              )}
              {cfg.hp !== 'off' ? (
                <LineChart
                  title={`Harmfulness probe score (${cfg.hp}, layer ${cfg.probeLayer})`}
                  subtitle="Response tokens only. Generation halts the first time the score crosses the threshold."
                  series={[{ id: 'probe', label: 'Probe score', color: 'var(--s-probe)', values: trace.tokens.map((t) => t.probe) }]}
                  xLabels={labels}
                  upto={upto}
                  yDomain={[0, 1]}
                  yTicks={[0, 0.5, 1]}
                  threshold={{ y: cfg.probeThreshold, label: `halt > ${cfg.probeThreshold.toFixed(2)}` }}
                  markers={markers.filter((m) => m.label !== 'response starts')}
                  selected={selected}
                  onSelect={(i) => {
                    setPinned(i);
                    setPlaying(false);
                  }}
                />
              ) : (
                <div>
                  <div className="chart-title">Harmfulness probe score</div>
                  <div className="empty-note">Choose a linear or MLP probe in the controls to monitor activations.</div>
                </div>
              )}
            </div>
          </div>

          <Compare cfg={cfg} ready={allProbesReady} apply={set} />

          <Explainer attackId={cfg.attackId} />

          <p className="footer">
            Circuit Breaker Lab is an educational simulator. It does not run a language model; token sequences are scripted and every harmful
            continuation is redacted. Representations, rerouting, norms, and probe scores are computed from a small synthetic residual stream built to
            reproduce the qualitative behavior reported by Zou et al. (2024). Paper figures and table values are cited from arXiv:2406.04313v4.
          </p>
        </main>
      </div>
    </TooltipProvider>
  );
}
