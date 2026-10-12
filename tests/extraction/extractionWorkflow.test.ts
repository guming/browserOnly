import { createExtractionWorkflow } from '../../src/extraction/extractionWorkflow';

describe('createExtractionWorkflow', () => {
  it('preserves the confirmed extraction request and adds export plus non-empty assertion', () => {
    const request = { source: 'page' as const, fields: [{ key: 'name', label: 'Name', type: 'text' as const, required: true }], maxRows: 50, outputFormat: 'csv' as const };
    const { workflow, version } = createExtractionWorkflow(request);
    expect(version.steps[0].input).toEqual(request);
    expect(version.steps[1].toolName).toBe('browser_export_data');
    expect(version.finalAssertions[0].type).toBe('download_exists');
    expect(workflow.executionMode).toBe('current_tab');
  });
});
