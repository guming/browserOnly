import React from 'react';

function cellText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(cellText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return cellText(node.props.children);
  return '';
}

function rowsFrom(children: React.ReactNode): string[][] {
  const rows: string[][] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return;
    if (child.type === 'tr') {
      rows.push(React.Children.toArray(child.props.children).map(cellText));
      return;
    }
    rows.push(...rowsFrom(child.props.children));
  });
  return rows;
}

function csvCell(value: string): string {
  const safeValue = /^[\s]*[=+@]/.test(value) || /^[\s]*-[^\d]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
}

export function MarkdownTable({ children }: { children?: React.ReactNode }) {
  const rows = rowsFrom(children);
  const exportCsv = () => {
    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    void chrome.downloads.download({ url, filename: `table-${new Date().toISOString().slice(0, 10)}.csv`, saveAs: true })
      .finally(() => window.setTimeout(() => URL.revokeObjectURL(url), 1000));
  };
  return <div className="my-2 overflow-x-auto rounded-md border border-stone-200">
    <div className="flex justify-end border-b border-stone-200 bg-stone-50 px-2 py-1">
      <button type="button" onClick={exportCsv} className="rounded px-2 py-1 text-xs font-medium text-[#315a78] hover:bg-[#eaf2f7]">Export CSV</button>
    </div>
    <table className="w-full border-collapse table-auto">{children}</table>
  </div>;
}
