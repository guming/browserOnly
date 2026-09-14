import { useMemo, useState } from 'react';

export type TranslationProvider = 'primary' | 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'openai-compatible' | 'deepseek';

export const translationLanguages = [
  { value: 'zh-CN', label: 'Chinese (Simplified)' }, { value: 'zh-TW', label: 'Chinese (Traditional)' },
  { value: 'en', label: 'English' }, { value: 'ja', label: 'Japanese' }, { value: 'ko', label: 'Korean' },
  { value: 'fr', label: 'French' }, { value: 'de', label: 'German' }, { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' }, { value: 'pt', label: 'Portuguese' }, { value: 'ru', label: 'Russian' },
] as const;

export interface ConfiguredProvider {
  id: Exclude<TranslationProvider, 'primary'>;
  name: string;
}

interface FeaturesTabProps {
  pdfInterceptorEnabled: boolean;
  setPdfInterceptorEnabled: (enabled: boolean) => void;
  translationProvider: TranslationProvider;
  setTranslationProvider: (provider: TranslationProvider) => void;
  targetLanguage: string;
  setTargetLanguage: (language: string) => void;
  primaryProvider: string;
  configuredProviders: ConfiguredProvider[];
}

const providerNames: Record<string, string> = {
  anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini', ollama: 'Ollama',
  'openai-compatible': 'OpenAI Compatible', deepseek: 'DeepSeek',
};

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>;
}

export function FeaturesTab({ pdfInterceptorEnabled, setPdfInterceptorEnabled, translationProvider, setTranslationProvider, targetLanguage, setTargetLanguage, primaryProvider, configuredProviders }: FeaturesTabProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const availableProviderIds = useMemo(() => new Set(configuredProviders.map((item) => item.id)), [configuredProviders]);
  const selectedProviderIsAvailable = translationProvider === 'primary' || availableProviderIds.has(translationProvider);

  const handleSave = () => {
    if (!selectedProviderIsAvailable) return;
    setIsSaving(true);
    setSaveStatus('idle');
    chrome.storage.sync.set({ 'pdf-interceptor-enabled': pdfInterceptorEnabled, translationProvider, targetLanguage }, () => {
      setIsSaving(false);
      if (chrome.runtime.lastError) {
        setSaveStatus('error');
        return;
      }
      setSaveStatus('saved');
      chrome.runtime.sendMessage({ action: 'providerConfigChanged' }).catch(() => undefined);
      window.setTimeout(() => setSaveStatus('idle'), 3000);
    });
  };

  return (
    <div className="features-page">
      <header className="features-header">
        <div>
          <div className="section-kicker">Extension capabilities</div>
          <h1>Features</h1>
          <p>Choose how BrowserOnly handles documents and language tasks.</p>
        </div>
        <div className="feature-count" aria-label="Two configurable features"><span>02</span><small>configurable</small></div>
      </header>

      <div className="feature-list">
        <section className="feature-row" aria-labelledby="pdf-feature-title">
          <div className="feature-index" aria-hidden="true">01</div>
          <div className="feature-copy">
            <div className="feature-title-row">
              <h2 id="pdf-feature-title">PDF viewer</h2>
              <span className={`feature-state ${pdfInterceptorEnabled ? 'is-on' : ''}`}>{pdfInterceptorEnabled ? 'Active' : 'Off'}</span>
            </div>
            <p>Open PDF files in the BrowserOnly viewer for text extraction, Markdown copy, and AI-assisted reading.</p>
          </div>
          <label className="feature-toggle">
            <span className="sr-only">Enable PDF viewer</span>
            <input type="checkbox" className="toggle toggle-primary" checked={pdfInterceptorEnabled} onChange={(event) => setPdfInterceptorEnabled(event.target.checked)} />
          </label>
        </section>

        <section className="feature-row feature-row-expanded" aria-labelledby="translator-feature-title">
          <div className="feature-index" aria-hidden="true">02</div>
          <div className="feature-copy">
            <div className="feature-title-row"><h2 id="translator-feature-title">Translator</h2><span className="feature-state is-on">Ready</span></div>
            <p>Select which of your configured LLM providers handles translation. Credentials and model settings are reused from LLM Configuration.</p>
            <div className="translator-control">
              <label htmlFor="translation-target-language">Target language</label>
              <select id="translation-target-language" className="select select-bordered" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
                {!translationLanguages.some((language) => language.value === targetLanguage) && <option value={targetLanguage}>{targetLanguage}</option>}
                {translationLanguages.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
              </select>
              <label htmlFor="translation-provider">LLM provider</label>
              <select id="translation-provider" className="select select-bordered" value={translationProvider} onChange={(event) => setTranslationProvider(event.target.value as TranslationProvider)}>
                <option value="primary">Follow default provider ({providerNames[primaryProvider] || primaryProvider})</option>
                {configuredProviders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {configuredProviders.length === 0 && <p className="field-note">No dedicated providers are configured yet. Translation will follow the default provider.</p>}
              {!selectedProviderIsAvailable && <p className="field-error" role="alert">This provider is no longer configured. Choose an available provider before saving.</p>}
            </div>
          </div>
        </section>
      </div>

      <footer className="features-savebar">
        <p>Settings are synced with this Chrome profile.</p>
        <div className="save-actions" aria-live="polite">
          {saveStatus === 'saved' && <span className="save-message"><CheckIcon /> Saved</span>}
          {saveStatus === 'error' && <span className="save-message save-error">Could not save settings</span>}
          <button type="button" className="btn btn-primary active:scale-95" onClick={handleSave} disabled={isSaving || !selectedProviderIsAvailable}>
            {isSaving ? <><span className="loading loading-spinner loading-sm" /> Saving</> : 'Save feature settings'}
          </button>
        </div>
      </footer>
    </div>
  );
}
