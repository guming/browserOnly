import { sendUIMessage } from '../../../src/background/utils';

describe('sendUIMessage', () => {
  it('absorbs a closed message channel rejection', async () => {
    (chrome.runtime.sendMessage as jest.Mock).mockRejectedValueOnce(
      new Error('A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received')
    );

    await expect(sendUIMessage('processingComplete', null, 10, 20)).resolves.toBeUndefined();
  });
});
