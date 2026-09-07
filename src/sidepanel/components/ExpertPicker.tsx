import React, { useEffect, useRef } from 'react';
import { availableExperts, type ExpertId } from './expertData';

interface ExpertPickerProps {
  isOpen: boolean;
  selectedExpertId: ExpertId;
  onSelect: (expertId: ExpertId) => void;
  onClose: () => void;
}

export function ExpertPicker({ isOpen, selectedExpertId, onSelect, onClose }: ExpertPickerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/25 p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="expert-picker-title"
        aria-modal="true"
        className="flex max-h-[min(600px,calc(100vh-32px))] w-full max-w-md flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_18px_45px_rgba(37,37,34,0.16)]"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-stone-200 px-4 py-4">
          <div>
            <h2 className="font-serif text-base font-semibold text-stone-900" id="expert-picker-title">Choose an expert</h2>
            <p className="mt-0.5 text-xs text-stone-500">Select the framework that best fits your question.</p>
          </div>
          <button
            ref={closeButtonRef}
            aria-label="Close expert picker"
            className="flex h-10 w-10 items-center justify-center rounded-md text-xl leading-none text-stone-500 transition-colors duration-150 hover:bg-stone-100 hover:text-stone-900 active:scale-96 motion-reduce:transform-none"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain p-2">
          {availableExperts.map(expert => {
            const isSelected = expert.id === selectedExpertId;
            return (
              <button
                aria-pressed={isSelected}
                className={`mb-1 flex min-h-16 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color,transform] duration-150 active:scale-[0.98] motion-reduce:transform-none ${
                  isSelected ? 'bg-[#eaf2f7]' : 'hover:bg-stone-100'
                }`}
                key={expert.id}
                onClick={() => {
                  onSelect(expert.id);
                  onClose();
                }}
                type="button"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-xs font-bold tracking-[0.04em] ${
                  isSelected ? 'bg-[#315a78] text-white' : 'bg-stone-200 text-stone-700'
                }`}>{expert.initials}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-stone-900">{expert.name}</span>
                  <span className="mt-0.5 block text-xs text-stone-500">{expert.field}</span>
                </span>
                {isSelected && <span className="shrink-0 text-xs font-semibold text-[#315a78]">Selected</span>}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
