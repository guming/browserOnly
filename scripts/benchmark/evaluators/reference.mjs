import { check, unknown, norm, equal, pages, visited, sameUrl, url, clickBetween } from './common.mjs';

export function wikipedia(answer, execution) {
  const observed = pages(execution, 'en.wikipedia.org');
  const person = observed.find(event => url(event.url)?.pathname === '/wiki/Marie_Curie');
  const city = observed.find(event => url(event.url)?.pathname === '/wiki/Warsaw' && person && event.index > person.index);
  const personFacts = observed.find(event => url(event.url)?.pathname === '/wiki/Marie_Curie' && /1867/.test(event.content.text) && /November|11/.test(event.content.text));
  const cityFacts = observed.find(event => url(event.url)?.pathname === '/wiki/Warsaw' && city && event.index >= city.index && event.content.text?.includes('Poland'));
  const personText = norm(personFacts?.content.text);
  const cityText = norm(cityFacts?.content.text);
  return [
    personText.includes('1867') && /November|11/.test(personText) ? check('birth', answer.birthDate === '1867-11-07' && /^(Warsaw|华沙)$/i.test(answer.city), `人物页出生事实，观测 ${personFacts.at}；固定基准 1867-11-07 / Warsaw。`) : unknown('birth', '人物页缺少可用出生日期证据。'),
    cityText.includes('Poland') ? check('country', /^(Poland|波兰)$/i.test(answer.country), `Warsaw 页面包含 Poland，观测 ${cityFacts.at}。`) : unknown('country', '缺少 Warsaw 国家信息观测。'),
    check('two-hop', !!person && !!city && (person.content.links || []).some(link => sameUrl(link.href, city.url)) && clickBetween(execution, person, city) && sameUrl(answer.personUrl, person.url) && sameUrl(answer.cityUrl, city.url),
      '核对人物→城市链接、先后次序、成功点击及两个回答链接。'),
  ];
}

export function cdc(answer, execution) {
  const observed = pages(execution, 'www.chinacdc.cn');
  const detail = observed.find(event => sameUrl(event.url, answer.detailUrl) && /^\/jksj\/jksj04_14249\/\d{6}\/t\d+_\d+\.html$/.test(url(event.url)?.pathname || ''));
  const title = norm(answer.title);
  const period = title.match(/^2026年第0?40周第(\d+)期中国流感监测周报$/);
  const officialText = norm(detail?.content.text);
  const periodResult = !detail ? unknown('period', '未访问回答的官方详情页。') : check('period', !!period && answer.year === 2026 && answer.week === 40 && answer.issue === Number(period?.[1]) && officialText.includes(title) && detail.content.facts?.headings?.some(heading => equal(heading, title)), '核对详情标题及回答年份/周次/期号。');
  const listed = observed.flatMap(event => event.content.facts?.reports || []).find(report => sameUrl(report.url, answer.detailUrl) && equal(report.title, title));
  const dateNearTitle = detail?.content.facts?.publicationDate || listed?.publishedDate;
  return [
    periodResult,
    dateNearTitle ? check('date', answer.publishedDate === dateNearTitle, `官方发布日期：${dateNearTitle}`) : unknown('date', '缺少明确标记的发布日期，不能用正文中的监测日期推断。'),
    !detail ? unknown('links', '没有详情页附件证据。') : check('links', url(answer.pdfUrl)?.hostname === 'www.chinacdc.cn' && /\.pdf$/i.test(url(answer.pdfUrl)?.pathname || '') && (detail.content.links || []).some(link => sameUrl(link.href, answer.pdfUrl)),
      '核对详情页实际提供的官方 PDF 链接；这里只验证附件出处，不检查 PDF 字节。'),
  ];
}

