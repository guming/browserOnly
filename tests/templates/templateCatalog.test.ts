import { TemplateCatalog } from '../../src/templates/TemplateCatalog';
import { instantiateTemplate } from '../../src/templates/templateInstantiation';
describe('TemplateCatalog', () => {
  it('loads four built-in templates', () => { expect(new TemplateCatalog().list()).toHaveLength(4); });
  it('rejects duplicate IDs', () => { const first = new TemplateCatalog().list()[0]; expect(() => new TemplateCatalog([first, first])).toThrow(/Duplicate/); });
  it('creates independent workflows', () => { const template = new TemplateCatalog().list()[0]; const a = instantiateTemplate(template); const b = instantiateTemplate(template); expect(a.workflow.id).not.toBe(b.workflow.id); expect(a.version.source).toBe('template'); a.workflow.name = 'Changed'; expect(template.name).not.toBe('Changed'); });
});
