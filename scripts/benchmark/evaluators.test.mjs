import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, applyEvaluation } from './evaluators/index.mjs';
import { outputContract } from './evaluators/contracts.mjs';

const root = new URL('../../benchmarks/real-web/', import.meta.url);
const suite = JSON.parse(readFileSync(new URL('suite.json', root)));
const jobs = suite.jobs.map(path => JSON.parse(readFileSync(new URL(path, root))));
const startedAt = '2026-11-02T10:00:00+08:00';
const endedAt = '2026-11-02T10:01:00+08:00';
const page = (url, text = '', facts = {}, links = []) => ({ at: startedAt, kind: 'after-tool', url, content: { text, facts, links, textTruncated: false } });
const click = () => ({ kind: 'tool', trace: { toolName: 'browser_click', result: { ok: true, data: 'clicked' } } });
const execution = (index, answer, events) => ({ jobId: jobs[index].id, status: 'completed', startedAt, endedAt, answer: `中文回答\n\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``, events });
const values = result => result.checks.map(check => check.passed);

test('all task contracts omit gold answers and unsupported/old answers remain unverified', () => {
  for (const job of jobs) {
    assert.match(outputContract(job.id), /JSON/);
    const result = evaluate(job, { jobId: job.id, answer: 'I am done', events: [] });
    assert.equal(result.verificationStatus, 'needs_review');
    assert.ok(result.checks.every(check => check.passed === null));
  }
  assert.doesNotMatch(outputContract(jobs[2].id), /1867|Warsaw|Poland/);
});

test('public catalog, news and Maps tasks explicitly require review even if the model declares success', () => {
  for (const job of jobs.slice(7)) {
    const result = evaluate(job, { jobId: job.id, status: 'completed', answer: '{}', events: [] });
    assert.equal(result.verificationStatus, 'needs_review');
    assert.ok(result.checks.every(check => check.passed === null));
    assert.match(outputContract(job.id), /English/);
  }
});

test('release uses observed Latest stable card, published timestamp and actual detail visit', () => {
  const releaseUrl = 'https://github.com/microsoft/playwright/releases/tag/v1.2.3';
  const answer = { version: 'v1.2.3', publishedDate: '2026-10-30', releaseUrl, confirmation: 'Latest and no prerelease badge' };
  const events = [page('https://github.com/microsoft/playwright/releases', '', { releases: [{ url: releaseUrl, version: 'v1.2.3', publishedAt: '2026-10-30T23:00:00Z', stable: true, latest: true, unambiguous: true }] }), page(releaseUrl)];
  assert.deepEqual(values(evaluate(jobs[0], execution(0, answer, events))), [true, true, true]);
  assert.deepEqual(values(evaluate(jobs[0], execution(0, { ...answer, version: 'v9.9.9', publishedDate: '2026-10-31' }, events))), [false, null, true]);
  assert.equal(values(evaluate(jobs[0], execution(0, { ...answer, publishedDate: '2026-01-01' }, events)))[1], false);
  events[0].content.facts.releases[0].stable = false;
  assert.equal(values(evaluate(jobs[0], execution(0, answer, events)))[0], null);
});

test('release date accepts explicit UTC decoration without guessing malformed dates', () => {
  const releaseUrl = 'https://github.com/microsoft/playwright/releases/tag/v1.2.3';
  const events = [page('https://github.com/microsoft/playwright/releases', '', { releases: [{ url: releaseUrl, version: 'v1.2.3', publishedAt: '2026-10-14T11:51:33Z', stable: true, latest: true, unambiguous: true }] }), page(releaseUrl)];
  const dateCheck = publishedDate => evaluate(jobs[0], execution(0, { version: 'v1.2.3', publishedDate, releaseUrl, confirmation: 'Latest' }, events)).checks.find(c => c.id === 'date');
  assert.equal(dateCheck('2026-10-14 (UTC)').passed, true);
  assert.equal(dateCheck('2026-10-14').passed, true);
  assert.equal(dateCheck('2026-10-15 (UTC)').passed, false);
  assert.equal(dateCheck('2026-10-15').passed, null);
  for (const value of ['2026-02-30', '10/14/2026', '2026-10-14 (GMT+8)', null, {}]) {
    const result = dateCheck(value);
    assert.equal(result.passed, null);
    assert.match(result.evidence, /格式/);
  }
});

test('issue checker rejects extra filters and reordered results', () => {
  const rows = [1, 2, 3, 4, 5].map(number => ({ number, title: `Bug ${number}`, url: `https://github.com/microsoft/vscode/issues/${number}`, open: true, labels: ['bug'] }));
  const query = 'is:issue is:open label:bug sort:updated-desc';
  const events = [page(`https://github.com/microsoft/vscode/issues?q=${encodeURIComponent(query)}`, '', { query, issueLinks: rows.map(row => ({ text: row.title, href: row.url })), issueRows: rows })];
  const answer = { query, issues: rows };
  assert.deepEqual(values(evaluate(jobs[1], execution(1, answer, events))), [true, true, true]);
  const reversed = { query, issues: [...rows].reverse() };
  assert.deepEqual(values(evaluate(jobs[1], execution(1, reversed, events))), [true, false, false]);
  events[0].content.facts.query += ' author:someone';
  assert.equal(values(evaluate(jobs[1], execution(1, answer, events)))[0], null);
});

