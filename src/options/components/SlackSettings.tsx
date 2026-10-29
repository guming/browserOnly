import React, { useEffect, useState } from 'react';

export function SlackSettings() {
  const [enabled, setEnabled] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [channel, setChannel] = useState('auto-web');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    chrome.storage.local.get({ slackMonitorEnabled: false, slackBotToken: '', slackChannel: 'auto-web', slackMonitorLastDelivery: undefined }, result => {
      setEnabled(result.slackMonitorEnabled);
      setBotToken(result.slackBotToken);
      setChannel(result.slackChannel);
      const delivery = result.slackMonitorLastDelivery as { ok?: boolean; error?: string } | undefined;
      if (delivery) setStatus(delivery.ok ? 'Latest monitor message sent to Slack.' : `Latest Slack delivery failed: ${delivery.error ?? 'Unknown error'}`);
      else if (result.slackMonitorEnabled) setStatus('Slack monitor notifications are enabled. Messages are sent when a monitor trigger matches.');
      else if (result.slackBotToken) setStatus('Slack Bot Token is configured, but monitor notifications are disabled. Turn on the switch and save to enable them.');
    });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !changes.slackMonitorLastDelivery) return;
      const delivery = changes.slackMonitorLastDelivery.newValue as { ok?: boolean; error?: string } | undefined;
      setStatus(delivery?.ok ? 'Latest monitor message sent to Slack.' : `Latest Slack delivery failed: ${delivery?.error ?? 'Unknown error'}`);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const save = async () => {
    setBusy(true);
    setStatus('');
    try {
      await chrome.storage.local.set({ slackMonitorEnabled: enabled, slackBotToken: botToken.trim(), slackChannel: channel.trim().replace(/^#/, '') });
      setStatus('Slack Bot settings saved.');
    } catch (error) {
      setStatus(`Could not save settings: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setStatus('Sending test message…');
    try {
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${botToken.trim()}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: channel.trim().replace(/^#/, ''), text: 'BrowserOnly Slack connection test.' }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      setStatus(`Test message sent to #${channel.trim().replace(/^#/, '')}.`);
    } catch (error) {
      setStatus(`Slack test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card bg-base-100 shadow-sm border border-base-300/50">
      <div className="card-body p-4 space-y-3">
        <div>
          <h2 className="card-title text-lg">Slack Monitor Notifications</h2>
          <p className="text-sm text-base-content/70">Send monitor changes to a Slack channel using your Slack Bot Token.</p>
        </div>
        <label className="label cursor-pointer py-1">
          <span className="label-text">Enable Slack notifications</span>
          <input aria-label="Enable Slack notifications" type="checkbox" className="toggle toggle-primary toggle-sm" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
        </label>
        <label className="form-control">
          <span className="label-text text-sm mb-1">Slack Bot Token</span>
          <input aria-label="Slack Bot Token" className="input input-bordered" type="password" autoComplete="off" placeholder="xoxb-…" value={botToken} onChange={event => setBotToken(event.target.value)} />
          <span className="text-xs text-base-content/60 mt-1">Requires the chat:write bot scope. Stored locally in this browser profile.</span>
        </label>
        <label className="form-control">
          <span className="label-text text-sm mb-1">Slack channel</span>
          <div className="join">
            <span className="join-item btn btn-disabled">#</span>
            <input aria-label="Slack channel" className="join-item input input-bordered w-full" value={channel} onChange={event => setChannel(event.target.value)} placeholder="auto-web" />
          </div>
          <span className="text-xs text-base-content/60 mt-1">Invite the bot to this channel before sending.</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || !channel.trim()}>Save Slack settings</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={sendTest} disabled={busy || !botToken.trim() || !channel.trim()}>Send test message</button>
        </div>
        {status && <p role="status" className="text-sm">{status}</p>}
      </div>
    </section>
  );
}
