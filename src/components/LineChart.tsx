import { useState } from 'react';
import { fmt, useTip, useWidth } from './ui';

export interface Series {
  id: string;
  label: string;
  color: string;
  dashed?: boolean;
  values: (number | null)[];
}

interface Props {
  title: string;
  subtitle?: string;
  series: Series[];
  xLabels: string[];
  /** only the first `upto` points are drawn (playback) */
  upto: number;
  yDomain: [number, number];
  yTicks: number[];
  yFormat?: (v: number) => string;
  markers?: { x: number; label: string }[];
  threshold?: { y: number; label: string };
  selected?: number;
  onSelect?: (i: number) => void;
  height?: number;
}

const M = { l: 40, r: 12, t: 14, b: 22 };

export function LineChart(p: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const tip = useTip();
  const H = p.height ?? 190;
  const n = Math.max(p.xLabels.length, 2);
  const iw = width - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = (i: number) => M.l + (i / (n - 1)) * iw;
  const y = (v: number) => M.t + (1 - (v - p.yDomain[0]) / (p.yDomain[1] - p.yDomain[0])) * ih;
  const yf = p.yFormat ?? ((v: number) => String(v));

  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    for (let i = 0; i < Math.min(vals.length, p.upto); i++) {
      const v = vals[i];
      if (v == null) {
        pen = false;
        continue;
      }
      const cv = Math.max(p.yDomain[0], Math.min(p.yDomain[1], v));
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(cv).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - M.l) / iw) * (n - 1));
    if (i < 0 || i >= Math.min(n, p.upto)) {
      setHover(null);
      tip(null);
      return;
    }
    setHover(i);
    tip(
      e,
      <div>
        <div className="mono">
          #{i} “{p.xLabels[i]}”
        </div>
        {p.series.map((s) => (
          <div key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <svg width="14" height="8" aria-hidden="true">
              <line x1="0" x2="14" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '3 2' : undefined} />
            </svg>
            {s.label}: <b className="num">{fmt(s.values[i])}</b>
          </div>
        ))}
      </div>,
    );
  };

  // sparse x labels: token index ticks
  const step = Math.max(1, Math.ceil(n / Math.max(4, Math.floor(iw / 60))));
  const xticks: number[] = [];
  for (let i = 0; i < n; i += step) xticks.push(i);

  return (
    <div>
      <div className="chart-title">{p.title}</div>
      {p.subtitle && <div className="muted" style={{ fontSize: 12 }}>{p.subtitle}</div>}
      {p.series.length > 1 && (
        <div className="chart-legend">
          {p.series.map((s) => (
            <span key={s.id}>
              <svg width="18" height="8" aria-hidden="true">
                <line x1="0" x2="18" y1="4" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '4 3' : undefined} />
              </svg>
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div ref={ref}>
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={p.title}
          onMouseMove={onMove}
          onMouseLeave={() => {
            setHover(null);
            tip(null);
          }}
          onClick={() => hover != null && p.onSelect?.(hover)}
          style={{ display: 'block', cursor: p.onSelect ? 'pointer' : undefined }}
        >
          {p.yTicks.map((t) => (
            <g key={t}>
              <line className="grid-line" x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} />
              <text x={M.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11">
                {yf(t)}
              </text>
            </g>
          ))}
          <line className="axis-line" x1={M.l} x2={width - M.r} y1={H - M.b} y2={H - M.b} />
          {xticks.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10">
              {i}
            </text>
          ))}
          {p.markers?.map((m, k) => (
            <g key={k}>
              <line x1={x(m.x)} x2={x(m.x)} y1={M.t} y2={H - M.b} stroke="var(--ink-2)" strokeDasharray="2 3" />
              <text x={x(m.x) + 4} y={M.t + 9 + k * 12} fontSize="10" style={{ fill: 'var(--ink)' }}>
                {m.label}
              </text>
            </g>
          ))}
          {p.threshold && (
            <g>
              <line x1={M.l} x2={width - M.r} y1={y(p.threshold.y)} y2={y(p.threshold.y)} stroke="var(--ink)" strokeDasharray="5 3" strokeWidth="1.2" />
              <text x={width - M.r - 2} y={y(p.threshold.y) - 4} textAnchor="end" fontSize="10" style={{ fill: 'var(--ink)' }}>
                {p.threshold.label}
              </text>
            </g>
          )}
          {p.selected != null && p.selected < p.upto && (
            <line x1={x(p.selected)} x2={x(p.selected)} y1={M.t} y2={H - M.b} stroke="var(--accent)" strokeWidth="1.5" />
          )}
          {p.series.map((s) => (
            <path
              key={s.id}
              d={path(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? '5 4' : undefined}
            />
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} stroke="var(--ink-3)" />
              {p.series.map((s) =>
                s.values[hover] == null ? null : (
                  <circle
                    key={s.id}
                    cx={x(hover)}
                    cy={y(Math.max(p.yDomain[0], Math.min(p.yDomain[1], s.values[hover] as number)))}
                    r="4.5"
                    fill={s.color}
                    stroke="var(--surface)"
                    strokeWidth="2"
                  />
                ),
              )}
            </g>
          )}
        </svg>
      </div>
      <details className="data">
        <summary>Data table</summary>
        <div className="scroll-x" style={{ maxHeight: 220, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th className="n">#</th>
                <th>Token</th>
                {p.series.map((s) => (
                  <th key={s.id} className="n">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.xLabels.slice(0, p.upto).map((t, i) => (
                <tr key={i}>
                  <td className="n">{i}</td>
                  <td className="mono">{t}</td>
                  {p.series.map((s) => (
                    <td key={s.id} className="n">
                      {fmt(s.values[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
