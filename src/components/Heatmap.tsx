import { LAYERS } from '../sim/model';
import type { Trace } from '../sim/simulate';
import { fmt, seq, useTip, useWidth } from './ui';

export type HeatMetric = 'harm' | 'reroute';

interface Props {
  trace: Trace;
  upto: number;
  metric: HeatMetric;
  selToken: number;
  selLayer: number;
  onSelect: (token: number, layer: number) => void;
}

const LEFT = 34;
const TOP = 6;
const BOTTOM = 18;

export function Heatmap({ trace, upto, metric, selToken, selLayer, onSelect }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const n = trace.tokens.length;
  const cw = Math.max(9, (width - LEFT - 4) / n);
  const ch = 7;
  const W = LEFT + cw * n + 4;
  const H = TOP + ch * LAYERS + BOTTOM;
  const targets = new Set(trace.config.rrConfig.targetLayers);
  const probeLayer = trace.config.hp !== 'off' ? trace.config.probeLayer : -1;

  const value = (t: number, l: number) => {
    const tok = trace.tokens[t];
    return metric === 'harm' ? Math.max(0, Math.min(1, tok.harmByLayer[l])) : Math.max(0, Math.min(1, 1 - tok.cos[l]));
  };

  const cells = [];
  for (let t = 0; t < Math.min(upto, n); t++) {
    for (let l = 0; l < LAYERS; l++) {
      const v = value(t, l);
      cells.push(
        <rect
          key={`${t}-${l}`}
          x={LEFT + t * cw + 0.5}
          y={TOP + (LAYERS - 1 - l) * ch + 0.5}
          width={cw - 1}
          height={ch - 1}
          fill={metric === 'harm' ? seq(v) : seq(v, '--cos-hi', '--cos-lo')}
          onMouseMove={(e) => {
            const tok = trace.tokens[t];
            tip(
              e,
              <div>
                <div className="mono">
                  #{t} “{tok.text}” · layer {l}
                </div>
                <div>Harm feature: {fmt(tok.harmByLayer[l])}</div>
                <div>cos(orig, CB): {fmt(tok.cos[l])}</div>
                <div>
                  ‖rep‖ orig {fmt(tok.normOrig[l], 1)} → CB {fmt(tok.normCb[l], 1)}
                </div>
              </div>,
            );
          }}
          onMouseLeave={() => tip(null)}
          onClick={() => onSelect(t, l)}
          style={{ cursor: 'pointer' }}
        />,
      );
    }
  }

  const yLabels = [0, 5, 10, 15, 20, 25, 31];

  return (
    <div ref={ref} className="scroll-x">
      <svg width={W} height={H} role="img" aria-label={`Layer by token heatmap of ${metric === 'harm' ? 'harm feature' : 'rerouting'}`} style={{ display: 'block' }}>
        <rect x={LEFT} y={TOP} width={cw * n} height={ch * LAYERS} fill="var(--surface-2)" />
        {cells}
        {yLabels.map((l) => (
          <text key={l} x={LEFT - 6} y={TOP + (LAYERS - 1 - l) * ch + ch - 0.5} textAnchor="end" fontSize="10">
            L{l}
          </text>
        ))}
        {[...targets].map((l) => (
          <g key={`t${l}`}>
            <path d={`M${LEFT - 3} ${TOP + (LAYERS - 1 - l) * ch + ch / 2} l-4 -3 v6z`} fill="var(--accent)" />
          </g>
        ))}
        {probeLayer >= 0 && (
          <rect
            x={LEFT - 0.5}
            y={TOP + (LAYERS - 1 - probeLayer) * ch}
            width={cw * n + 1}
            height={ch}
            fill="none"
            stroke="var(--s-probe)"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />
        )}
        {/* selected layer row & token column */}
        <rect x={LEFT - 0.5} y={TOP + (LAYERS - 1 - selLayer) * ch} width={cw * n + 1} height={ch} fill="none" stroke="var(--ink)" strokeWidth="1" />
        {selToken < upto && <rect x={LEFT + selToken * cw} y={TOP - 0.5} width={cw} height={ch * LAYERS + 1} fill="none" stroke="var(--accent)" strokeWidth="1.5" />}
        {trace.responseStart > 0 && (
          <line x1={LEFT + trace.responseStart * cw} x2={LEFT + trace.responseStart * cw} y1={TOP} y2={TOP + ch * LAYERS + 4} stroke="var(--ink-2)" strokeDasharray="2 2" />
        )}
        <text x={LEFT} y={H - 4} fontSize="10">
          prompt →
        </text>
        <text x={LEFT + trace.responseStart * cw + 3} y={H - 4} fontSize="10">
          response →
        </text>
      </svg>
    </div>
  );
}
