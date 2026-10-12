import React, { useMemo, useState } from 'react';
import type { ExtractionField, ExtractionRequest } from '../../../extraction';
import { ExtractionFieldEditor } from './ExtractionFieldEditor';
import { StructuredExtractionService } from '../../../extraction';

interface Props { initialFields?: ExtractionField[]; onRun: (request: ExtractionRequest) => void; }
export function ExtractionSetupView({ initialFields = [], onRun }: Props) {
  const [fields, setFields] = useState(initialFields);
  const [source, setSource] = useState<ExtractionRequest['source']>('page');
  const [description, setDescription] = useState('');
  const [outputFormat, setOutputFormat] = useState<NonNullable<ExtractionRequest['outputFormat']>>('table');
  const canRun = useMemo(() => fields.length > 0 && fields.every(f => f.key.trim() && f.label.trim()), [fields]);
  return <section aria-label="Structured extraction setup">
    <h2>Extract structured data</h2>
    <label>Source <select value={source} onChange={e => setSource(e.target.value as ExtractionRequest['source'])}><option value="page">Current page</option><option value="selection">Selected text</option><option value="tabs">Multiple tabs</option></select></label>
    <label>Describe what you need<textarea aria-label="Describe fields" value={description} onChange={event => setDescription(event.target.value)} /></label>
    <button type="button" disabled={!description.trim()} onClick={() => setFields(new StructuredExtractionService().suggestFields(description))}>Suggest fields</button>
    <ExtractionFieldEditor fields={fields} onChange={setFields} />
    <label>Output <select value={outputFormat} onChange={event => setOutputFormat(event.target.value as NonNullable<ExtractionRequest['outputFormat']>)}><option value="table">Table</option><option value="csv">CSV</option><option value="json">JSON</option></select></label>
    <button type="button" disabled={!canRun} onClick={() => onRun({ source, fields, outputFormat, maxRows: 100 })}>Run extraction</button>
  </section>;
}
