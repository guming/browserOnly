import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunSetupView } from '../../src/sidepanel/components/templates/RunSetupView';

describe('RunSetupView', () => {
  it('validates required enum and boolean fields', () => {
    const onRun = jest.fn(); const workflow: any = { variables: [{ key: 'tone', label: 'tone', type: 'enum', required: true, options: [{ label: 'brief', value: 'brief' }] }, { key: 'safe', label: 'safe', type: 'boolean', required: true }] };
    render(<RunSetupView workflow={workflow} onRun={onRun} />); const run = screen.getByRole('button', { name: 'Run' }); expect(run).toBeDisabled();
    fireEvent.change(screen.getByLabelText('tone'), { target: { value: 'brief' } }); fireEvent.click(screen.getByLabelText('safe')); expect(run).not.toBeDisabled(); fireEvent.click(run); expect(onRun).toHaveBeenCalledWith({ tone: 'brief', safe: true });
  });
});
