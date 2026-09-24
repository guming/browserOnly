import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('PDF viewer reading assistant responsive layout', () => {
  const stylesheet = readFileSync(
    join(process.cwd(), 'public/pdf-text-extract.css'),
    'utf8',
  );

  test('uses a true full-viewport sheet on narrow screens', () => {
    const refinementStart = stylesheet.indexOf(
      '/* BrowserOnly PDF reader refinement.',
    );
    const narrowScreenStart = stylesheet.indexOf(
      '@media (max-width: 560px)',
      refinementStart,
    );
    const narrowScreenEnd = stylesheet.indexOf(
      '@media (max-width: 480px)',
      narrowScreenStart,
    );
    const narrowScreenRules = stylesheet.slice(narrowScreenStart, narrowScreenEnd);

    expect(narrowScreenStart).toBeGreaterThan(-1);
    expect(narrowScreenEnd).toBeGreaterThan(narrowScreenStart);
    expect(narrowScreenRules).toMatch(/#textExtractionPanel\s*\{[\s\S]*?inset:\s*0;/);
    expect(narrowScreenRules).toMatch(/height:\s*100dvh;/);
    expect(narrowScreenRules).toMatch(/box-shadow:\s*none;/);
    expect(narrowScreenRules).toMatch(/\.text-panel-backdrop\s*\{[\s\S]*?inset:\s*0;/);
  });

  test('anchors the desktop panel to the physical right edge', () => {
    const refinementStart = stylesheet.indexOf(
      '/* BrowserOnly PDF reader refinement.',
    );
    const panelStart = stylesheet.indexOf(
      '#textExtractionPanel {',
      refinementStart,
    );
    const panelEnd = stylesheet.indexOf(
      '#textExtractionPanel.open',
      panelStart,
    );
    const refinedPanelRules = stylesheet.slice(panelStart, panelEnd);

    expect(refinementStart).toBeGreaterThan(-1);
    expect(panelStart).toBeGreaterThan(refinementStart);
    expect(panelEnd).toBeGreaterThan(panelStart);
    expect(refinedPanelRules).toMatch(/left:\s*auto;/);
    expect(refinedPanelRules).toMatch(/right:\s*0;/);
    expect(refinedPanelRules).not.toMatch(/right:\s*auto;/);
    expect(refinedPanelRules).not.toMatch(/inset-inline-end:/);
  });
});
