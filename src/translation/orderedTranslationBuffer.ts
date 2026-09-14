export class OrderedTranslationBuffer<T> {
  private nextOrder = 0;
  private ready = new Map<number, T>();

  complete(order: number, value: T): T[] {
    this.ready.set(order, value);
    const released: T[] = [];
    while (this.ready.has(this.nextOrder)) {
      released.push(this.ready.get(this.nextOrder)!);
      this.ready.delete(this.nextOrder);
      this.nextOrder += 1;
    }
    return released;
  }

  reset(): void {
    this.nextOrder = 0;
    this.ready.clear();
  }
}

export type TranslationUnitState = 'idle' | 'queued' | 'translated' | 'error';

const RETRY_DELAYS_MS = [500, 1500] as const;

export function getTranslationRetryDelay(retryCount: number): number | undefined {
  return RETRY_DELAYS_MS[retryCount];
}

export function resetStateForNewTranslationSession(state: TranslationUnitState): TranslationUnitState {
  return state === 'queued' || state === 'error' ? 'idle' : state;
}
