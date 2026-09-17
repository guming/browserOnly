import React from 'react';

const providers = ['Anthropic', 'OpenAI', 'Google Gemini', 'DeepSeek', 'Ollama'];

export function AboutSection() {
  return (
    <section className="about-section" aria-labelledby="about-title">
      <div className="section-kicker">Overview</div>
      <div className="about-heading-row">
        <div>
          <h2 id="about-title">About BrowserOnly</h2>
          <p className="about-lede">Browser automation controlled by plain language.</p>
        </div>
        <span className="version-chip">v0.4.6</span>
      </div>
      <div className="about-copy">
        <p>BrowserOnly lets you operate Chrome from the side panel. Describe the task, and the extension turns it into browser actions through your chosen model.</p>
      </div>
      <div className="about-meta" aria-label="BrowserOnly capabilities">
        <div><span className="meta-label">Works with</span><div className="provider-list">{providers.map((provider) => <span key={provider}>{provider}</span>)}</div></div>
        <div><span className="meta-label">Execution</span><span className="meta-value">Playwright</span></div>
        <div><span className="meta-label">License</span><span className="meta-value">Open source</span></div>
      </div>
    </section>
  );
}
