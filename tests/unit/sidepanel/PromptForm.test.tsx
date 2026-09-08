import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PromptForm } from '../../../src/sidepanel/components/PromptForm';

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
      'Browser Operator',
      'NotebookLM',
      'Research Analyst',
      'Medical Assistant',
      'Wiki Assistant',
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

  it('resets the operator role after returning from Ask mode', async () => {
    renderPromptForm();

    selectRole('health');
    expect(screen.getByRole('combobox', { name: 'Assistant role' })).toHaveValue('health');

    fireEvent.click(screen.getByRole('button', { name: /Ask/ }));
    await waitFor(() => {
      expect(screen.queryByRole('combobox', { name: 'Assistant role' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Build the Life You Want.*Change book/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Operator/ }));
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Assistant role' })).toHaveValue('operator');
    });
  });
});

describe('PromptForm Ask The Books mode', () => {
  const openAskMode = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  };

  it('shows only Operator and Ask modes', () => {
    renderPromptForm();

    const modeNavigation = screen.getByRole('navigation', { name: 'Mode' });
    expect(within(modeNavigation).getAllByRole('button').map(button => button.textContent)).toEqual([
      'Operator',
      'Ask',
    ]);
    expect(screen.queryByRole('button', { name: /Data Analyze/ })).not.toBeInTheDocument();
  });

  it('keeps the selected book guide collapsed until requested', () => {
    renderPromptForm();
    openAskMode();

    expect(screen.queryByText(/Your current situation or specific challenges/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'What to include?' }));
    expect(screen.getByText(/Ready to begin\? Share:/)).toBeInTheDocument();
    expect(screen.getByText(/Your current situation or specific challenges/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide help' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('updates the guide after selecting another book', async () => {
    renderPromptForm();
    openAskMode();

    fireEvent.click(screen.getByRole('button', { name: /Build the Life You Want.*Change book/ }));
    const search = screen.getByRole('searchbox', { name: 'Search by title or author' });
    fireEvent.change(search, { target: { value: 'Deep Work' } });
    fireEvent.click(screen.getByRole('button', { name: /Deep Work.*Cal Newport/ }));
    fireEvent.click(screen.getByRole('button', { name: 'What to include?' }));

    expect(await screen.findByText(/Ready to master focus\? Share:/)).toBeInTheDocument();
    expect(screen.getByText(/What type of work or study requires your deepest focus\?/)).toBeInTheDocument();
  });

  it('submits with the selected book role', async () => {
    const { onSubmit } = renderPromptForm();
    openAskMode();

    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Assistant role' })).not.toBeInTheDocument());
    submitPrompt('I want to improve my work habits');

    expect(onSubmit).toHaveBeenCalledWith(
      'I want to improve my work habits',
      'books-happinessBook',
      undefined,
      'standalone',
    );
  });

  it('disables Ask interactions while processing', () => {
    render(
      <PromptForm
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        isProcessing
        tabStatus="attached"
      />,
    );

    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();
  });

  it('offers Experts in Ask mode and defaults to Munger', () => {
    renderPromptForm();
    openAskMode();

    expect(screen.getByRole('button', { name: 'Books' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Experts' }));

    expect(screen.getByText('Charlie Munger')).toBeInTheDocument();
    expect(screen.queryByText(/The decision, problem, or belief/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'What to include?' }));
    expect(screen.getByText(/To get a useful answer, share:/)).toBeInTheDocument();
    expect(screen.getByText(/The decision, problem, or belief/)).toBeInTheDocument();
    expect(screen.getByText(/constraints, alternatives, and outcome/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Assistant role' })).not.toBeInTheDocument();
  });

  it('submits Munger prompts with the munger role', () => {
    const { onSubmit } = renderPromptForm();
    openAskMode();
    fireEvent.click(screen.getByRole('button', { name: 'Experts' }));

    submitPrompt('Should I change direction?');

    expect(onSubmit).toHaveBeenCalledWith('Should I change direction?', 'munger', undefined, 'current-tab');
  });

  it('lets expert conversations ignore the current tab', () => {
    const { onSubmit } = renderPromptForm();
    openAskMode();
    fireEvent.click(screen.getByRole('button', { name: 'Experts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Standalone' }));

    submitPrompt('Talk through this idea with me');

    expect(onSubmit).toHaveBeenCalledWith('Talk through this idea with me', 'munger', undefined, 'standalone');
  });

  it('keeps book conversations standalone', () => {
    const { onSubmit } = renderPromptForm();
    openAskMode();

    expect(screen.getByText('Standalone')).toHaveAttribute('title', 'Book conversations do not use browser tab content');
    expect(screen.queryByRole('group', { name: 'Expert context' })).not.toBeInTheDocument();
    submitPrompt('Apply this book to my situation');

    expect(onSubmit).toHaveBeenCalledWith('Apply this book to my situation', 'books-happinessBook', undefined, 'standalone');
  });

  it.each([
    ['Howard Marks', 'marks', 'The financial decision or market situation'],
    ['Bill Kovach', 'kovach', 'The news report or claim'],
    ['Philip Kotler', 'kotler', 'The product or service'],
    ['John Tukey', 'tukey', 'The question the data'],
  ])('selects %s and submits the corresponding role', (name, expectedRole, guideText) => {
    const { onSubmit } = renderPromptForm();
    openAskMode();
    fireEvent.click(screen.getByRole('button', { name: 'Experts' }));
    fireEvent.click(screen.getByRole('button', { name: /Charlie Munger.*Change expert/ }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));

    expect(screen.getByText(name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'What to include?' }));
    expect(screen.getByText(new RegExp(guideText))).toBeInTheDocument();
    submitPrompt('Please examine this situation');

    expect(onSubmit).toHaveBeenCalledWith('Please examine this situation', expectedRole, undefined, 'current-tab');
  });

  it('keeps draft text when changing experts', () => {
    renderPromptForm();
    openAskMode();
    fireEvent.click(screen.getByRole('button', { name: 'Experts' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: /Charlie Munger.*Change expert/ }));
    fireEvent.click(screen.getByRole('button', { name: /Philip Kotler/ }));

    expect(screen.getByRole('textbox')).toHaveValue('Keep this draft');
  });
});
