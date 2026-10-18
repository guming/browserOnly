import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RunSetupView } from '../../src/sidepanel/components/templates/RunSetupView';

describe('RunSetupView', () => {
  it('validates required enum and boolean fields', () => {
    const onRun = jest.fn(); const workflow: any = { variables: [{ key: 'tone', label: 'tone', type: 'enum', required: true, options: [{ label: 'brief', value: 'brief' }] }, { key: 'safe', label: 'safe', type: 'boolean', required: true }] };
    render(<RunSetupView workflow={workflow} onRun={onRun} />); const run = screen.getByRole('button', { name: 'Run' }); expect(run).toBeDisabled();
    fireEvent.change(screen.getByLabelText('tone'), { target: { value: 'brief' } }); fireEvent.click(screen.getByLabelText('safe')); expect(run).not.toBeDisabled(); fireEvent.click(run); expect(onRun).toHaveBeenCalledWith({ tone: 'brief', safe: true });
  });
  it('guides field entry before showing validation, then accepts column names', () => {
    const onRun = jest.fn();
    const workflow: any = { variables: [{ key: 'fields', label: 'Fields', type: 'fields', required: true }] };
    render(<RunSetupView workflow={workflow} onRun={onRun} />);
    const run = screen.getByRole('button', { name: 'Run' });
    expect(run).toBeDisabled();
    expect(screen.getByText(/Enter the columns to extract/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Fields' }), { target: { value: 'Title\nAuthor' } });
    expect(run).toBeEnabled();
    fireEvent.click(run);
    expect(onRun).toHaveBeenCalledWith({ fields: [{ key: 'Title', label: 'Title', type: 'text', required: false }, { key: 'Author', label: 'Author', type: 'text', required: false }] });
  });
  it('runs automatic extraction without requiring columns', () => {
    const onRun = jest.fn();
    const workflow: any = { variables: [{ key: 'fields', label: 'Columns (optional)', type: 'fields', required: false }] };
    render(<RunSetupView workflow={workflow} onRun={onRun} />);
    expect(screen.getByText('Adjust columns (optional)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(onRun).toHaveBeenCalledWith({ fields: [] });
  });
  it('suggests two readable tabs for comparison', async () => {
    (chrome.tabs.query as jest.Mock).mockResolvedValue([
      { id: 10, active: true, url: 'https://example.com/a', title: 'A' },
      { id: 11, active: false, url: 'https://example.com/b', title: 'B' },
    ]);
    const onRun = jest.fn();
    const workflow: any = { variables: [{ key: 'tabs', label: 'Tabs', type: 'tabs', required: true, validation: { min: 2, max: 8 } }] };
    render(<RunSetupView workflow={workflow} onRun={onRun} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(onRun).toHaveBeenCalledWith({ tabs: [10, 11] });
  });
});
