import React, { useMemo, useState } from 'react';
import type { ExtractionField, ExtractionRequest } from '../../../extraction';
import { ExtractionFieldEditor } from './ExtractionFieldEditor';

interface Props { initialFields?: ExtractionField[]; onRun: (request: ExtractionRequest) => void; }
export function ExtractionSetupView({ initialFields = [], onRun }: Props) {
  const [fields, setFields] = useState(initialFields);
  const [source, setSource] = useState<ExtractionRequest['source']>('page');
  const canRun = useMemo(() => fields.length > 0 && fields.every(f => f.key.trim() && f.label.trim()), [fields]);
  return <section aria-label="Structured extraction setup">
    <h2>Extract structured data</h2>
    <label>Source <select value={source} onChange={e => setSource(e.target.value as ExtractionRequest['source'])}><option value="page">Current page</option><option value="selection">Selected text</option><option value="tabs">Multiple tabs</option></select></label>
    <ExtractionFieldEditor fields={fields} onChange={setFields} />
    <button type="button" disabled={!canRun} onClick={() => onRun({ source, fields, outputFormat: 'table', maxRows: 100 })}>Run extraction</button>
  </section>;
}
