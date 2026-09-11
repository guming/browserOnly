import React from 'react';
import { AboutSection } from '../AboutSection';

function ArrowIcon() { return <span className="arrow-icon" aria-hidden="true">→</span>; }

export function GeneralTab({ onOpenConfiguration }: { onOpenConfiguration?: () => void }) {
  return (
    <div className="general-page">
      <AboutSection />
      <section className="guide-section" aria-labelledby="start-title">
        <div className="section-kicker">Quick start</div>
        <div className="guide-heading-row">
          <div><h2 id="start-title">Get your first task running</h2><p>Three steps are all you need to connect a model and start browsing.</p></div>
          <button className="text-link" type="button" onClick={onOpenConfiguration}>Open configuration <ArrowIcon /></button>
        </div>
        <div className="steps-grid">
          <article className="step-item"><span className="step-number">01</span><h3>Choose a provider</h3><p>Pick Anthropic, OpenAI, DeepSeek, Gemini, or a local Ollama model.</p></article>
          <article className="step-item"><span className="step-number">02</span><h3>Add your credentials</h3><p>Enter an API key in LLM Configuration, then save your settings.</p></article>
          <article className="step-item"><span className="step-number">03</span><h3>Describe the task</h3><p>Open the side panel and try: “Search for the weather in Paris.”</p></article>
        </div>
      </section>
      <section className="notes-section" aria-labelledby="notes-title">
        <div><div className="section-kicker">Good to know</div><h2 id="notes-title">A few operating notes</h2></div>
        <ul className="notes-list"><li>Keep BrowserOnly attached to the active tab while a task is running.</li><li>One BrowserOnly instance can run in each Chrome window.</li><li>Chrome system pages and newly opened tabs cannot be attached.</li></ul>
      </section>
      <footer className="help-footer">
        <div><span className="section-kicker">Need a hand?</span><h2>Join the BrowserOnly community</h2><p>Share workflows, report issues, and get help from other users.</p></div>
        <a className="outline-button" href="https://discord.gg/P3fu9Rhb" target="_blank" rel="noopener noreferrer">Open Discord <ArrowIcon /></a>
      </footer>
    </div>
  );
}
