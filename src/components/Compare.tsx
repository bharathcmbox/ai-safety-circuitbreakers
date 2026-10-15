import { useMemo } from 'react';
import { ATTACKS, SCENARIOS } from '../sim/scenarios';
import { OUTCOME_INFO, simulate, type Outcome, type SimConfig } from '../sim/simulate';
import { attackLabel } from './Controls';
import { Plain } from './Intro';
import { StatusIcon } from './ui';

const DEFENSES: { id: string; label: string; patch: Partial<SimConfig> }[] = [
  { id: 'none', label: 'Refusal training only', patch: { rr: false, hp: 'off' } },
  { id: 'rr', label: '+ RR', patch: { rr: true, hp: 'off' } },
  { id: 'hpl', label: '+ HP linear', patch: { rr: false, hp: 'linear' } },
  { id: 'hpm', label: '+ HP MLP', patch: { rr: false, hp: 'mlp' } },
  { id: 'both', label: '+ RR + HP MLP', patch: { rr: true, hp: 'mlp' } },
];

const SHORT: Record<Outcome, string> = {
  'harmful-completion': 'Harmful',
  refused: 'Refused',
  'circuit-broken': 'Broken',
  'probe-halted': 'Halted',
  answered: 'Answered',
  'false-positive': 'False +',
  'over-refusal': 'Over-refused',
};

interface Props {
  cfg: SimConfig;
  ready: boolean;
  apply: (patch: Partial<SimConfig>) => void;
}

export function Compare({ cfg, ready, apply }: Props) {
  const scenario = SCENARIOS.find((s) => s.id === cfg.scenarioId)!;
  const attacks = ATTACKS.filter((a) => !(a.id === 'multilingual' && !scenario.translated) && !(a.id === 'obfuscation' && !scenario.obfuscatedPrefill));

  const grid = useMemo(() => {
    if (!ready) return null;
    return attacks.map((a) =>
      DEFENSES.map((d) => {
        const t = simulate({ ...cfg, attackId: a.id, ...d.patch });
        return { outcome: t.outcome, trip: t.rrTrip >= 0 ? t.rrTrip : t.hpTrip };
      }),
    );
  }, [ready, cfg.scenarioId, cfg.model, cfg.rrConfig, cfg.probeLayer, cfg.probeThreshold, cfg.seed]);

  const harmful = scenario.kind === 'harmful';
  const bad = (o: Outcome) => (harmful ? o === 'harmful-completion' : o !== 'answered');
  const currentDefense = DEFENSES.find((d) => d.patch.rr === cfg.rr && d.patch.hp === cfg.hp)?.id;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Every attack against every defense</h2>
        <span className="sub">
          “{scenario.label}” on {cfg.model === 'llama3' ? 'Llama-3' : 'Mistral'} · same settings and seed · click a cell to load it
        </span>
      </div>
      <div className="panel-body scroll-x">
        <Plain>
          The same request tried with every trick against every combination of defenses. A red <b>Harmful</b> means the trick worked. Green means
          the AI refused or a breaker stopped it. Ordinary safety training alone (first column) falls to most tricks, while the breakers stop them
          all.
        </Plain>
        {!grid ? (
          <div className="empty-note">Training probes in your browser…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Attack</th>
                {DEFENSES.map((d) => (
                  <th key={d.id}>{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attacks.map((a, r) => (
                <tr key={a.id} className={a.id === cfg.attackId ? 'current' : ''}>
                  <td>{attackLabel(a.id, cfg.scenarioId)}</td>
                  {grid[r].map((c, k) => {
                    const info = OUTCOME_INFO[c.outcome];
                    const isCurrent = a.id === cfg.attackId && DEFENSES[k].id === currentDefense;
                    return (
                      <td key={k}>
                        <button
                          type="button"
                          className="pill cell-btn"
                          style={isCurrent ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' } : undefined}
                          onClick={() => apply({ attackId: a.id, ...DEFENSES[k].patch })}
                          title={info.detail}
                        >
                          <span className={info.status}>
                            <StatusIcon status={info.status} />
                          </span>
                          {SHORT[c.outcome]}
                          {c.trip >= 0 && <span className="muted mono">@{c.trip}</span>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td>
                  <b>{harmful ? 'Harmful completions' : 'Wrongly blocked'}</b>
                </td>
                {DEFENSES.map((d, k) => {
                  const count = grid.filter((row) => bad(row[k].outcome)).length;
                  return (
                    <td key={d.id} className="mono num">
                      {count} / {attacks.length}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
