import type { StableLocator } from '../workflows/types';

export const MONITOR_DEFAULT_SCHEDULE_MINUTES = 30;
export const MONITOR_MIN_SCHEDULE_MINUTES = 1;
export const MONITOR_MAX_SCHEDULE_MINUTES = 43_200;

export type MonitorKind = 'text' | 'price' | 'stock' | 'page_text';
export type MonitorStatus = 'active' | 'paused' | 'needs_attention';
export type MonitorRunStatus = 'running' | 'unchanged' | 'changed' | 'failed';
export type MonitorRunSource = 'schedule' | 'manual' | 'creation';
export type MonitorErrorCode = 'NAVIGATION_FAILED' | 'PAGE_TIMEOUT' | 'LOCATOR_NOT_FOUND' |
  'MULTIPLE_MATCHES' | 'PARSE_FAILED' | 'AUTH_REQUIRED' | 'CAPTCHA_DETECTED' |
  'TAB_CLOSED' | 'UNKNOWN';

export type MonitorTrigger =
  | { type: 'changed' }
  | { type: 'text_appears'; text: string; caseSensitive: boolean }
  | { type: 'text_disappears'; text: string; caseSensitive: boolean }
  | { type: 'price_decreases' }
  | { type: 'price_increases' }
  | { type: 'price_below'; amount: number; currency?: string }
  | { type: 'price_above'; amount: number; currency?: string }
  | { type: 'back_in_stock' }
  | { type: 'out_of_stock' };

export interface MonitorReadiness { waitForText?: string; }
export interface MonitorNormalization { stockIndicatorMeans?: 'in_stock' | 'out_of_stock'; }

export interface Monitor {
  id: string;
  name: string;
  url: string;
  kind: MonitorKind;
  status: MonitorStatus;
  locator?: StableLocator;
  scheduleMinutes: number;
  trigger: MonitorTrigger;
  normalization: MonitorNormalization;
  readiness: MonitorReadiness;
  lastCheckedAt?: number;
  lastSuccessfulAt?: number;
  nextRunAt?: number;
  consecutiveFailures: number;
  triggerActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export type NormalizedMonitorValue =
  | { type: 'text'; text: string }
  | { type: 'price'; amount: number; currency?: string; qualifier?: 'from' | 'range' | 'exact' }
  | { type: 'stock'; state: 'in_stock' | 'out_of_stock' | 'unknown'; evidence: string };

export interface MonitorSnapshot {
  id: string; monitorId: string; runId: string; observedAt: number; url: string;
  pageTitle: string; kind: MonitorKind; rawValue: string;
  normalizedValue: NormalizedMonitorValue; contentHash: string;
  locatorUsed?: string; screenshotId?: string;
}

export interface MonitorDiff {
  id: string; monitorId: string; runId: string; previousSnapshotId: string;
  currentSnapshotId: string; changed: boolean;
  changeType: 'unchanged' | 'text_changed' | 'appeared' | 'disappeared' |
    'increase' | 'decrease' | 'stock_changed';
  previousValue: NormalizedMonitorValue; currentValue: NormalizedMonitorValue;
  numericDelta?: number; percentDelta?: number; addedText?: string[];
  removedText?: string[]; significance: 'none' | 'low' | 'high'; createdAt: number;
}

export interface MonitorRun {
  id: string; monitorId: string; source: MonitorRunSource; status: MonitorRunStatus;
  startedAt: number; endedAt?: number; snapshotId?: string; diffId?: string;
  errorCode?: MonitorErrorCode; errorMessage?: string;
}

export interface MonitorScreenshot {
  id: string; monitorId: string; snapshotId: string; createdAt: number; data: Blob | string;
}

export type MonitorResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: { code: MonitorErrorCode | 'INVALID_REQUEST'; message: string } };

export interface ElementSelection {
  locator: StableLocator;
  sample: string;
  tagName: string;
  label?: string;
}

