import React, { useCallback, useState } from 'react';
import { BookPicker } from './BookPicker';
import { type BookGuide } from './askBooksData';

interface AskBooksPanelProps {
  book: BookGuide;
  disabled: boolean;
  onSelectBook: (bookId: string) => void;
}

export function AskBooksPanel({ book, disabled, onSelectBook }: AskBooksPanelProps) {
  const [isPickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  return (
    <div className="space-y-5">
      <section>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-stone-500">
          Reading mode
        </p>
        <h2 className="font-serif text-[28px] font-normal leading-tight tracking-[-0.02em] text-stone-900">
          Ask The Books
        </h2>
        <p className="mt-2 max-w-[32ch] text-sm leading-6 text-stone-500">
          Explore your situation through the lens of a selected book.
        </p>
      </section>

      <section aria-labelledby="selected-book-label">
        <p id="selected-book-label" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-500">
          Selected book
        </p>
        <button
          className="flex min-h-16 w-full items-center justify-between gap-4 rounded-[11px] border border-stone-300 bg-white px-3.5 py-3 text-left transition-colors duration-150 hover:border-stone-500 hover:bg-stone-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-stone-900">{book.title}</span>
            <span className="mt-0.5 block text-xs text-stone-500">{book.author}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-[#315a78]">Change book</span>
        </button>
      </section>

      <section className="rounded-[11px] border border-stone-200 bg-[#eeeee9] px-3.5 py-3.5" aria-labelledby="book-guide-title">
        <h3 id="book-guide-title" className="text-sm font-semibold text-stone-900">{book.guideIntro}</h3>
        <ol className="mt-2.5 list-decimal space-y-2.5 pl-5 text-sm leading-6 text-stone-600 marker:font-semibold marker:text-stone-800">
          {book.guideQuestions.map(question => <li key={question}>{question}</li>)}
        </ol>
      </section>

      <BookPicker
        isOpen={isPickerOpen}
        onClose={closePicker}
        onSelect={onSelectBook}
        selectedBookId={book.id}
      />
    </div>
  );
}
