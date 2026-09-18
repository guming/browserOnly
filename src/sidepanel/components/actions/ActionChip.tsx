import React from 'react';
export function ActionChip({ label, onRemove }: { label: string; onRemove: () => void }) { return <div className="mx-2 mt-2 inline-flex items-center gap-2 rounded-md bg-[#eaf2f7] px-2 py-1 text-xs font-semibold text-[#315a78]"><span>{label}</span><button type="button" aria-label={`Remove ${label}`} onClick={onRemove}>×</button></div>; }
