import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TestsListView } from '../../src/testing/TestsListView';
import { TestStore } from '../../src/testing/TestStore';
import { stringifyTestSuite } from '../../src/testing/protocol';

test('website generation is available before any suite exists and uses the current tab URL', async () => {
  const store = { listSuites: jest.fn().mockResolvedValue([]) };
  const getStore = jest.spyOn(TestStore, 'getInstance').mockReturnValue(store as unknown as TestStore);
  (chrome.tabs.query as jest.Mock).mockResolvedValue([{ url: 'https://example.com/products' }]);
  try {
    render(<TestsListView />);
    expect(await screen.findByText('No test suites yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Generate from website' }));
    expect(await screen.findByLabelText('Website URL')).toHaveValue('https://example.com/products');
    expect(screen.getByLabelText('Test goals, one per line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import YAML' })).toBeInTheDocument();
    await waitFor(() => expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true }));
  } finally { getStore.mockRestore(); }
});

test('generated draft is visible and opens the YAML editor before activation', async () => {
  const suite = { suiteId: 'suite-ollama', name: 'ollama.com', site: 'https://ollama.com/', allowedDomains: ['ollama.com'], draftYaml: stringifyTestSuite({ schemaVersion: 1, suiteId: 'suite-ollama', name: 'ollama.com', site: 'https://ollama.com/', allowedDomains: ['ollama.com'], cases: [{ id: 'case-generated-1', name: 'Generated draft needs review', needsReview: true, steps: [{ id: 'step-review', assert: { type: 'text_present', expected: 'Ollama' } }] }] }) };
  const store = { listSuites: jest.fn().mockResolvedValue([suite]), listCases: jest.fn().mockResolvedValue([]), listSuiteRuns: jest.fn().mockResolvedValue([]) };
  const getStore = jest.spyOn(TestStore, 'getInstance').mockReturnValue(store as unknown as TestStore);
  (chrome.runtime as any).getURL = jest.fn((path: string) => `chrome-extension://test/${path}`);
  try {
    render(<TestsListView />);
    const draft = await screen.findByRole('button', { name: 'Generated draft needs review' });
    fireEvent.click(draft);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: expect.stringContaining('caseId=case-generated-1') });
    expect(screen.getByRole('button', { name: 'Run selected 0 cases' })).toBeDisabled();
  } finally { getStore.mockRestore(); }
});

test('invalid assertion draft cases can be removed individually while keeping other cases', async () => {
  const suite: any = {
    suiteId: 'suite-ollama', name: 'ollama.com', site: 'https://ollama.com/', allowedDomains: ['ollama.com'],
    draftYaml: `schemaVersion: 1\nsuiteId: suite-ollama\nname: ollama.com\nsite: https://ollama.com/\nallowedDomains:\n  - ollama.com\ncases:\n  - id: bad-case\n    name: Broken generated case\n    steps:\n      - id: step1\n        assert:\n          type: url_mtat\n          expected: /models\n  - id: keep-case\n    name: Keep this case\n    steps:\n      - id: step1\n        assert:\n          type: text_present\n          expected: Ollama\n`,
  };
  const store: any = {
    getSuite: jest.fn().mockResolvedValue(suite),
    listSuites: jest.fn().mockImplementation(async () => [suite]),
    listCases: jest.fn().mockResolvedValue([]),
    listSuiteRuns: jest.fn().mockResolvedValue([]),
    saveSuiteDraft: jest.fn().mockImplementation(async (_suiteId: string, yaml: string) => { suite.draftYaml = yaml; }),
    deleteCase: jest.fn(),
  };
  const getStore = jest.spyOn(TestStore, 'getInstance').mockReturnValue(store);
  try {
    render(<TestsListView />);
    expect(await screen.findByText('Broken generated case')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete draft Broken generated case' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft Broken generated case' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete case' }));
    await waitFor(() => expect(store.saveSuiteDraft).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText('Broken generated case')).not.toBeInTheDocument());
    expect(screen.getByText('Keep this case')).toBeInTheDocument();
    expect(store.deleteCase).not.toHaveBeenCalled();
  } finally { getStore.mockRestore(); }
});

test('active case deletion requires confirmation and removes it from the active cases', async () => {
  const item: any = { id: 'suite-ollama:active-case', suiteId: 'suite-ollama', name: 'Active case', activeVersionId: 'version-1', updatedAt: 1 };
  const store: any = {
    getSuite: jest.fn().mockResolvedValue({ suiteId: 'suite-ollama', name: 'ollama.com', site: 'https://ollama.com/', allowedDomains: ['ollama.com'] }),
    listSuites: jest.fn().mockResolvedValue([{ suiteId: 'suite-ollama', name: 'ollama.com', site: 'https://ollama.com/', allowedDomains: ['ollama.com'] }]),
    listCases: jest.fn().mockImplementation(async () => item.deleted ? [] : [item]),
    listSuiteRuns: jest.fn().mockResolvedValue([]),
    deleteCase: jest.fn().mockImplementation(async () => { item.deleted = true; }),
  };
  const getStore = jest.spyOn(TestStore, 'getInstance').mockReturnValue(store);
  try {
    render(<TestsListView />);
    expect(await screen.findByText('Active case')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Active case' }));
    expect(store.deleteCase).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete case' }));
    await waitFor(() => expect(store.deleteCase).toHaveBeenCalledWith('suite-ollama', 'active-case'));
    await waitFor(() => expect(screen.queryByText('Active case')).not.toBeInTheDocument());
  } finally { getStore.mockRestore(); }
});

test('run report can be collapsed and expanded', async () => {
  const run: any = { id: 'run-1', suiteId: 'suite-ollama', status: 'completed', concurrency: 1, createdAt: 1, ownerWindowId: 1 };
  const item: any = { id: 'suite-ollama:active-case', suiteId: 'suite-ollama', name: 'Active case', activeVersionId: 'version-1', updatedAt: 1 };
  const caseRun: any = { id: 'case-run-1', suiteRunId: 'run-1', suiteId: 'suite-ollama', caseId: 'active-case', caseVersionId: 'version-1', status: 'passed' };
  const store: any = {
    listSuites: jest.fn().mockResolvedValue([{ suiteId: 'suite-ollama', name: 'ollama.com', site: 'https://ollama.com/', allowedDomains: ['ollama.com'] }]),
    listCases: jest.fn().mockResolvedValue([item]),
    listSuiteRuns: jest.fn().mockResolvedValue([run]),
    listCaseRuns: jest.fn().mockResolvedValue([caseRun]),
    getVersion: jest.fn().mockResolvedValue({ id: 'version-1', version: 1, definition: { id: 'active-case', name: 'Active case', steps: [] } }),
    listStepResults: jest.fn().mockResolvedValue([]),
  };
  const getStore = jest.spyOn(TestStore, 'getInstance').mockReturnValue(store);
  try {
    render(<TestsListView />);
    const summary = await screen.findByText('Run report · completed · 1 cases');
    const report = summary.closest('details');
    expect(report).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(report).toHaveAttribute('open');
    expect(screen.getByRole('combobox', { name: 'Choose test report' })).toBeInTheDocument();
    fireEvent.click(summary);
    expect(report).not.toHaveAttribute('open');
  } finally { getStore.mockRestore(); }
});
