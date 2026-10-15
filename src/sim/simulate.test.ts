import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, simulate, type SimConfig } from './simulate';
import { ATTACKS, SCENARIOS } from './scenarios';

const run = (o: Partial<SimConfig>) => simulate({ ...DEFAULT_CONFIG, ...o });

describe('simulator reproduces the paper qualitatively', () => {
  it('meth + prefilling: undefended model completes, RR breaks the circuit during prefill (Fig. 6)', () => {
    expect(run({ rr: false }).outcome).toBe('harmful-completion');
    const t = run({});
    expect(t.outcome).toBe('circuit-broken');
    expect(t.rrTrip).toBeGreaterThanOrEqual(t.responseStart);
    expect(t.rrTrip).toBeLessThanOrEqual(t.prefillEnd);
    const trip = t.tokens[t.rrTrip + 2];
    expect(trip.cos[5]).toBeGreaterThan(0.9); // layer 5 barely changes
    expect(trip.cos[20]).toBeLessThan(0.3); // layer 20 rerouted
    expect(trip.normCb[20]).toBeGreaterThan(trip.normOrig[20] * 1.8); // norms blow up (Fig. 12)
    expect(t.tokens.at(-1)!.text).toBe('<EOS>');
  });

  it('obfuscated prefill trips during generation, not prefill (App. H, Fig. 11)', () => {
    const t = run({ attackId: 'obfuscation' });
    expect(t.outcome).toBe('circuit-broken');
    expect(t.rrTrip).toBeGreaterThan(t.prefillEnd);
  });

  it('direct request on Llama-3 is refused by refusal training alone', () => {
    expect(run({ attackId: 'direct', rr: false }).outcome).toBe('refused');
  });

  it('RR stops every harmful scenario under every attack', () => {
    for (const s of SCENARIOS.filter((x) => x.kind === 'harmful'))
      for (const a of ATTACKS) {
        const t = run({ scenarioId: s.id, attackId: a.id });
        expect([`${s.id}/${a.id}`, t.outcome]).not.toContain('harmful-completion');
      }
  });

  it('benign and borderline prompts pass at default settings, under RR and HP', () => {
    for (const s of SCENARIOS.filter((x) => x.kind !== 'harmful'))
      for (const hp of ['off', 'linear', 'mlp'] as const) {
        const t = run({ scenarioId: s.id, attackId: 'direct', hp });
        expect([`${s.id}/${hp}`, t.outcome]).toEqual([`${s.id}/${hp}`, 'answered']);
      }
  });

  it('maximum RR sensitivity over-triggers on the borderline prompt', () => {
    const t = run({ scenarioId: 'kill-process', attackId: 'direct', rrConfig: { targetLayers: [10, 20], sensitivity: 1 } });
    expect(t.outcome).toBe('false-positive');
  });

  it('harmfulness probes halt harmful prefills', () => {
    for (const hp of ['linear', 'mlp'] as const) {
      const t = run({ rr: false, hp });
      expect(t.outcome).toBe('probe-halted');
    }
  });
});
