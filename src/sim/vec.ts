export type Vec = Float64Array;

export const zeros = (n: number): Vec => new Float64Array(n);

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export const norm = (a: Vec): number => Math.sqrt(dot(a, a));

export function cosine(a: Vec, b: Vec): number {
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot(a, b) / d;
}

/** out = a + s*b (allocates) */
export function axpy(a: Vec, b: Vec, s: number): Vec {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + s * b[i];
  return out;
}

export function scale(a: Vec, s: number): Vec {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * s;
  return out;
}

export function normalize(a: Vec): Vec {
  const n = norm(a);
  return n === 0 ? a : scale(a, 1 / n);
}

/** Component of `a` orthogonal to `b`. */
export function reject(a: Vec, b: Vec): Vec {
  const bb = dot(b, b);
  return bb === 0 ? a : axpy(a, b, -dot(a, b) / bb);
}

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
export const clamp = (x: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, x));
