import React from 'react';
import { render, screen } from '@testing-library/react';
import { WorkspaceSwitcher } from '../../../src/sidepanel/components/WorkspaceSwitcher';

describe('WorkspaceSwitcher', () => {
  it('marks monitoring as a beta feature without changing the visible label', () => {
    render(<WorkspaceSwitcher value="tasks" onChange={jest.fn()} monitorCount={2} />);

    expect(screen.getByRole('button', { name: /Monitors.*Beta feature/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Beta feature' })).toHaveAttribute(
      'title',
      'Beta: monitoring runs on a best-effort basis',
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
