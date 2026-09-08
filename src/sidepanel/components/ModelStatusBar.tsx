import React from 'react';
import { ProviderSelector } from './ProviderSelector';
import { TokenUsageDisplay } from './TokenUsageDisplay';

export function ModelStatusBar({ isProcessing }: { isProcessing: boolean }) {
  return (
    <div className="flex h-9 items-center justify-between gap-2 border-y border-stone-200 bg-[#fafbfc] px-1">
      <ProviderSelector isProcessing={isProcessing} compact />
      <TokenUsageDisplay compact />
    </div>
  );
}
