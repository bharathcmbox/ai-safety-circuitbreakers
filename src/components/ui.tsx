import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// ---------- tooltip ----------
type TipFn = (e: { clientX: number; clientY: number } | null, content?: ReactNode) => void;
const TipCtx = createContext<TipFn>(() => {});
export const useTip = () => useContext(TipCtx);

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  const show = useCallback<TipFn>((e, content) => {
    if (!e || content == null) setTip(null);
    else setTip({ x: e.clientX, y: e.clientY, content });
  }, []);
  const flipX = tip && tip.x > window.innerWidth - 280;
  return (
    <TipCtx.Provider value={show}>
      {children}
      {tip && (
        <div
          className="tooltip"
          role="tooltip"
          style={{ left: flipX ? undefined : tip.x + 14, right: flipX ? window.innerWidth - tip.x + 14 : undefined, top: tip.y + 14 }}
        >
          {tip.content}
        </div>
      )}
    </TipCtx.Provider>
  );
}

// ---------- element width ----------
export function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// ---------- status icons (status color never carries meaning alone) ----------
export function StatusIcon({ status }: { status: 'good' | 'warning' | 'critical' | 'pending' }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', className: 'status-ico', 'aria-hidden': true } as const;
  if (status === 'good')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M4.5 8.2 7 10.6l4.6-5" stroke="var(--surface)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    );
  if (status === 'warning')
    return (
      <svg {...common}>
        <path d="M8 1.5 15 14H1z" fill="currentColor" />
        <path d="M8 6v3.6" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="11.8" r="1" fill="var(--surface)" />
      </svg>
    );
  if (status === 'critical')
    return (
      <svg {...common}>
        <path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill="currentColor" />
        <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2.2" />
    </svg>
  );
}

// ---------- color helpers (CSS color-mix so both themes resolve from tokens) ----------
export const seq = (t: number, hi = '--seq-hi', lo = '--seq-lo') =>
  `color-mix(in oklab, var(${hi}) ${Math.round(Math.min(1, Math.max(0, t)) * 100)}%, var(${lo}))`;

export const div = (t: number) => {
  const c = Math.max(-1, Math.min(1, t));
  const pct = Math.round(Math.abs(c) * 100);
  return `color-mix(in oklab, var(${c < 0 ? '--div-neg' : '--div-pos'}) ${pct}%, var(--div-mid))`;
};

export const fmt = (x: number | null | undefined, d = 2) => (x == null || Number.isNaN(x) ? '–' : x.toFixed(d));

export function Slider(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="slider">
      <label htmlFor={props.id}>{props.label}</label>
      <output htmlFor={props.id}>{props.format ? props.format(props.value) : props.value}</output>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export function Seg<T extends string | number>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === props.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
