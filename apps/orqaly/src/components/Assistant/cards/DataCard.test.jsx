import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const svc = vi.hoisted(() => ({
  addDocument: vi.fn(),
  importContacts: vi.fn(),
  uploadKBFile: vi.fn(),
  validateKBFile: vi.fn(() => ({ ok: true })),
  formatFileSize: vi.fn(() => '1 KB'),
  bulkUploadFiles: vi.fn(),
  syncObsidian: vi.fn(),
}));
vi.mock('../../../services/knowledgeBaseService', () => ({ addDocument: svc.addDocument }));
vi.mock('../../../services/contactsService', () => ({ importContacts: svc.importContacts }));
vi.mock('../../../services/kbFileService', () => ({
  uploadKBFile: svc.uploadKBFile,
  validateKBFile: svc.validateKBFile,
  formatFileSize: svc.formatFileSize,
}));
vi.mock('../../../services/assistantIngestService', () => ({
  bulkUploadFiles: svc.bulkUploadFiles,
  syncObsidian: svc.syncObsidian,
}));
vi.mock('../../../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } },
}));

import DataCard from './DataCard';

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

beforeEach(() => {
  svc.addDocument.mockReset().mockResolvedValue({ id: 'd1' });
  svc.importContacts.mockReset().mockResolvedValue({ imported: 1 });
  svc.uploadKBFile.mockReset().mockResolvedValue({ file_name: 'f.pdf', file_path: 'u1/f.pdf' });
  svc.validateKBFile.mockReturnValue({ ok: true });
  svc.bulkUploadFiles.mockReset().mockResolvedValue({ added: 3 });
  svc.syncObsidian.mockReset().mockResolvedValue({ synced: 2 });
});

describe('DataCard', () => {
  it('adds pasted company info, tallies it, and stays on the step', async () => {
    const onComplete = vi.fn();
    wrap(<DataCard onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We build robots.' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await waitFor(() => {
      expect(svc.addDocument).toHaveBeenCalledWith(
        expect.objectContaining({ content_type: 'note', content: 'We build robots.' })
      );
    });
    // Add does NOT complete the step - the summary chip shows instead.
    expect(onComplete).not.toHaveBeenCalled();
    expect(await screen.findByText(/1 note/i)).toBeTruthy();
  });

  it('imports contacts with the chosen contact_type', async () => {
    const onComplete = vi.fn();
    wrap(<DataCard onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Contacts' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Name,Email,Phone\nJohn,john@x.com,+1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add contacts/i }));
    await waitFor(() => {
      expect(svc.importContacts).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'John',
          email: 'john@x.com',
          phone: '+1',
          contact_type: 'phone',
        }),
      ]);
    });
    expect(await screen.findByText(/1 contact/i)).toBeTruthy();
  });

  it('uploads bulk files via the Files source', async () => {
    wrap(<DataCard onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] },
    });
    await waitFor(() => expect(svc.bulkUploadFiles).toHaveBeenCalled());
    expect(await screen.findByText(/3 files/i)).toBeTruthy();
  });

  it('Continue passes the accumulated knowledge + connectors patch', async () => {
    const onComplete = vi.fn();
    wrap(<DataCard onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Info.' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await screen.findByText(/1 note/i);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onComplete).toHaveBeenCalledWith({
      config: { knowledge: { added: 1 }, connectors: { files: 0, obsidian: 0 } },
    });
  });

  it('surfaces an error when an add fails', async () => {
    svc.addDocument.mockRejectedValueOnce(new Error('save boom'));
    wrap(<DataCard onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Info.' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(await screen.findByText(/save boom/i)).toBeTruthy();
  });

  it('Done completes with an empty tally when nothing was added', () => {
    const onComplete = vi.fn();
    wrap(<DataCard onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onComplete).toHaveBeenCalledWith({
      config: { knowledge: { added: 0 }, connectors: { files: 0, obsidian: 0 } },
    });
  });
});
