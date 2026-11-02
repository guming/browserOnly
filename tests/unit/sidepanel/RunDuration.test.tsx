import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { RunDuration } from '../../../src/sidepanel/components/RunDuration';

test('updates elapsed run time then freezes at recorded duration after completion', () => {
  jest.useFakeTimers().setSystemTime(10000);
  const startedAt = 5000;
  const { rerender, unmount } = render(<RunDuration activity={{ status: 'running', startedAt, steps: [] }} />);
  expect(screen.getByText('· Total 5s')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(2000));
  expect(screen.getByText('· Total 7s')).toBeInTheDocument();
  rerender(<RunDuration activity={{ status: 'completed', startedAt, endedAt: 12000, durationMs: 65000, steps: [] }} />);
  expect(screen.getByText('· Total 1m 5s')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.getByText('· Total 1m 5s')).toBeInTheDocument();
  unmount();
  jest.useRealTimers();
});

test('legacy cards without timing do not invent a total duration', () => {
  const { container } = render(<RunDuration activity={{ status: 'completed', steps: [] }} />);
  expect(container).toBeEmptyDOMElement();
});
