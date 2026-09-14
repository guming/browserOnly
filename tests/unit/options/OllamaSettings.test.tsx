import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getOllamaStatusCode } from '../../../src/models/providers/ollama-connection';
import { OllamaSettings } from '../../../src/options/components/OllamaSettings';

const baseProps = {
  ollamaApiKey: '',
  setOllamaApiKey: jest.fn(),
  ollamaBaseUrl: 'http://localhost:11434',
  setOllamaBaseUrl: jest.fn(),
  ollamaModelId: '',
  setOllamaModelId: jest.fn(),
  ollamaCustomModels: [],
  setOllamaCustomModels: jest.fn(),
  newOllamaModel: { id: '', name: '', contextWindow: 32768 },
  setNewOllamaModel: jest.fn(),
  handleAddOllamaModel: jest.fn(),
  handleRemoveOllamaModel: jest.fn(),
  handleEditOllamaModel: jest.fn(),
};

describe('OllamaSettings connection diagnostics', () => {
  beforeEach(() => {
    (chrome.runtime as any).getURL = jest.fn(() => 'chrome-extension://test-extension-id/');
  });

  it('reads the status_code field used by the Ollama SDK', () => {
    expect(getOllamaStatusCode({ status_code: 403, message: 'Error 403: Forbidden' })).toBe(403);
    expect(getOllamaStatusCode(new Error('Error 403: Forbidden'))).toBe(403);
  });

  it('reports the exact extension origin when Ollama rejects it', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });

    render(<OllamaSettings {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Detect Local Models' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Ollama rejected this extension origin. Add chrome-extension://test-extension-id to OLLAMA_ORIGINS',
      );
    });
  });

  it('distinguishes an unreachable server from an Origin rejection', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

    render(<OllamaSettings {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Detect Local Models' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Could not reach Ollama');
    });
  });

  it('discovers and persists local models after a successful connection', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ models: [{ name: 'gemma4:e4b' }] }),
    });

    render(<OllamaSettings {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Detect Local Models' }));

    await waitFor(() => {
      expect(baseProps.setOllamaCustomModels).toHaveBeenCalledWith([
        { id: 'gemma4:e4b', name: 'gemma4:e4b', contextWindow: 32768 },
      ]);
      expect(screen.getByRole('status')).toHaveTextContent('Connected. Found 1 local model.');
    });
  });
});
