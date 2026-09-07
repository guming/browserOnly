import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  availableBooks,
  bookCategories,
  getBookCategoryName,
  type BookGuide,
} from './askBooksData';

interface BookPickerProps {
  isOpen: boolean;
  selectedBookId: string;
  onSelect: (bookId: string) => void;
  onClose: () => void;
}

export function BookPicker({ isOpen, selectedBookId, onSelect, onClose }: BookPickerProps) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
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

  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return availableBooks.filter(book => {
      const matchesCategory = category === 'all' || book.category === category;
      const matchesQuery = !normalizedQuery ||
        book.title.toLowerCase().includes(normalizedQuery) ||
        book.author.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  const handleSelect = (book: BookGuide) => {
    onSelect(book.id);
    setQuery('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/25 p-4 motion-reduce:transition-none"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="book-picker-title"
        aria-modal="true"
        className="flex max-h-[min(600px,calc(100vh-32px))] w-full max-w-md flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_18px_45px_rgba(37,37,34,0.16)]"
        role="dialog"
      >
        <header className="flex items-center justify-between border-b border-stone-200 px-4 py-4">
          <h2 id="book-picker-title" className="font-serif text-base font-semibold text-stone-900">
            Choose a book
          </h2>
          <button
            aria-label="Close book picker"
            className="flex h-10 w-10 items-center justify-center rounded-md text-xl leading-none text-stone-500 transition-colors duration-150 hover:bg-stone-100 hover:text-stone-900 active:scale-96 motion-reduce:transform-none"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="border-b border-stone-200 px-4 py-3">
          <label className="sr-only" htmlFor="book-search">Search by title or author</label>
          <input
            ref={searchRef}
            id="book-search"
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-stone-400 focus:border-[#315a78] focus:ring-2 focus:ring-[#315a78]/10"
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by title or author"
            type="search"
            value={query}
          />
          <div aria-label="Book categories" className="mt-3 flex gap-1 overflow-x-auto" role="tablist">
            {[{ id: 'all', name: 'All books' }, ...bookCategories].map(item => (
              <button
                aria-selected={category === item.id}
                className={`min-h-10 shrink-0 rounded-md px-2.5 text-xs transition-colors duration-150 active:scale-96 motion-reduce:transform-none ${
                  category === item.id
                    ? 'bg-stone-100 font-semibold text-stone-900'
                    : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900'
                }`}
                key={item.id}
                onClick={() => setCategory(item.id)}
                role="tab"
                type="button"
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto p-2">
          {filteredBooks.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-stone-800">No books found</p>
              <p className="mt-1 text-xs text-stone-500">Try another title or author.</p>
            </div>
          ) : filteredBooks.map(book => {
            const isSelected = selectedBookId === book.id;
            return (
              <button
                aria-pressed={isSelected}
                className={`mb-1 flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-150 active:scale-[0.99] motion-reduce:transform-none ${
            isSelected ? 'bg-[#eaf2f7]' : 'hover:bg-stone-100'
                }`}
                key={book.id}
                onClick={() => handleSelect(book)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-stone-900">{book.title}</span>
                  <span className="mt-0.5 block text-xs text-stone-500">
                    {book.author} · {getBookCategoryName(book.category)}
                  </span>
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
