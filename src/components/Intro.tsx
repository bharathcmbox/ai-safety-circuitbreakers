export function Intro() {
  return (
    <section className="panel intro" aria-labelledby="intro-title">
      <div className="intro-main">
        <h2 id="intro-title">What you’re looking at</h2>
        <p>
          AI chatbots are trained to refuse dangerous requests, like instructions for making a weapon. People keep finding tricks, called{' '}
          <b>jailbreaks</b>, that talk the AI into answering anyway. Each time one is patched, a new one appears.
        </p>
        <p>
          This lab shows a different kind of defense, called a <b>circuit breaker</b>. It doesn’t try to spot the trick. It watches what happens{' '}
          <em>inside</em> the AI while it writes. When the inside starts to look like “about to produce something harmful,” the breaker cuts the
          reply off. Since every trick has to produce that same inner pattern to work, one breaker can stop tricks nobody has seen before.
        </p>
        <div className="analogy">
          <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden="true">
            <rect x="11" y="4" width="18" height="32" rx="3" fill="var(--surface)" stroke="var(--line-strong)" />
            <rect x="14" y="20" width="12" height="13" rx="2" fill="var(--critical)" />
          </svg>
          <p>
            <b>Think of the breaker box in your home.</b> It doesn’t know or care why the current spiked: a faulty toaster, a short, too many heaters.
            It just notices the surge and trips. These AI breakers work the same way, except the “current” is the AI’s internal activity.
          </p>
        </div>
      </div>

      <div className="intro-side">
        <h3>How to use it</h3>
        <ol className="steps">
          <li>
            <b>Pick a request and a trick</b> in the controls panel. Some requests are harmful, some are harmless, and one is a borderline case.
          </li>
          <li>
            <b>Press Play</b> and watch the AI’s reply appear one word at a time. The line under the reply says in plain words what’s going on.
          </li>
          <li>
            <b>Watch the two switches.</b> When one flips to red, that breaker has stopped the reply. Scroll down to see which “neurons” set it
            off.
          </li>
          <li>
            <b>Compare the breakers.</b> Breaker B (the alarm) starts switched off. Press its <b>Turn on</b> button, then switch Breaker A off, to
            watch the alarm catch the same trick by itself.
          </li>
        </ol>
        <h3>Four words you’ll see</h3>
        <dl className="glossary">
          <dt>Token</dt>
          <dd>A word or piece of a word. The AI writes one at a time.</dd>
          <dt>Neuron</dt>
          <dd>One number inside the AI. A specific handful of them light up together when it’s producing harmful content.</dd>
          <dt>Layer</dt>
          <dd>Each word passes through 32 stages in a row. Early layers handle spelling and grammar, middle layers handle meaning.</dd>
          <dt>Attack</dt>
          <dd>A trick for getting past the AI’s safety training.</dd>
        </dl>
      </div>
    </section>
  );
}

/** A short plain-language caption shown above a panel's technical content. */
export function Plain({ children }: { children: React.ReactNode }) {
  return (
    <p className="plain">
      <span className="plain-tag">In plain terms</span>
      {children}
    </p>
  );
}
