import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { OfficeReportView } from '../../src/sidepanel/components/office/OfficeReportView';
import { OfficeConfigFields } from '../../src/sidepanel/components/office/OfficeConfigFields';
import { officeConfigSchema, type OfficeReport } from '../../src/office/types';

const config = officeConfigSchema.parse({ mode: 'inspection', name: 'Daily follow-up', tableSelector: '#tickets', headers: ['ID', 'Level'], keyColumn: 0 });
const report: OfficeReport = {
  kind: 'office-report', config, sourceUrl: 'https://example.com/tickets', startedAt: 1, complete: true, pages: 1, scanned: 2, warnings: [], files: [],
  rows: [ { key: '1', cells: ['1', 'VIP'], sourceUrl: 'https://example.com/tickets', detailUrl: 'https://example.com/ticket/1', links: [] }, { key: '2', cells: ['2', 'Standard'], sourceUrl: 'https://example.com/tickets', links: [] } ],
  comparison: { previousAt: 0, added: ['1'], changed: [], unchanged: ['2'], noLongerMatched: [] },
};

test('inspection categories filter real rows and record links identify the destination', () => {
  render(<OfficeReportView report={report} runId="run" stepRunId="step" />);
  expect(screen.getByRole('link', { name: 'Open record 1' })).toHaveAttribute('href', 'https://example.com/ticket/1');
  fireEvent.click(screen.getByRole('button', { name: 'Continuing (1)' }));
  expect(screen.queryByText('VIP')).not.toBeInTheDocument();
  expect(screen.getByText('Standard')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Changed (0)' }));
  expect(screen.getByText(/No records in this category/)).toBeInTheDocument();
});

test('partial and running results cannot be confused with a completed empty inspection', () => {
  const { rerender } = render(<OfficeReportView report={{ ...report, complete: false, comparison: undefined, rows: [] }} runId="run" stepRunId="step" running />);
  expect(screen.getByText('Reading…')).toBeInTheDocument();
  expect(screen.getByText('Waiting for matching rows…')).toBeInTheDocument();
  rerender(<OfficeReportView report={{ ...report, complete: false, comparison: undefined, rows: [] }} runId="run" stepRunId="step" />);
  expect(screen.getByText(/No records are marked resolved from a partial run/)).toBeInTheDocument();
});

test('rules and record links can be configured through labeled fields', () => {
  const onChange = jest.fn();
  render(<OfficeConfigFields config={config} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('Record link column'), { target: { value: '0' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detailLinkColumn: 0 }));
  fireEvent.change(screen.getByLabelText('Sort matching rows by'), { target: { value: '1' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sort: { column: 1, direction: 'ascending' } }));
});

test('handled records are hidden by default and can be reviewed', () => {
  render(<OfficeReportView report={{ ...report, handledKeys: ['1'] }} runId="run" stepRunId="step" />);
  expect(screen.queryByText('VIP')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New (0)' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show handled records (1)' }));
  expect(screen.getByText('VIP')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo handled 1' })).toBeEnabled();
});
