import type { WebSessionConnectionState } from '../../../background/types';

export interface WebSessionProviderConfig {
  provider: 'chatgpt-web';
  modelId?: string;
}

export interface WebSessionStatus {
  provider: 'chatgpt-web';
  state: WebSessionConnectionState;
  tabId?: number;
  checkedAt: number;
  message?: string;
}
