import { check, unknown, norm, equal, pages, visited, sameUrl, url } from './common.mjs';

function publicationDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:\s*\(UTC\))?$/i.exec(value.trim());
  if (!match) return null;
  const timestamp = Date.parse(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== match[1]) return null;
  return { date: match[1], timestamp, explicitUtc: /\(UTC\)$/i.test(value.trim()) };
}

export function release(answer, execution) {
  const observed = pages(execution, 'github.com');
  const listed = observed.filter(event => url(event.url)?.pathname === '/microsoft/playwright/releases');
  const candidate = listed.flatMap(event => (event.content.facts?.releases || []).filter(item => item.latest && item.stable && item.unambiguous));
  const expected = candidate.find(item => sameUrl(item.url, answer.releaseUrl)) || candidate[0];
  const detail = visited(observed, answer.releaseUrl);
  const results = [];
  results.push(expected ? check('release', equal(answer.version, expected.version) && sameUrl(answer.releaseUrl, expected.url) && !!norm(answer.confirmation),
    `运行时最新正式发布：${expected.version} ${expected.url}`) : unknown('release', '未捕获带 Latest 标记且期次唯一的正式 release 卡片，需复核。'));
  const published = expected?.publishedAt;
  if (published && Number.isFinite(Date.parse(published))) {
    const expectedDate = new Date(published).toISOString().slice(0, 10);
    const parsed = publicationDate(answer.publishedDate);
    if (!parsed) results.push(unknown('date', '日期格式无法可靠解析；应为有效的 YYYY-MM-DD，可附加 (UTC)。'));
    else {
      const difference = Math.abs(parsed.timestamp - Date.parse(`${expectedDate}T00:00:00Z`));
      results.push(parsed.date !== expectedDate && !parsed.explicitUtc && difference === 86400000 ? unknown('date', `官方 published 时间 ${published}；答案日期相差一天且未注明 UTC，需复核时区。`) :
        check('date', parsed.date === expectedDate, `官方卡片 published 时间：${published}（UTC）。`));
    }
  } else results.push(unknown('date', '缺少官方 published 时间。'));
  results.push(check('source', !!detail && url(answer.releaseUrl)?.pathname.startsWith('/microsoft/playwright/releases/tag/'),
    detail ? `已访问 ${detail.url} (${detail.at})` : '回答的 release 详情页未出现在网页观测中。'));
  return results;
}

const requiredQuery = ['is:issue', 'is:open', 'label:bug', 'sort:updated-desc'];
const correctQuery = query => {
  const tokens = norm(query).split(/\s+/);
  return requiredQuery.every(token => tokens.includes(token)) && tokens.every(token => requiredQuery.includes(token) || token === 'repo:microsoft/vscode');
};
export function issues(answer, execution) {
  const observed = pages(execution, 'github.com').filter(event => url(event.url)?.pathname === '/microsoft/vscode/issues');
  const filtered = observed.filter(event => correctQuery(event.content.facts?.query || ''));
  const rows = Array.isArray(answer.issues) ? answer.issues : [];
  const candidates = filtered.map(event => {
    const seen = new Set();
    const items = (event.content.facts?.issueLinks || []).filter(item => {
      if (!norm(item.text) || seen.has(item.href)) return false;
      seen.add(item.href); return true;
    });
    return { event, items };
  }).filter(value => value.items.length >= 5);
  const candidate = candidates.find(value => rows.length === 5 && rows.every((row, index) => sameUrl(row.url, value.items[index]?.href))) || candidates[0];
  // Generic main links may include a pinned issue or sidebar. Do not infer rows from them.
  const structured = candidate?.event.content.facts?.issueRows;
  return [
    filtered.length ? check('filter', correctQuery(answer.query || ''), `页面实际查询：${filtered[0].content.facts.query}`) : unknown('filter', '未捕获精确查询条件，UI 等价筛选需要人工复核。'),
    !Array.isArray(answer.issues) ? unknown('rows', '缺少 issues 结构化列表。') : rows.length !== 5 ? check('rows', false, `需要 5 条，实际回答 ${rows.length} 条；不足 5 条的完整性需人工复核。`) :
      structured?.length >= 5 ? check('rows', rows.every((row, index) => row.number === structured[index].number && equal(row.title, structured[index].title) && sameUrl(row.url, structured[index].url)), '与同次结构化 issue 结果前五项逐项比较。') : unknown('rows', '网页只有通用链接，缺少可靠的 issue 结果行边界；不能把置顶/侧栏链接混入前五项。'),
    structured?.length >= 5 && rows.length === 5 ? check('order', rows.every((row, index) => sameUrl(row.url, structured[index].url) && structured[index].open === true && structured[index].labels?.includes('bug')) && new Set(rows.map(row => row.number)).size === 5,
      '与筛选结果的 DOM 顺序核对，检查重复编号。') : unknown('order', '缺少有可靠行边界的排序结果快照。'),
  ];
}