export function arxiv(answer, execution) {
  const observed = pages(execution, 'arxiv.org');
  const search = observed.find(event => {
    const address = url(event.url);
    return address?.pathname.startsWith('/search') && /web[ +]agents/i.test(address.searchParams.get('query') || '') && address.searchParams.get('searchtype') === 'all';
  });
  const papers = Array.isArray(answer.papers) ? answer.papers : [];
  const id = address => url(address)?.pathname.match(/^\/abs\/(\d{4}\.\d{4,5})(?:v\d+)?$/)?.[1];
  const matched = papers.map(paper => observed.find(event => id(event.url) && id(event.url) === id(paper.url) && event.content.facts?.paper?.title));
  const firstDate = source => {
    const value = source.history?.match(/\[v1\]\s*(?:\w{3},\s*)?(\d{1,2}\s+\w{3}\s+\d{4})/)?.[1];
    return value && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(`${value} 00:00:00 GMT`)).toISOString().slice(0, 10) : null;
  };
  const metadata = papers.length === 3 && matched.every(event => event && firstDate(event.content.facts.paper)) ? papers.every((paper, index) => {
    const source = matched[index].content.facts.paper;
    const date = firstDate(source);
    return equal(paper.title, source.title) && date === paper.firstSubmitted && /^2024-\d{2}-\d{2}$/.test(date) &&
      Array.isArray(paper.authors) && paper.authors.length === source.authors.length && paper.authors.every((author, i) => equal(author, source.authors[i]));
  }) : null;
  return [
    search ? check('search', true, `已访问站内 All fields 搜索：${search.url}`) : unknown('search', '未捕获 All fields 搜索 URL；高级搜索等价条件需复核。'),
    papers.length !== 3 || new Set(papers.map(paper => id(paper.url))).size !== 3 || papers.some(paper => !id(paper.url)) ? check('papers', false, '需要 3 个不同的有效 arXiv ID。') : unknown('papers', '论文数量与 ID 可核对，但摘要主题相关性需要语义复核，不能仅靠关键词自动通过。'),
    metadata === null ? unknown('metadata', '缺少三篇摘要页 citation 元数据或 Submission history 的 v1 日期。') : check('metadata', metadata, '逐项比较 citation_title、全部 citation_author、Submission history 的 v1 日期。'),
  ];
}

const mdnPath = '/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted';
export function mdn(answer, execution) {
  const observed = pages(execution, 'developer.mozilla.org').filter(event => url(event.url)?.pathname === mdnPath);
  const source = observed.find(event => !event.content.textTruncated && /returns a new array|new array/i.test(event.content.text));
  const compatibility = observed.map(event => event.content.facts?.compatibility).find(value => value?.chrome && value?.firefox && value?.safari);
  const numeric = typeof answer.comparator === 'string' && /^\(?\s*(\w+)\s*,\s*(\w+)\s*\)?\s*=>\s*\1\s*-\s*\2\s*;?$/.test(answer.comparator);
  return [
    source ? check('behavior', answer.mutatesOriginal === false && numeric && JSON.stringify(answer.sorted) === '[1,2,10,21]' && JSON.stringify(answer.original) === '[1,10,21,2]',
      '根据 MDN 页面和固定数值例子比较，不执行模型生成的代码。') : unknown('behavior', '未捕获完整 toSorted 行为说明。'),
    compatibility ? check('compatibility', ['chrome', 'firefox', 'safari'].every(browser => String(answer[browser]) === compatibility[browser]), `DOM 兼容表：${JSON.stringify(compatibility)}`) : unknown('compatibility', '未捕获可可靠映射到三个桌面浏览器的兼容性表单元格。'),
    check('sources', observed.length > 0 && url(answer.documentUrl)?.hostname === 'developer.mozilla.org' && url(answer.documentUrl)?.pathname === mdnPath && sameUrl(answer.compatibilityUrl, answer.documentUrl) && url(answer.compatibilityUrl)?.hash === '#browser_compatibility', '核对本次文档访问及兼容性章节链接。'),
  ];
}
