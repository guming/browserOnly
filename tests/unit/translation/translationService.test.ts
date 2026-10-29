import { mapProviderTranslations } from '../../../src/translation/translationMapping';

const mockCreateMessage = jest.fn();
jest.mock('../../../src/background/configManager', () => ({
  ConfigManager: { getInstance: () => ({ getProviderConfig: jest.fn().mockResolvedValue({ provider: 'openai', translationProvider: 'primary', apiKey: 'test', apiModelId: 'model' }) }) },
}));
jest.mock('../../../src/models/providers/factory', () => ({ createProvider: jest.fn(async () => ({ createMessage: mockCreateMessage })) }));
jest.mock('../../../src/translation/translationCache', () => ({
  translationCache: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) },
}));
import { translateBatch } from '../../../src/translation/translationService';

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

describe('translateBatch structured response handling', () => {
  beforeEach(() => mockCreateMessage.mockReset());

  const request = {
    pageSessionId: 'page', requestId: 'request', sourceLanguage: 'en', targetLanguage: 'zh', engine: 'auto' as const,
    units: [{ sourceId: 'dom-1', text: 'Hello' }],
  };

  it('accepts case-insensitive JSON code fences', async () => {
    mockCreateMessage.mockImplementation(async function* () {
      yield { type: 'text', text: '```JSON\n[{"sourceId":"1","translation":"你好"}]\n```' };
    });
    const result = await translateBatch(request);
    expect(result[0].translatedText).toBe('你好');
    expect(mockCreateMessage).toHaveBeenCalledTimes(1);
  });

  it('retries malformed JSON once with a corrective instruction', async () => {
    mockCreateMessage
      .mockImplementationOnce(async function* () { yield { type: 'text', text: '[{"sourceId":"1",}]' }; })
      .mockImplementationOnce(async function* () { yield { type: 'text', text: '[{"sourceId":"1","translation":"你好"}]' }; });
    const result = await translateBatch(request);
    expect(result[0].translatedText).toBe('你好');
    expect(mockCreateMessage).toHaveBeenCalledTimes(2);
    expect(mockCreateMessage.mock.calls[1][0]).toContain('Your previous response was invalid');
  });

  it('rejects valid JSON with an invalid response shape after one retry', async () => {
    mockCreateMessage.mockImplementation(async function* () {
      yield { type: 'text', text: '{"sourceId":"1","translation":"你好"}' };
    });
    await expect(translateBatch(request)).rejects.toThrow('Malformed translation response');
    expect(mockCreateMessage).toHaveBeenCalledTimes(2);
  });
});
