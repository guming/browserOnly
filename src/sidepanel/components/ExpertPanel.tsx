import React, { useCallback, useState } from 'react';
import { ExpertPicker } from './ExpertPicker';
import { type ExpertGuide, type ExpertId } from './expertData';

interface ExpertPanelProps {
  expert: ExpertGuide;
  disabled: boolean;
  onSelectExpert: (expertId: ExpertId) => void;
}

export function ExpertPanel({ expert, disabled, onSelectExpert }: ExpertPanelProps) {
  const [isPickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  return (
    <div className="space-y-4">
      <section>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-500">Expert advisory</p>
        <h2 className="text-lg font-semibold leading-6 text-stone-900">Experts</h2>
        <p className="mt-1 text-xs leading-5 text-stone-500">Choose a thinking framework for your question.</p>
      </section>

      <section aria-labelledby="selected-expert-label">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500" id="selected-expert-label">Selected expert</p>
        <button
          aria-label={`${expert.name}, ${expert.field}. Change expert`}
          className="flex min-h-14 w-full items-center gap-2.5 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-left transition-[background-color,border-color,transform] duration-150 hover:border-stone-500 hover:bg-stone-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          type="button"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#315a78] text-[11px] font-bold tracking-[0.04em] text-white">{expert.initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-stone-900">{expert.name}</span>
            <span className="mt-0.5 block text-xs text-stone-500">{expert.field}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-[#315a78]">Change expert</span>
        </button>
      </section>

      <section aria-labelledby="expert-guide-title" className="rounded-lg border border-stone-200 bg-[#eeeee9] px-3 py-3">
        <h3 className="text-xs font-semibold leading-5 text-stone-900" id="expert-guide-title">{expert.guideIntro}</h3>
        <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-xs leading-5 text-stone-600 marker:font-semibold marker:text-stone-800">
          {expert.guideQuestions.map(question => <li key={question}>{question}</li>)}
        </ol>
      </section>

      <ExpertPicker
        isOpen={isPickerOpen}
        onClose={closePicker}
        onSelect={onSelectExpert}
        selectedExpertId={expert.id}
      />
    </div>
  );
}
