import { mapProviderTranslations } from '../../../src/translation/translationMapping';

describe('mapProviderTranslations', () => {
  it('maps numeric provider IDs back to long DOM source IDs', () => {
    const units = [
      { sourceId: '1789354816019-usz0qa3w5qi', text: 'First paragraph' },
      { sourceId: '1789354816020-another', text: 'Second paragraph' },
    ];

    const translations = mapProviderTranslations(units, [
      { sourceId: 1, translation: '第一段' },
      { sourceId: '2', translation: '第二段' },
    ]);

    expect(translations.get('1789354816019-usz0qa3w5qi')).toBe('第一段');
    expect(translations.get('1789354816020-another')).toBe('第二段');
  });

  it('does not attach a missing provider item to the wrong paragraph', () => {
    const units = [
      { sourceId: 'dom-1', text: 'First paragraph' },
      { sourceId: 'dom-2', text: 'Second paragraph' },
    ];

    const translations = mapProviderTranslations(units, [
      { sourceId: '2', translation: '第二段' },
    ]);

    expect(translations.has('dom-1')).toBe(false);
    expect(translations.get('dom-2')).toBe('第二段');
  });
});
