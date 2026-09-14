import { createPageTranslationStartMessage } from '../../../src/translation/translationContentScript';

describe('createPageTranslationStartMessage', () => {
  it('replaces the background action with the content-script action', () => {
    expect(createPageTranslationStartMessage(
      { action: 'translatePage', tabId: 42, mode: 'bilingual' },
      { targetLanguage: 'zh-CN', translateTitle: true },
      '42-1000',
    )).toEqual({
      action: 'startPageTranslation',
      tabId: 42,
      mode: 'bilingual',
      targetLanguage: 'zh-CN',
      translateTitle: true,
      pageSessionId: '42-1000',
    });
  });

  it('keeps explicit translation settings while still replacing action', () => {
    const result = createPageTranslationStartMessage(
      { action: 'translatePage', targetLanguage: 'ja', translateTitle: false },
      { targetLanguage: 'zh-CN', translateTitle: true },
      'session',
    );

    expect(result).toMatchObject({
      action: 'startPageTranslation',
      targetLanguage: 'ja',
      translateTitle: false,
    });
  });
});
