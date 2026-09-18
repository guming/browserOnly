import { getSelectionOverlayPosition } from '../../../src/translation/selectionOverlayPosition';

describe('selection translation overlay positioning', () => {
  it('centers the card below the selected text when space is available', () => {
    expect(getSelectionOverlayPosition(
      { left: 100, top: 40, right: 900, bottom: 220, width: 800, height: 180 },
      { width: 480, height: 240 },
      { width: 1200, height: 800 },
    )).toEqual({ left: 260, top: 230 });
  });

  it('places the card above the selection near the bottom edge', () => {
    expect(getSelectionOverlayPosition(
      { left: 80, top: 600, right: 340, bottom: 650, width: 260, height: 50 },
      { width: 340, height: 220 },
      { width: 375, height: 700 },
    )).toEqual({ left: 23, top: 370 });
  });

  it('keeps a fallback card inside a narrow viewport', () => {
    const position = getSelectionOverlayPosition(undefined, { width: 345, height: 300 }, { width: 375, height: 667 });
    expect(position.left).toBe(18);
    expect(position.top).toBe(345);
  });
});
