import { LAYERS } from '../sim/model';
import { OUTCOME_INFO, type Trace, type TraceToken } from '../sim/simulate';
import { fmt, StatusIcon, useTip } from './ui';

interface Props {
  trace: Trace;
  upto: number;
  selected: number;
  onSelect: (i: number) => void;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStep: (d: number) => void;
  onScrub: (v: number) => void;
  onRestart: () => void;
  speed: number;
  setSpeed: (s: number) => void;
  onEnableRR: () => void;
  onEnableHP: () => void;
}

function Breaker(props: {
  name: string;
  tech: string;
  detail: string;
  on: boolean;
  tripped: boolean;
  at: number;
  tokText?: string;
  offHint: string;
  onEnable: () => void;
}) {
  const cls = `breaker${!props.on ? ' off' : props.tripped ? ' tripped' : ''}`;
  return (
    <div className={cls} aria-live="polite">
      <div className="lever" aria-hidden="true" />
      <div>
        <div className="name">{props.name}</div>
        <div className="state">
          {!props.on ? `OFF · ${props.offHint}` : props.tripped ? `TRIPPED at word #${props.at} “${props.tokText}”` : 'ON · watching'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{props.detail}</div>
        <div className="muted" style={{ fontSize: 11 }}>
          {props.tech}
        </div>
      </div>
      {!props.on && (
        <button type="button" className="btn enable" onClick={props.onEnable}>
          Turn on
        </button>
      )}
    </div>
  );
}

export function Transcript(p: Props) {
  const { trace } = p;
  const tip = useTip();
  const done = p.upto >= trace.tokens.length;
  const rrTripped = trace.rrTrip >= 0 && trace.rrTrip < p.upto;
  const hpTripped = trace.hpTrip >= 0 && trace.hpTrip < p.upto;
  const info = OUTCOME_INFO[trace.outcome];
  const responseCount = trace.tokens.length - trace.responseStart;
  const shown = Math.max(0, p.upto - trace.responseStart);

  const chip = (t: TraceToken, i: number) => {
    const cls = ['tok', t.role];
    if (t.text.includes('▇')) cls.push('redacted');
    if (t.withheld) cls.push('withheld');
    if (i === trace.rrTrip || i === trace.hpTrip) cls.push('trip');
    if (i === p.selected) cls.push('sel');
    const h = Math.max(0, Math.min(1, t.harmByLayer[20]));
    return (
      <button
        key={i}
        type="button"
        className={cls.join(' ')}
        style={{ ['--h' as string]: t.role === 'gibberish' || t.role === 'eos' ? 0 : h }}
        onClick={() => p.onSelect(i)}
        onMouseMove={(e) =>
          tip(
            e,
            <div>
              <div className="mono">
                #{i} “{t.text}” · {t.role}
              </div>
              {t.text.includes('▇') && <div>Harmful content, redacted by the simulator</div>}
              <div>Harm feature (L20): {fmt(t.harmByLayer[20])}</div>
              {trace.config.rr && <div>Rerouting ρ at last layer: {fmt(t.rho[LAYERS - 1])}</div>}
              {t.probe != null && <div>Probe score: {fmt(t.probe)}</div>}
              {t.withheld && <div>Flagged by the probe; never shown to the user</div>}
            </div>,
          )
        }
        onMouseLeave={() => tip(null)}
        aria-label={`token ${i} ${t.text}`}
      >
        {t.text}
      </button>
    );
  };

  const userToks = trace.tokens.slice(0, trace.responseStart);
  const respToks = trace.tokens.slice(trace.responseStart, p.upto);
  const isAgent = trace.scenario.agent;

  return (
    <div className="panel">
      <div className="strip">
        <Breaker
          name="Breaker A · Scramble"
          detail="Built into the AI. Knocks harmful thinking off course."
          tech="Representation Rerouting (RR)"
          on={trace.config.rr}
          tripped={rrTripped}
          at={trace.rrTrip}
          tokText={trace.tokens[trace.rrTrip]?.text}
          offHint="switch it on in step 2"
          onEnable={p.onEnableRR}
        />
        <Breaker
          name="Breaker B · Alarm"
          detail="A separate watcher. Pulls the plug on a harmful reply."
          tech={trace.config.hp === 'off' ? 'Harmfulness Probe (HP)' : `Harmfulness Probe (${trace.config.hp}, layer ${trace.config.probeLayer})`}
          on={trace.config.hp !== 'off'}
          tripped={hpTripped}
          at={trace.hpTrip}
          tokText={trace.tokens[trace.hpTrip]?.text}
          offHint="pick Linear or MLP in step 3"
          onEnable={p.onEnableHP}
        />
        <div className={`outcome ${done ? info.status : ''}`}>
          <div className="title">
            <StatusIcon status={done ? info.status : 'pending'} />
            {done ? info.label : `Generating… ${shown}/${responseCount}`}
          </div>
          <div className="detail">{done ? info.detail : 'Watch the two switches as the reply streams in.'}</div>
        </div>
      </div>

      <div className="panel-body" style={{ paddingTop: 0 }}>
        <div className="transport">
          {p.playing ? (
            <button type="button" className="btn primary" onClick={p.onPause}>
              ❚❚ Pause
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={done ? p.onRestart : p.onPlay}>
              ▶ {done ? 'Replay' : 'Play'}
            </button>
          )}
          <button type="button" className="btn" onClick={() => p.onStep(-1)} aria-label="Step back one token" disabled={shown <= 0}>
            ◀ Step
          </button>
          <button type="button" className="btn" onClick={() => p.onStep(1)} aria-label="Step forward one token" disabled={done}>
            Step ▶
          </button>
          <input
            className="scrub"
            type="range"
            id="scrub"
            aria-label="Playback position"
            min={trace.responseStart}
            max={trace.tokens.length}
            value={p.upto}
            onChange={(e) => p.onScrub(parseInt(e.target.value, 10))}
          />
          <select id="speed" aria-label="Playback speed" value={p.speed} onChange={(e) => p.setSpeed(parseInt(e.target.value, 10))} style={{ width: 'auto' }}>
            <option value={400}>Slow</option>
            <option value={170}>Normal</option>
            <option value={60}>Fast</option>
          </select>
        </div>

        <div className="turns">
          <div className="turn">
            <div className="who label">User</div>
            <div className="tokens">{userToks.map((t, i) => chip(t, i))}</div>
          </div>
          <div className="turn">
            <div className="who label">{isAgent ? 'Agent' : 'Assistant'}</div>
            <div>
              <div className="tokens">
                {respToks.map((t, k) => chip(t, trace.responseStart + k))}
                {!done && <span className="tok-ghost">▍</span>}
              </div>
              {hpTripped && (
                <div className="halt-msg" role="status">
                  <StatusIcon status="critical" />
                  <div>
                    <b>Generation halted.</b> The harmfulness probe flagged token #{trace.hpTrip} (score {fmt(trace.tokens[trace.hpTrip].probe)} &gt;{' '}
                    {trace.config.probeThreshold}). The user sees: <i>“Sorry, this request was flagged as harmful and I can’t continue.”</i>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <Narration trace={trace} upto={p.upto} />

        <div className="legend-row">
          <span>
            <span className="sw" style={{ background: 'color-mix(in oklab, var(--seq-hi) 50%, transparent)' }} /> darker word = stronger harm signal inside the AI
          </span>
          <span>
            <span className="sw" style={{ outline: '1px dashed var(--line-strong)', outlineOffset: -1, border: 0 }} /> words written by the attacker
          </span>
          <span>
            <span style={{ textDecoration: 'underline dotted var(--accent)' }}>abc</span> trick text
          </span>
          <span>
            <span className="sw" style={{ borderColor: 'var(--critical)' }} /> word where a breaker tripped
          </span>
          <span>▇▇ harmful text, hidden by the simulator</span>
        </div>
      </div>
    </div>
  );
}

function narrate(trace: Trace, upto: number): { text: string; tone: '' | 'alert' | 'ok' } {
  const done = upto >= trace.tokens.length;
  const harmful = trace.scenario.kind === 'harmful';
  const hp = trace.hpTrip >= 0 && trace.hpTrip < upto;
  const rr = trace.rrTrip >= 0 && trace.rrTrip < upto;
  if (hp)
    return {
      tone: harmful ? 'ok' : 'alert',
      text: harmful
        ? `Alarm! At word #${trace.hpTrip} (“${trace.tokens[trace.hpTrip].text}”) the watcher saw the harmful pattern inside the AI and cut the reply off. The person asking only sees a refusal.`
        : `False alarm. The watcher cut off a harmless answer at word #${trace.hpTrip}. Try raising the halt threshold.`,
    };
  if (rr)
    return {
      tone: harmful ? 'ok' : 'alert',
      text: harmful
        ? `Breaker tripped at “${trace.tokens[trace.rrTrip].text}”. The AI’s internal state was knocked off course, so it’s ${done ? 'produced nonsense and stopped' : 'now producing nonsense instead of instructions'}.`
        : `False alarm. The scramble breaker tripped on a harmless answer. Try lowering the sensitivity.`,
    };
  if (upto <= trace.responseStart) return { tone: '', text: 'The AI has read the request and is about to answer.' };
  if (done) {
    if (trace.outcome === 'harmful-completion')
      return {
        tone: 'alert',
        text: 'Nothing stopped it. The trick worked and the harmful answer came through (hidden here). Turn on a breaker in the controls and press Replay.',
      };
    if (trace.outcome === 'refused')
      return { tone: 'ok', text: 'The AI’s ordinary safety training refused, so the breakers didn’t need to act. Try a trick like “Prefilling” to get past it.' };
    if (trace.outcome === 'answered')
      return {
        tone: 'ok',
        text: 'A normal answer, and the breakers stayed quiet. That matters too: a safety system that blocks harmless questions makes the AI useless.',
      };
    return { tone: 'alert', text: 'The AI refused a harmless request.' };
  }
  const t = trace.tokens[upto - 1];
  if (t.role === 'refusal') return { tone: '', text: 'The AI’s ordinary safety training kicked in, and it’s refusing.' };
  const pct = Math.round(Math.max(0, Math.min(1, t.harmByLayer[20])) * 100);
  const who = t.role === 'prefill' ? 'The attacker wrote this word, not the AI. ' : '';
  if (pct >= 35) return { tone: '', text: `${who}The harm signal inside the AI is rising (${pct}% on the harm neurons). The breakers are watching it.` };
  return { tone: '', text: `${who}Writing. The harm signal inside the AI is low (${pct}%).` };
}

function Narration({ trace, upto }: { trace: Trace; upto: number }) {
  const n = narrate(trace, upto);
  return (
    <div className={`narration ${n.tone}`} aria-live="polite">
      <span className="label">What’s happening</span>
      <span>{n.text}</span>
    </div>
  );
}
