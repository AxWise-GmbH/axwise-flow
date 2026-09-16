import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Render the real toolbar as nothing; we only care about the Rent/Download split.
vi.mock('./MarketplaceToolbar', () => ({ default: () => null }));
vi.mock('./ImportLibraryDialog', () => ({
  default: () => null,
  ImportFromButton: () => null,
}));
// Stub the Download sub-tab (it hits the HF search service) with a marker.
vi.mock('./MarketplaceDownloadModels', () => ({
  default: () => <div>download-view</div>,
}));
vi.mock('../../hooks/useImportedLibraries', () => ({ default: () => ({ importedItems: [] }) }));

const MarketplaceModelsTab = (await import('./MarketplaceModelsTab')).default;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MarketplaceModelsTab Rent/Download sub-tabs', () => {
  it('defaults to Rent and shows the rentable models grid', () => {
    render(<MarketplaceModelsTab />);
    expect(screen.getByText('Qwen 2.5 72B')).toBeInTheDocument();
    expect(screen.queryByText('download-view')).not.toBeInTheDocument();
    // Both sub-tab pills are present.
    expect(screen.getByRole('tab', { name: /rent/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /download/i })).toBeInTheDocument();
  });

  it('switches to the Download view when the Download pill is clicked', () => {
    render(<MarketplaceModelsTab />);
    fireEvent.click(screen.getByRole('tab', { name: /download/i }));
    expect(screen.getByText('download-view')).toBeInTheDocument();
    // Rent grid is no longer mounted.
    expect(screen.queryByText('Qwen 2.5 72B')).not.toBeInTheDocument();
  });
});
