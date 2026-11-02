jest.mock('../../src/background/utils', () => ({ sendUIMessage: jest.fn() }));
import { createStreamingSession } from '../../src/background/streamingManager';
import { sendUIMessage } from '../../src/background/utils';
it('isolates buffers and segment IDs for interleaved tasks', () => {
  const jd = createStreamingSession(), easy = createStreamingSession();
  jd.setStreamingBuffer('京东加入购物车'); jd.incrementSegmentId();
  easy.setStreamingBuffer('MountainCar');
  expect(easy.getCurrentSegmentId()).toBe(0);
  expect(easy.getStreamingBuffer()).toBe('MountainCar');
  easy.resetStreamingState();
  expect(jd.getStreamingBuffer()).toBe('京东加入购物车');
  expect(jd.getCurrentSegmentId()).toBe(1);
  easy.setStreamingBuffer('EasyRL 摘要');
  easy.finalizeStreamingSegment(easy.getCurrentSegmentId(), easy.getStreamingBuffer(), 2, 20);
  expect(sendUIMessage).toHaveBeenCalledWith('finalizeStreamingSegment', { id: 0, content: 'EasyRL 摘要' }, 2, 20);
});
it('does not emit finalized text again when clearing the buffer', () => {
  (sendUIMessage as jest.Mock).mockClear();
  const session = createStreamingSession();
  session.setStreamingBuffer('完整的 Markdown 摘要');
  session.finalizeStreamingSegment(0, session.getStreamingBuffer(), 1, 10);
  session.clearStreamingBuffer(1, 10);
  expect(sendUIMessage).toHaveBeenCalledTimes(1);
  expect(session.getStreamingBuffer()).toBe('');
});
