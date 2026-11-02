import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

const file = new URL('../../src/benchmark/pageEvidence.ts', import.meta.url);
const script = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function collect(html, url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  // jsdom lacks layout-driven innerText; this fixture only tests DOM extraction.
  Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  dom.window.exports = {};
  dom.window.eval(script);
  const result = JSON.parse(JSON.stringify(dom.window.exports.readPageEvidence()));
  dom.window.close();
  return result;
}
test('HN collector preserves DOM order, zero comments and unscored jobs', () => {
  const result = collect(`<table><tr class="athing" id="1"><td class="titleline"><a>Job</a></td></tr><tr><td>apply</td></tr>
    <tr class="athing" id="2"><td class="titleline"><a>Scored</a></td></tr><tr><td><span class="score">20 points</span><a href="item?id=2">discuss</a></td></tr></table><a class="morelink" href="?p=2">More</a>`, 'https://news.ycombinator.com/');
  assert.equal(result.facts.hn.complete, true);
  assert.deepEqual(result.facts.hn.rows.map(row => row.score), [null, 20]);
  assert.equal(result.facts.hn.rows[1].comments, 0);
  assert.equal(result.facts.hn.rows[1].commentsUrl, 'https://news.ycombinator.com/item?id=2');
});
test('GitHub collector separates issue rows from pinned generic links', () => {
  const result = collect(`<main><a href="/microsoft/vscode/issues/999">Pinned</a><div data-testid="list-row"><a href="/microsoft/vscode/issues/1">Real result</a></div></main>`, 'https://github.com/microsoft/vscode/issues?q=is%3Aopen');
  assert.equal(result.facts.issueLinks.length, 2);
  assert.equal(result.facts.issueRows.length, 1);
  assert.equal(result.facts.issueRows[0].number, 1);
});
test('current GitHub release sections expose Latest and published time independently of notes', () => {
  const result = collect(`<section data-release-anchor="release-v1.2.3"><h2>v1.2.3</h2><span><a href="/microsoft/playwright/releases/tag/v1.2.3">v1.2.3</a></span><a href="/microsoft/playwright/releases/latest"><span class="Label">Latest</span></a><relative-time datetime="2026-10-30T23:00:00Z"></relative-time><p>Fixed a prerelease bug.</p></section>`, 'https://github.com/microsoft/playwright/releases');
  assert.equal(result.facts.releases[0].stable, true);
  assert.equal(result.facts.releases[0].latest, true);
  assert.equal(result.facts.releases[0].unambiguous, true);
  assert.equal(result.facts.releases[0].publishedAt, '2026-10-30T23:00:00Z');
});
test('arXiv stores all author meta tags and submission history', () => {
  const result = collect('<meta name="citation_title" content="Paper"><meta name="citation_author" content="A"><meta name="citation_author" content="B"><meta name="citation_date" content="2024/03/12"><div class="submission-history">[v1] Tue, 12 Mar 2024</div>', 'https://arxiv.org/abs/2403.00001');
  assert.deepEqual(result.facts.paper.authors, ['A', 'B']);
  assert.match(result.facts.paper.history, /\[v1\]/);
});
test('CDC publication date requires an explicit label; monitoring dates are ignored', () => {
  assert.equal(collect('<body>截至2026-10-04</body>', 'https://www.chinacdc.cn/').facts.publicationDate, null);
  assert.equal(collect('<body>发布日期：2026-10-08</body>', 'https://www.chinacdc.cn/').facts.publicationDate, '2026-10-08');
});
test('MDN does not infer compatibility from Baseline text', () => {
  const result = collect('<body>Baseline July 2023</body>', 'https://developer.mozilla.org/en-US/');
  assert.deepEqual(result.facts.compatibility, {});
});
test('MDN extracts desktop versions from loaded Shadow DOM, excluding Android', () => {
  const dom = new JSDOM('<mdn-compat-table-lazy></mdn-compat-table-lazy>', { url: 'https://developer.mozilla.org/en-US/', runScripts: 'outside-only' });
  dom.window.exports = {};
  dom.window.eval(script);
  const shadow = dom.window.document.querySelector('mdn-compat-table-lazy').attachShadow({ mode: 'open' });
  shadow.innerHTML = `<table class="bc-table"><tbody><tr><th>toSorted</th>${[['chrome', '110'], ['firefox', '115'], ['safari', '16'], ['chrome_android', '999']].map(([browser, version]) => `<td class="bc-browser-${browser} bc-supports-yes"><span class="bc-support-level">Full support</span><span class="bc-version-label">${version}</span></td>`).join('')}</tr></tbody></table>`;
  const result = dom.window.exports.readPageEvidence();
  assert.deepEqual(JSON.parse(JSON.stringify(result.facts.compatibility)), { chrome: '110', firefox: '115', safari: '16' });
  dom.window.close();
});
