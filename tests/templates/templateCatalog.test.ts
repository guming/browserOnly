import { TemplateCatalog } from '../../src/templates/TemplateCatalog';
import { instantiateTemplate } from '../../src/templates/templateInstantiation';
describe('TemplateCatalog', () => {
  it('keeps one page-data entry with result downloads', () => {
    const catalog = new TemplateCatalog();
    expect(catalog.list()).toHaveLength(9);
    expect(catalog.get('extract-list')?.output?.downloadableFormats).toEqual(['csv', 'json']);
    expect(catalog.get('page-to-table')).toBeUndefined();
    expect(catalog.get('extract-custom-fields')).toBeUndefined();
    expect(catalog.get('export-page-table')).toBeUndefined();
  });
  it('rejects duplicate IDs', () => { const first = new TemplateCatalog().list()[0]; expect(() => new TemplateCatalog([first, first])).toThrow(/Duplicate/); });
  it('creates independent workflows', () => { const template = new TemplateCatalog().list()[0]; const a = instantiateTemplate(template); const b = instantiateTemplate(template); expect(a.workflow.id).not.toBe(b.workflow.id); expect(a.version.source).toBe('template'); a.workflow.name = 'Changed'; expect(template.name).not.toBe('Changed'); });
  it('allows table templates to discover columns when none are supplied', () => {
    const catalog = new TemplateCatalog();
    for (const id of ['extract-list']) {
      const template = catalog.get(id)!;
      expect(template.variables.find(variable => variable.key === 'fields')?.required).toBe(false);
      expect(template.version.steps[0].input).toMatchObject({ autoDiscover: true, fields: '{{fields}}' });
    }
  });
  it('routes comparisons through selected tabs', () => {
    const catalog = new TemplateCatalog();
    for (const id of ['compare-tabs', 'source-consensus', 'compare-products']) {
      const template = catalog.get(id)!;
      expect(template.version.steps[0].toolName).toBe('browser_compare_selected_tabs');
      expect(template.version.steps[0].input).toMatchObject({ tabs: '{{tabs}}' });
      expect(template.variables.find(variable => variable.key === 'tabs')?.validation?.min).toBe(2);
    }
  });
});
