import { autoRecordRequest } from '../../src/extraction/autoRecordPlan';
import { extractionRequestSchema } from '../../src/extraction/extractionSchema';
import { TemplateCatalog } from '../../src/templates/TemplateCatalog';

it('runs the page-data template with optional columns', () => {
  const template = new TemplateCatalog().get('extract-list')!;
  expect(template.variables[0]).toMatchObject({ key: 'fields', required: false });
  expect(template.version.steps[0].input).toMatchObject({ autoDiscover: true, source: 'page', fields: '{{fields}}' });
});

it('derives table columns and a bounded row selector from current page discovery', () => {
  const request = autoRecordRequest([{ selector: '#orders', sourceKind: 'table', headers: ['Order ID', 'Total'], recordCount: 3, sample: [] }]);
  expect(extractionRequestSchema.parse(request).fields.map(field => field.label)).toEqual(['Order ID', 'Total']);
  expect(request.plan?.itemSelector).toBe('#orders tr:not(:has(th))');
});

it('uses one Record column for repeated cards and reports missing collections', () => {
  expect(autoRecordRequest([{ selector: 'main > article', sourceKind: 'repeated-block', headers: ['Record'], recordCount: 4, sample: [] }]).fields.map(field => field.label)).toEqual(['Record']);
  expect(() => autoRecordRequest([])).toThrow('No repeated table, list, or cards found');
});
