const element = id => document.getElementById(id);
const dateTime = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const timeOnly = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' });

function showError(message) {
  element('loading').hidden = true;
  element('content').hidden = true;
  element('error-message').textContent = message;
  element('error').hidden = false;
}

function formatValue(value) {
  if (value.type === 'price') {
    const symbol = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥', KRW: '₩' }[value.currency] || `${value.currency || ''} `;
    return `${symbol}${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value.amount)}`;
  }
  if (value.type === 'stock') return { in_stock: '有货', out_of_stock: '缺货', unknown: '无法判断' }[value.state] || value.state;
  return value.text;
}

function contentLines(snapshot) {
  const text = snapshot.rawValue || formatValue(snapshot.normalizedValue);
  const sourceLines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const lines = sourceLines.flatMap(line => {
    if (line.length <= 180) return [line];
    const sentences = [...new Intl.Segmenter('zh-CN', { granularity: 'sentence' }).segment(line)]
      .map(item => item.segment.trim()).filter(Boolean);
    return sentences.flatMap(sentence => sentence.length <= 180
      ? [sentence]
      : sentence.match(/[\s\S]{1,180}/g) || []);
  });
  return { lines: lines.slice(0, 120), truncated: lines.length > 120 || text.length >= 20000 };
}

/** Mark changed lines while keeping the original line order in each column. */
function compareLines(before, after) {
  const n = before.length, m = after.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const oldRows = [], newRows = [];
  let i = 0, j = 0, removed = 0, added = 0;
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) {
      oldRows.push({ text: before[i], changed: false });
      newRows.push({ text: after[j], changed: false });
      i++; j++;
    } else if (i < n && (j === m || lcs[i + 1][j] >= lcs[i][j + 1])) {
      oldRows.push({ text: before[i++], changed: true }); removed++;
    } else {
      newRows.push({ text: after[j++], changed: true }); added++;
    }
  }
  return { oldRows, newRows, removed, added };
}

function renderRows(container, rows, className) {
  container.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '没有可显示的内容';
    container.append(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const p = document.createElement('p');
    if (row.changed) p.className = className;
    p.textContent = row.text;
    fragment.append(p);
  }
  container.append(fragment);
}

function addCount(label, className) {
  const badge = document.createElement('span');
  badge.className = className;
  badge.textContent = label;
  element('change-count').append(badge);
}

function renderScreenshot(container, data) {
  container.replaceChildren();
  if (typeof data !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/i.test(data)) {
    container.textContent = '没有保存这次的截图';
    return;
  }
  const image = document.createElement('img');
  image.src = data;
  image.alt = '检查时保存的网页截图';
  container.append(image);
}

function render(payload) {
  const { monitor, diff, before, after, beforeScreenshot, afterScreenshot } = payload;
  const beforeDate = new Date(before.observedAt);
  const afterDate = new Date(after.observedAt);
  element('context-name').textContent = monitor.name;
  element('context-time').textContent = dateTime.format(afterDate);
  element('title').textContent = `${monitor.name}${diff.changed ? '有变化' : '没有变化'}`;
  element('before-time').textContent = timeOnly.format(beforeDate);
  element('after-time').textContent = timeOnly.format(afterDate);
  element('time-range').textContent = `${dateTime.format(beforeDate)} → ${dateTime.format(afterDate)}`;
  const source = element('source');
  try {
    const sourceUrl = new URL(after.url);
    if (!['http:', 'https:'].includes(sourceUrl.protocol)) throw new Error('Unsupported source URL');
    source.textContent = sourceUrl.href;
    source.href = sourceUrl.href;
  } catch {
    source.hidden = true;
  }
  document.title = `${monitor.name} · 监控对比 · BrowserOnly`;

  const oldValue = before.normalizedValue;
  const newValue = after.normalizedValue;
  if (oldValue.type === 'text' && newValue.type === 'text') {
    const oldText = contentLines(before);
    const newText = contentLines(after);
    const comparison = compareLines(oldText.lines, newText.lines);
    renderRows(element('before-content'), comparison.oldRows, 'removed');
    renderRows(element('after-content'), comparison.newRows, 'added');
    element('summary').textContent = !diff.changed ? '两次检查的内容一致。'
      : comparison.added || comparison.removed ? `监控内容新增 ${comparison.added} 行，删除 ${comparison.removed} 行。`
        : '内容发生变化，但变化位置超出当前可展示的快照范围。';
    if (comparison.added) addCount(`+${comparison.added} 新增`, 'plus');
    if (comparison.removed) addCount(`−${comparison.removed} 删除`, 'minus');
    element('truncation-note').hidden = !oldText.truncated && !newText.truncated;
  } else {
    const oldText = formatValue(oldValue);
    const newText = formatValue(newValue);
    renderRows(element('before-content'), [{ text: oldText, changed: false }], 'removed');
    renderRows(element('after-content'), [{ text: newText, changed: false }], 'added');
    element('before-content').firstElementChild.classList.add('value', 'old');
    element('after-content').firstElementChild.classList.add('value', 'new');
    element('summary').textContent = diff.changed ? `${oldText} → ${newText}` : '两次检查的结果一致。';
    if (typeof diff.numericDelta === 'number') {
      const sign = diff.numericDelta > 0 ? '+' : '';
      addCount(`${sign}${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(diff.numericDelta)}`, diff.numericDelta > 0 ? 'plus' : 'minus');
    }
  }

  if (beforeScreenshot || afterScreenshot) {
    element('evidence').hidden = false;
    renderScreenshot(element('before-image'), beforeScreenshot);
    renderScreenshot(element('after-image'), afterScreenshot);
  }
  element('loading').hidden = true;
  element('content').hidden = false;
}

async function load() {
  const query = new URLSearchParams(location.search);
  const monitorId = query.get('monitorId');
  const diffId = query.get('diffId');
  if (!monitorId || !diffId) return showError('请从监控历史或变化通知中打开对比页。');
  try {
    const response = await chrome.runtime.sendMessage({ action: 'monitorCompareGet', monitorId, diffId });
    if (!response?.success) throw new Error(response?.error?.message || '无法读取变化记录');
    render(response.data);
  } catch (error) {
    showError(error instanceof Error ? error.message : '无法读取变化记录');
  }
}

load();
