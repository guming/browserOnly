const leases = new Set<number>();

export function acquireWindowTaskLease(windowId: number): boolean {
  if (leases.has(windowId)) return false;
  leases.add(windowId);
  return true;
}

export function releaseWindowTaskLease(windowId: number): void { leases.delete(windowId); }
export function isWindowTaskLeased(windowId: number): boolean { return leases.has(windowId); }
