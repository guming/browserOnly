import { check, unknown, norm, equal, pages, visited, fullObservation, sameUrl, url } from './common.mjs';

export function hackerNews(answer, execution) {
  const observed = pages(execution, 'news.ycombinator.com');
  const snapshots = observed.filter(event => event.content.facts?.hn?.complete && event.content.facts.hn.rows?.length);
  const candidate = snapshots.find(event => event.content.facts.hn.rows.some(row => row.title === answer.title && row.score === answer.score)) || snapshots[0];
  if (!candidate) return ['coverage', 'maximum', 'comments'].map(id => unknown(id, '没有完整首页第一页的结构化快照。'));
  const scored = candidate.content.facts.hn.rows.filter(row => Number.isInteger(row.score));
  const maximum = scored.reduce((best, row) => !best || row.score > best.score ? row : best, null);
  if (!maximum) return ['coverage', 'maximum', 'comments'].map(id => unknown(id, '首页没有可比较的分数。'));
  const read = fullObservation(execution, scored.map(row => row.title));
  const commentPage = visited(observed, maximum.commentsUrl);
  const at = Date.parse(answer.observedAt);
  const withinRun = /(?:Z|[+-]\d{2}:\d{2})$/.test(answer.observedAt || '') && Number.isFinite(at) &&
    at >= Date.parse(execution.startedAt) - 5000 && at <= Date.parse(execution.endedAt) + 5000;
  const more = observed.some(event => url(event.url)?.pathname === '/' && Number(url(event.url)?.searchParams.get('p')) > 1);
  return [
    more ? check('coverage', false, '检测到访问 More 分页，题目限制首页第一页。') : read ? check('coverage', true, `完整快照 ${candidate.at}；成功读取工具覆盖所有有分数条目的标题。`) : unknown('coverage', '采集器记录了完整首页，但 Agent 工具返回未证明读取了所有条目。'),
    check('maximum', equal(answer.title, maximum.title) && answer.score === maximum.score, `同次首页最大值：${maximum.title} / ${maximum.score}；并列保留 DOM 首项。`),
    maximum.comments === null ? unknown('comments', '首页未捕获评论数。') : check('comments', answer.comments === maximum.comments && sameUrl(answer.commentsUrl, maximum.commentsUrl) && !!commentPage && norm(commentPage.content.text).includes(norm(maximum.title)) && withinRun,
      `首页评论数 ${maximum.comments}；评论页 ${maximum.commentsUrl}；核对标题与运行区间内含时区时间。`),
  ];
}
