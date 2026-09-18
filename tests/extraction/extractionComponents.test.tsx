import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExtractionSetupView } from '../../src/sidepanel/components/extraction/ExtractionSetupView';

describe('extraction setup', () => {
  it('requires a field before running', () => {
    const onRun = jest.fn(); render(<ExtractionSetupView onRun={onRun} />);
    expect(screen.getByRole('button', { name: /run extraction/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    fireEvent.click(screen.getByRole('button', { name: /run extraction/i }));
    expect(onRun).toHaveBeenCalled();
  });
});
