import React, { useState } from 'react';
import type { Workflow } from '../../workflows/types';

export function WorkflowScheduleControl({ workflow, onUpdated }: { workflow: Workflow; onUpdated?: (workflow: Workflow) => void }) {
  const [frequency, setFrequency] = useState(workflow.schedule?.frequency ?? 'daily');
  const [time, setTime] = useState(workflow.schedule?.time ?? '08:00');
  const [weekday, setWeekday] = useState(workflow.schedule?.weekday ?? 1);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const schedule = workflow.schedule;
  const update = async (operation: 'save' | 'pause' | 'resume') => {
    setBusy(true); setError('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const response = await chrome.runtime.sendMessage({ action: 'workflowSchedule', workflowId: workflow.id, operation,
        ownerTabId: tab?.id, schedule: { frequency, time, weekday } });
      if (!response?.success) throw new Error(response?.error || 'Unable to update schedule.');
      onUpdated?.(response.workflow); setEditing(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const style = 'rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-700';
  return <div className="space-y-2 border-t border-stone-100 pt-2 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-stone-600">{schedule ? `${schedule.frequency} · ${schedule.status === 'needs_attention' ? 'Needs attention' : schedule.status}` : 'Manual run'}</span><div className="flex gap-3"><button type="button" disabled={busy || workflow.status !== 'active'} onClick={() => setEditing(!editing)} className="text-[#315a78] disabled:opacity-50">{schedule ? 'Edit schedule' : 'Schedule'}</button>{schedule && <button type="button" disabled={busy} onClick={() => void update(schedule.status === 'active' ? 'pause' : 'resume')} className="text-[#315a78]">{schedule.status === 'active' ? 'Pause' : 'Resume'}</button>}</div></div>
    {schedule?.nextRunAt && <p className="text-[11px] text-stone-500">Next run: {new Date(schedule.nextRunAt).toLocaleString()}</p>}
    {schedule?.lastError && <p className="break-words text-[11px] text-amber-700">{schedule.lastError}</p>}
    {editing && <div className="space-y-2"><div className="flex flex-wrap gap-2"><select aria-label="Schedule frequency" value={frequency} onChange={event => setFrequency(event.target.value as typeof frequency)} className={style}><option value="hourly">Every hour</option><option value="daily">Every day</option><option value="weekly">Every week</option></select>{frequency !== 'hourly' && <input aria-label="Schedule time" type="time" value={time} onChange={event => setTime(event.target.value)} className={style} />}{frequency === 'weekly' && <select aria-label="Schedule weekday" value={weekday} onChange={event => setWeekday(Number(event.target.value))} className={style}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select>}<button type="button" disabled={busy} onClick={() => void update('save')} className="rounded-md bg-[#315a78] px-2.5 py-1.5 font-semibold text-white disabled:opacity-50">Save schedule</button></div><p className="text-[11px] leading-5 text-stone-500">Uses this computer’s local time. Chrome must stay running. Missed runs merge into one. Approval pauses the schedule; run manually to approve.</p><p className="text-[11px] text-stone-500">Current-page tasks use the tab selected when scheduling.</p></div>}
    {error && <p role="alert" className="break-words text-red-700">{error}</p>}
  </div>;
}