test('Wikipedia requires a real link click and current country rather than historical empire', () => {
  const personUrl = 'https://en.wikipedia.org/wiki/Marie_Curie', cityUrl = 'https://en.wikipedia.org/wiki/Warsaw';
  const answer = { birthDate: '1867-11-07', city: 'Warsaw', country: 'Poland', personUrl, cityUrl };
  const events = [page(personUrl, '7 November 1867', {}, [{ href: cityUrl }]), click(), page(cityUrl, 'Country Poland')];
  assert.deepEqual(values(evaluate(jobs[2], execution(2, answer, events))), [true, true, true]);
  assert.equal(values(evaluate(jobs[2], execution(2, { ...answer, country: 'Russian Empire' }, events)))[1], false);
  assert.equal(values(evaluate(jobs[2], execution(2, answer, events.filter(event => event.kind !== 'tool'))))[2], false);
});

test('a click to the wrong city followed by direct navigation cannot satisfy Wikipedia two-hop', () => {
  const personUrl = 'https://en.wikipedia.org/wiki/Marie_Curie', cityUrl = 'https://en.wikipedia.org/wiki/Warsaw';
  const answer = { birthDate: '1867-11-07', city: 'Warsaw', country: 'Poland', personUrl, cityUrl };
  const events = [page(personUrl, '7 November 1867', {}, [{ href: cityUrl }]), click(),
    page('https://en.wikipedia.org/wiki/Congress_Poland', 'Congress Poland'),
    { kind: 'tool', trace: { toolName: 'browser_navigate_back', result: { ok: true } } },
    page(personUrl, '7 November 1867', {}, [{ href: cityUrl }]),
    { kind: 'tool', trace: { toolName: 'browser_navigate', result: { ok: true } } }, page(cityUrl, 'Country Poland')];
  assert.equal(values(evaluate(jobs[2], execution(2, answer, events)))[2], false);
});

test('Wikipedia facts use loaded observations without replacing the first-arrival navigation evidence', () => {
  const personUrl = 'https://en.wikipedia.org/wiki/Marie_Curie', cityUrl = 'https://en.wikipedia.org/wiki/Warsaw';
  const answer = { birthDate: '1867-11-07', city: 'Warsaw', country: 'Poland', personUrl, cityUrl };
  const events = [page(personUrl, '7 November 1867', {}, [{ href: cityUrl }]), click(), page(cityUrl, ''), page(cityUrl, 'Country Poland')];
  assert.deepEqual(values(evaluate(jobs[2], execution(2, answer, events))), [true, true, true]);
});

test('failed runs retain a parseable attempted answer for diagnosis without changing execution status', () => {
  const personUrl = 'https://en.wikipedia.org/wiki/Marie_Curie', cityUrl = 'https://en.wikipedia.org/wiki/Warsaw';
  const answer = { birthDate: '1867-11-07', city: 'Warsaw', country: 'Poland', personUrl, cityUrl };
  const events = [page(personUrl, '7 November 1867', {}, [{ href: cityUrl }]), page(cityUrl, 'Country Poland')];
  const sample = execution(2, answer, events);
  sample.outputs = [sample.answer, 'Execution stopped: PROTOCOL_ERROR.'];
  sample.answer = 'Execution stopped: PROTOCOL_ERROR.';
  sample.status = 'failed';
  const result = evaluate(jobs[2], sample);
  assert.deepEqual(values(result), [true, true, false]);
  assert.equal(result.answerSource, 'outputs[0]');
  assert.equal(sample.status, 'failed');
});

