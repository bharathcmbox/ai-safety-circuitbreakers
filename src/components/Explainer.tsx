// Reference numbers transcribed from Zou et al. (2024), Table 1 (attack success rate, %, lower is better).
const TABLE1: { attack: string; ids: string[]; mis: [number, number, number]; llama: [number, number, number] }[] = [
  { attack: 'No attack', ids: ['direct'], mis: [57.8, 16.5, 4.9], llama: [12.4, 1.2, 0.0] },
  { attack: 'Manual', ids: ['manual'], mis: [77.4, 14.2, 6.8], llama: [8.3, 0.0, 0.0] },
  { attack: 'AutoDAN', ids: [], mis: [93.4, 21.1, 0.0], llama: [3.7, 0.0, 0.0] },
  { attack: 'TAP-T', ids: [], mis: [85.8, 68.7, 17.5], llama: [17.4, 2.1, 0.0] },
  { attack: 'PAIR', ids: [], mis: [69.5, 59.9, 23.3], llama: [18.7, 7.5, 0.0] },
  { attack: 'GCG', ids: ['gcg'], mis: [88.7, 7.8, 11.2], llama: [44.5, 2.5, 0.0] },
  { attack: 'Multilingual', ids: ['multilingual'], mis: [34.1, 4.7, 7.3], llama: [19.3, 3.5, 0.0] },
  { attack: 'Prefilling', ids: ['prefill', 'obfuscation'], mis: [95.0, 46.9, 4.9], llama: [84.9, 3.3, 0.0] },
  { attack: 'Input Embed', ids: ['embed'], mis: [92.1, 46.3, 15.7], llama: [80.4, 9.6, 7.9] },
  { attack: 'RepE Attack', ids: ['repe'], mis: [73.7, 30.7, 6.2], llama: [91.2, 8.7, 0.0] },
  { attack: 'Average', ids: [], mis: [76.7, 31.7, 9.8], llama: [38.1, 3.8, 0.8] },
];

const ALGO = `for t = 1 … T:
    x_s ~ D_s,  x_r ~ D_r              # circuit-breaker set, retain set
    c_s = α(1 − t/2T),  c_r = α·t/2T    # coefficient schedule
    L_s = ReLU( cos( rep_M(x_s), rep_Mcb(x_s) ) )   # RR loss
    L_r = ‖ rep_M(x_r) − rep_Mcb(x_r) ‖₂            # retain loss
    L   = c_s·L_s + c_r·L_r`;

export function Explainer({ attackId }: { attackId: string }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>The technical details</h2>
        <span className="sub">
          Zou, Phan, Wang, Duenas, Lin, Andriushchenko, Wang, Kolter, Fredrikson, Hendrycks · arXiv:2406.04313
        </span>
      </div>
      <div className="panel-body">
        <p className="plain">
          <span className="plain-tag">In plain terms</span>
          This section is for readers who want the details from the research paper. The short version: the scramble breaker is taught, during
          training, to wreck its own thinking whenever that thinking looks like harmful content. The alarm is a small separate detector that reads
          the same inner signals. In the paper’s tests, both made the AI far harder to trick (see the table below) while it stayed just as good at
          normal tasks.
        </p>
        <div className="explain">
          <section>
            <h3>The idea</h3>
            <p>
              Refusal training and adversarial training supervise the model’s <em>outputs</em>. Once an attack gets past the initial refusal state,
              the harmful states remain reachable. Circuit breakers act on the <em>internal representations</em> that produce harmful output, so
              they do not need to anticipate the attack.
            </p>
            <p>
              Every jailbreak in this simulator moves the refusal feature or hides the request. None of them can produce harmful text without the
              harm feature showing up in the residual stream. That is the signal both breakers use.
            </p>
          </section>
          <section>
            <h3>Representation Rerouting (control)</h3>
            <p>
              LoRA adapters on layers 0–20 are trained so that, on harmful text, the new representation at the target layers (10 and 20) is
              orthogonal to the original one. On retain data, representations stay put. When a harmful process starts, cosine similarity collapses,
              norms blow up, and the model emits incoherent tokens or <span className="mono">&lt;EOS&gt;</span>.
            </p>
            <div className="algo" role="figure" aria-label="Algorithm 1">
              {ALGO}
            </div>
          </section>
          <section>
            <h3>Harmfulness Probes (reading)</h3>
            <p>
              Instead of changing the model, a probe watches it. A linear or MLP classifier reads every response token’s activation (layer 16 for
              Mistral, the final layer for Llama-3). If any token scores above the threshold, generation halts and a refusal message replaces it.
              Probes work well because they monitor the whole generation, but in the paper they were tested against attackers who did not know
              about the probe.
            </p>
            <h3 style={{ marginTop: 12 }}>What this simulator is</h3>
            <p>
              A toy 32-layer, 64-dimensional residual stream with a sparse harm feature (8 neurons) and refusal feature (6 neurons). Cosines, norms
              and probe scores are computed from real vectors, and the probes are trained in your browser. Token choice is scripted, and harmful
              content is redacted. It shows the mechanism qualitatively. Its outcomes are not the paper’s measurements.
            </p>
          </section>
        </div>

        <h3 style={{ fontSize: 16, margin: '20px 0 4px' }}>Paper results: attack success rate on HarmBench (%)</h3>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
          Table 1 of the paper. Lower is better. The highlighted row matches the attack selected above.
        </p>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Attack</th>
                <th className="n">Mistral refusal-trained</th>
                <th className="n">Mistral adv. trained (R2D2)</th>
                <th className="n">Mistral + RR</th>
                <th className="n">Llama-3 refusal-trained</th>
                <th className="n">Llama-3 + RR</th>
                <th className="n">Cygnet</th>
              </tr>
            </thead>
            <tbody>
              {TABLE1.map((r) => (
                <tr key={r.attack} className={r.ids.includes(attackId) ? 'current' : ''} style={r.attack === 'Average' ? { fontWeight: 600 } : undefined}>
                  <td>{r.attack}</td>
                  {[...r.mis, ...r.llama].map((v, i) => (
                    <td key={i} className="n">
                      {v.toFixed(1)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td>MT-Bench (capability ↑)</td>
                {[7.6, 6.0, 7.53, 8.05, 8.0, 8.21].map((v, i) => (
                  <td key={i} className="n">
                    {v.toFixed(2)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
