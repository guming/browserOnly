import React, { useEffect, useState } from 'react';
import type { Message } from '../types';

export function formatRunDuration(durationMs: number): string {
  const seconds = Math.floor(Math.max(0, durationMs) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
export function RunDuration({ activity }: { activity: NonNullable<Message['activity']> }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (activity.status !== 'running' || activity.startedAt === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activity.status, activity.startedAt]);
  const duration = activity.status === 'running' && activity.startedAt !== undefined
    ? now - activity.startedAt
    : activity.durationMs ?? (activity.endedAt !== undefined && activity.startedAt !== undefined ? activity.endedAt - activity.startedAt : undefined);
  if (duration === undefined) return null;
  return <span title="Total run time including model waiting and tool execution"> · Total {formatRunDuration(duration)}</span>;
}
