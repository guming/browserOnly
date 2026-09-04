import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PromptForm } from '../../../src/sidepanel/components/PromptForm';

jest.mock('../../../src/tracking/duckdbService', () => ({
  DuckDBLoadStatus: {
    NotInitialized: 'not_initialized',
    Downloading: 'downloading',
    Ready: 'ready',
    Error: 'error',
  },
  DuckDBService: {
    getInstance: () => ({
      getLoadStatus: jest.fn(() => 'not_initialized'),
      setProgressCallback: jest.fn(),
      init: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

jest.mock('../../../src/sidepanel/components/MultiTabSelector', () => ({
  MultiTabSelector: ({ isVisible, onTabsSelected }: {
    isVisible: boolean;
    onTabsSelected: (tabs: Array<{ id: number; title: string; url: string; selected: boolean }>) => void;
  }) => isVisible ? (
    <button
      type="button"
      onClick={() => onTabsSelected([
        { id: 11, title: 'First tab', url: 'https://example.com/one', selected: true },
        { id: 12, title: 'Second tab', url: 'https://example.com/two', selected: true },
      ])}
    >
      Confirm mock tabs
    </button>
  ) : null,
}));

const renderPromptForm = (onSubmit = jest.fn()) => {
  render(
    <PromptForm
      onSubmit={onSubmit}
      onCancel={jest.fn()}
      isProcessing={false}
      tabStatus="attached"
    />,
  );

  return { onSubmit };
};

const selectRole = (role: string) => {
  fireEvent.change(screen.getByRole('combobox', { name: 'Assistant role' }), {
    target: { value: role },
  });
};

const submitPrompt = (prompt: string) => {
  const textbox = screen.getByRole('textbox');
  fireEvent.change(textbox, { target: { value: prompt } });
  fireEvent.submit(textbox.closest('form')!);
};

describe('PromptForm operator roles', () => {
  it('shows only the five approved roles in the configured order', () => {
    renderPromptForm();

    const roleSelect = screen.getByRole('combobox', { name: 'Assistant role' });
    const options = within(roleSelect).getAllByRole('option');

    expect(options).toHaveLength(5);
    expect(options.map(option => option.getAttribute('value'))).toEqual([
      'operator',
      'notebooklm',
      'researcher',
      'health',
      'wiki',
    ]);
    expect(options.map(option => option.textContent)).toEqual([
      '⚡ Browser Operator',
      '📓 NotebookLM',
      '🔎 Research Analyst',
      '⚕️ Medical Assistant',
      '📖 Wiki Assistant',
    ]);
    expect(screen.queryByText(/Legal Advisor|Mathematics Expert|Code Developer|TestCase Writer/)).not.toBeInTheDocument();
  });

  it('shows NotebookLM options only while NotebookLM is selected', async () => {
    renderPromptForm();

    selectRole('notebooklm');
    expect(await screen.findByRole('button', { name: /Summary/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Study Guide/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /FAQ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mind Map/ })).toBeInTheDocument();

    selectRole('health');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Study Guide/ })).not.toBeInTheDocument();
    });
  });

  it('falls back to Browser Operator for an unsupported operator role', () => {
    renderPromptForm();

    const roleSelect = screen.getByRole('combobox', { name: 'Assistant role' });
    fireEvent.change(roleSelect, { target: { value: 'lawyer' } });

    expect(roleSelect).toHaveValue('operator');
  });

  it.each([
    ['operator', 'operator'],
    ['health', 'health'],
    ['wiki', 'wiki'],
  ])('submits %s using role %s', (selectedRole, expectedRole) => {
    const { onSubmit } = renderPromptForm();

    selectRole(selectedRole);
    submitPrompt('Test prompt');

    expect(onSubmit).toHaveBeenCalledWith('Test prompt', expectedRole, undefined);
  });

  it('submits the selected NotebookLM sub-role', () => {
    const { onSubmit } = renderPromptForm();

    selectRole('notebooklm');
    submitPrompt('Summarize this page');

    expect(onSubmit).toHaveBeenCalledWith('Summarize this page', 'notebooklm-summary', undefined);
  });

  it('keeps research multi-tab selection and passes selected tab IDs', () => {
    const { onSubmit } = renderPromptForm();

    selectRole('researcher');
    expect(screen.getByText('Multi-Tab Analysis')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Select Tabs/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm mock tabs' }));
    fireEvent.submit(screen.getByRole('textbox').closest('form')!);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/one'),
      'researcher',
      [11, 12],
    );
  });

  it('resets the role when switching between modes', async () => {
    renderPromptForm();

    selectRole('health');
    expect(screen.getByRole('combobox', { name: 'Assistant role' })).toHaveValue('health');

    fireEvent.click(screen.getByRole('button', { name: /Ask/ }));
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Assistant role' })).toHaveValue('books');
    });
    expect(screen.getByRole('option', { name: /Ask The Books/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Talk to Charlie Munger/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Operator/ }));
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Assistant role' })).toHaveValue('operator');
    });
  });
});
