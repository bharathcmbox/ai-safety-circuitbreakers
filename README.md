# Circuit Breaker Lab

An interactive simulator of **circuit breakers** for LLMs, after Zou et al., *Improving Alignment and Robustness with Circuit Breakers* (2024), [arXiv:2406.04313](https://arxiv.org/abs/2406.04313).

**▶ [Click here to try the simulator](https://bharathcmbox.github.io/ai-safety-circuitbreakers/)**. It runs in your browser, with nothing to install.

You pick a harmful, benign, or borderline request and an attack (prefilling, GCG, multilingual, input-embedding, RepE…). Then you watch tokens stream while two breakers watch the residual stream:

- **Representation Rerouting (RR)** (control). LoRA-style rerouting pushes harmful representations orthogonal to the original at the target layers (10 & 20). Cosine collapses, norms blow up, and the model emits gibberish then `<EOS>` (paper Fig. 6, 12, Algorithm 1).
- **Harmfulness Probe (HP)** (reading). A linear or MLP (64·32) probe, trained in your browser, reads each response token's activation. Generation halts when any token crosses the threshold (paper §4.4, Table 2).

Views: breaker panel and token stream, an 8×8 neuron grid (original vs. circuit-broken, with harm/refusal neurons marked and probe contributions), a layer × token heatmap, cosine/norm/probe charts, an attack × defense outcome matrix, and the paper's Table 1 for reference.

## What it is and isn't

This is a **toy model**: a 32-layer, 64-dim synthetic residual stream with a sparse harm feature and refusal feature. The vector math (cosines, norms, rerouting, probe training and scoring) is real. Token choice is scripted, and all harmful continuations are redacted (`▇▇▇`). It reproduces the paper's *qualitative* behavior. It does not run a real LLM and its outcomes are not the paper's measurements.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # behavior tests (src/sim/simulate.test.ts)
npm run build      # static site in dist/
npm run build:single   # one self-contained HTML file in dist-single/
```

Code layout:

- `src/sim/`: simulation engine (no UI). `model.ts` covers the residual stream and rerouting, `probe.ts` the probes, `scenarios.ts` the requests and attacks, and `simulate.ts` produces a trace per run.
- `src/components/`: React views.

## Deploy

The build is a static site with relative paths, so any static host works.

- **GitHub Pages**: push to a GitHub repo's `main` branch and set *Settings → Pages → Source* to **GitHub Actions**. `.github/workflows/deploy.yml` tests, builds, and publishes on every push.
- **Netlify / Vercel / Cloudflare Pages**: build command `npm run build`, output directory `dist`.
- **Single file**: `npm run build:single` and share `dist-single/index.html`.

## License

MIT. See [LICENSE](LICENSE). The paper is not included in this repo; read it on [arXiv](https://arxiv.org/abs/2406.04313).
