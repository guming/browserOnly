import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
