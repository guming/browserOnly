import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkflowDetailView } from '../../src/sidepanel/components/WorkflowDetailView';
import { WorkflowStore } from '../../src/workflows';
import type { Workflow, WorkflowVersion } from '../../src/workflows';

const workflow: Workflow = {
  id: 'workflow-1',
  name: 'Search JD',
  description: '',
  schemaVersion: 1,
  status: 'active',
  triggerDomains: ['www.jd.com'],
  variables: [],
  activeVersionId: 'version-1',
  startUrl: 'www.jd.com',
  executionMode: 'new_tab',
  createdAt: 1,
  updatedAt: 1,
};

const version: WorkflowVersion = {
  id: 'version-1',
  workflowId: 'workflow-1',
  version: 1,
  source: 'recording',
  steps: [],
  finalAssertions: [],
  createdAt: 1,
};

describe('WorkflowDetailView', () => {
  it('normalizes a hostname and saves the workflow instead of silently returning', async () => {
    const store = WorkflowStore.getInstance();
    jest.spyOn(store, 'getVersion').mockResolvedValue(version);
    jest.spyOn(store, 'listVersions').mockResolvedValue([version]);
    const saveVersion = jest.spyOn(store, 'saveVersion').mockResolvedValue();
    const saveWorkflow = jest.spyOn(store, 'saveWorkflow').mockResolvedValue();
    const onSaved = jest.fn();

    render(<WorkflowDetailView workflow={workflow} onBack={jest.fn()} onSaved={onSaved} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save version' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save version' }));

    await waitFor(() => expect(saveWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      startUrl: 'https://www.jd.com/',
      executionMode: 'new_tab',
      status: 'active',
    })));
    expect(saveVersion).toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByLabelText('Start URL')).toHaveValue('https://www.jd.com/');
  });

  it('shows a validation error for a non-HTTP URL', async () => {
    const store = WorkflowStore.getInstance();
    jest.spyOn(store, 'getVersion').mockResolvedValue(version);
    jest.spyOn(store, 'listVersions').mockResolvedValue([version]);
    const saveWorkflow = jest.spyOn(store, 'saveWorkflow').mockResolvedValue();

    render(<WorkflowDetailView workflow={workflow} onBack={jest.fn()} onSaved={jest.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save version' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Start URL'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save version' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid HTTP(S) start URL.');
    expect(saveWorkflow).not.toHaveBeenCalled();
  });
});
