export interface OverlayRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function getSelectionOverlayPosition(
  anchor: OverlayRect | undefined,
  overlay: Pick<OverlayRect, 'width' | 'height'>,
  viewport: { width: number; height: number },
  gap = 10,
): { left: number; top: number } {
  const edge = 12;
  const fallbackAnchor: OverlayRect = {
    left: viewport.width - edge,
    right: viewport.width - edge,
    top: viewport.height - edge,
    bottom: viewport.height - edge,
    width: 0,
    height: 0,
  };
  const target = anchor ?? fallbackAnchor;
  const maxLeft = Math.max(edge, viewport.width - overlay.width - edge);
  const centeredLeft = target.left + target.width / 2 - overlay.width / 2;
  const left = Math.min(Math.max(edge, centeredLeft), maxLeft);

  const below = target.bottom + gap;
  const above = target.top - overlay.height - gap;
  const top = below + overlay.height <= viewport.height - edge
    ? below
    : above >= edge
      ? above
      : Math.max(edge, Math.min(below, viewport.height - overlay.height - edge));

  return { left, top };
}