test('HN compares the entire same snapshot, handles ties and checks comment page', () => {
  const rows = [{ id: '1', title: 'First', score: 3, comments: 2, commentsUrl: 'https://news.ycombinator.com/item?id=1' },
    { id: '2', title: 'Highest', score: 100, comments: 10, commentsUrl: 'https://news.ycombinator.com/item?id=2' },
    { id: '3', title: 'Tie later', score: 100, comments: 2, commentsUrl: 'https://news.ycombinator.com/item?id=3' }];
  const answer = { title: 'Highest', score: 100, comments: 10, commentsUrl: rows[1].commentsUrl, observedAt: startedAt };
  const events = [page('https://news.ycombinator.com/', '', { hn: { complete: true, rows } }),
    { kind: 'tool', trace: { toolName: 'browser_read_text', result: { ok: true, data: 'First Highest Tie later' } } }, page(answer.commentsUrl, 'Highest')];
  assert.deepEqual(values(evaluate(jobs[3], execution(3, answer, events))), [true, true, true]);
  assert.equal(values(evaluate(jobs[3], execution(3, { ...answer, title: 'Tie later' }, events)))[1], false);
  events[1].trace.result.data = 'Highest';
  assert.equal(values(evaluate(jobs[3], execution(3, answer, events)))[0], null);
});

test('CDC checks exact reporting period and official attachment provenance', () => {
  const detailUrl = 'https://www.chinacdc.cn/jksj/jksj04_14249/202610/t20261008_123456.html';
  const pdfUrl = 'https://www.chinacdc.cn/jksj/jksj04_14249/202610/P123456.pdf';
  const title = '2026年第40周第929期中国流感监测周报';
  const answer = { title, year: 2026, week: 40, issue: 929, publishedDate: '2026-10-08', detailUrl, pdfUrl };
  const events = [page(detailUrl, title, { headings: [title], publicationDate: '2026-10-08' }, [{ href: pdfUrl }])];
  assert.deepEqual(values(evaluate(jobs[4], execution(4, answer, events))), [true, true, true]);
  assert.equal(values(evaluate(jobs[4], execution(4, { ...answer, pdfUrl: 'https://example.com/fake.pdf' }, events)))[2], false);
  assert.equal(values(evaluate(jobs[4], execution(4, { ...answer, week: 41 }, events)))[0], false);
  delete events[0].content.facts.publicationDate;
  assert.equal(values(evaluate(jobs[4], execution(4, answer, events)))[1], null);
});

test('arXiv verifies all authors and v1 date but keeps topical relevance for review', () => {
  const papers = ['2401.00001', '2402.00002', '2403.00003'].map((id, i) => ({ title: `Paper ${i}`, authors: ['A', 'B'], firstSubmitted: '2024-03-12', url: `https://arxiv.org/abs/${id}`, relevance: 'Web agent research' }));
  const events = [page('https://arxiv.org/search/?query=web+agents&searchtype=all'), ...papers.map(paper => page(paper.url, '', { paper: { title: paper.title, authors: paper.authors, date: '2025/01/01', history: '[v1] Tue, 12 Mar 2024 00:00:00 UTC' } }))];
  assert.deepEqual(values(evaluate(jobs[5], execution(5, { papers }, events))), [true, null, true]);
  papers[0].authors = ['A'];
  assert.equal(values(evaluate(jobs[5], execution(5, { papers }, events)))[2], false);
  papers[0].url = papers[1].url;
  assert.equal(values(evaluate(jobs[5], execution(5, { papers }, events)))[1], false);
});

test('MDN compares behavior and observed compatibility without executing generated code', () => {
  const documentUrl = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted';
  const answer = { documentUrl, compatibilityUrl: `${documentUrl}#browser_compatibility`, mutatesOriginal: false, comparator: '(a,b)=>a-b', sorted: [1, 2, 10, 21], original: [1, 10, 21, 2], chrome: '110', firefox: '115', safari: '16' };
  const events = [page(documentUrl, 'Returns a new array', { compatibility: { chrome: '110', firefox: '115', safari: '16' } })];
  assert.deepEqual(values(evaluate(jobs[6], execution(6, answer, events))), [true, true, true]);
  assert.equal(values(evaluate(jobs[6], execution(6, { ...answer, comparator: 'process.exit()' }, events)))[0], false);
  delete events[0].content.facts.compatibility;
  assert.equal(values(evaluate(jobs[6], execution(6, answer, events)))[1], null);
});

test('identity, domain restrictions, provenance and human reviews are preserved', () => {
  assert.throws(() => evaluate(jobs[0], { jobId: jobs[1].id }), /identity mismatch/);
  const sample = execution(2, {}, [page('https://example.com/')]);
  const result = evaluate(jobs[2], sample);
  assert.deepEqual(values(result), [false, false, false]);
  assert.match(result.evidenceSha256, /^[a-f0-9]{64}$/);
  const row = { task: jobs[2], outcome: 'reviewed', judgeType: 'manual' };
  assert.equal(applyEvaluation(row, sample), false);
  assert.equal(row.outcome, 'reviewed');
});
