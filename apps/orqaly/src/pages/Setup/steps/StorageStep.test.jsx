import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const svc = vi.hoisted(() => ({ createStorageConnection: vi.fn() }));
vi.mock('../../../services/storageConnectionsService', () => ({
  createStorageConnection: svc.createStorageConnection,
}));
vi.mock('../../../components/Setup/ConnectStorageWizard', () => ({ default: () => null }));

import StorageStep from './StorageStep';

const theme = createTheme();
const choosePlatform = vi.fn();
const refresh = vi.fn();
const progress = { storage: { connections: [], choice: null, choosePlatform, refresh } };
const wrap = () =>
  render(
    <ThemeProvider theme={theme}>
      <StorageStep progress={progress} />
    </ThemeProvider>
  );

beforeEach(() => {
  svc.createStorageConnection.mockResolvedValue({});
  choosePlatform.mockClear();
  refresh.mockClear();
});

describe('StorageStep', () => {
  it('shows all storage options incl. the R2 coming-soon', () => {
    wrap();
    expect(screen.getByText('Use ours')).toBeTruthy();
    expect(screen.getByText('Your Supabase')).toBeTruthy();
    expect(screen.getByText('Amazon S3')).toBeTruthy();
    expect(screen.getByText('Cloudflare R2')).toBeTruthy();
  });

  it('selects platform storage', () => {
    wrap();
    fireEvent.click(screen.getByRole('button', { name: /use platform/i }));
    expect(choosePlatform).toHaveBeenCalled();
  });

  it('connects an S3 bucket through createStorageConnection({kind:"s3"})', async () => {
    wrap();
    // Two "Connect" buttons (Supabase, S3) - the second is S3.
    const connects = screen.getAllByRole('button', { name: /^connect$/i });
    fireEvent.click(connects[1]);
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'us-east-1' } });
    fireEvent.change(screen.getByLabelText('Bucket'), { target: { value: 'my-bucket' } });
    fireEvent.change(screen.getByLabelText('Access key ID'), { target: { value: 'AKIA' } });
    fireEvent.change(screen.getByLabelText('Secret access key'), {
      target: { value: 'secretsecret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /connect s3/i }));
    await waitFor(() => {
      expect(svc.createStorageConnection).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 's3' })
      );
      expect(refresh).toHaveBeenCalled();
    });
  });
});
