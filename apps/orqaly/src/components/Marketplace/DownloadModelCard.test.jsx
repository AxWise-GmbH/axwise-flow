import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./ModelBrandIcon', () => ({ default: () => null }));
vi.mock('../icons/AppIcon', () => ({ default: () => null }));

const DownloadModelCard = (await import('./DownloadModelCard')).default;

const baseModel = {
  id: 'hf-x',
  name: 'Cydonia-24B',
  repoId: 'TheDrummer/Cydonia-24B',
  pipelineTag: 'text-generation',
  downloads: 12000,
  likes: 300,
  files: 3,
  url: 'https://huggingface.co/TheDrummer/Cydonia-24B',
};

describe('DownloadModelCard rank badge', () => {
  it('shows a rank badge when model.rank is set', () => {
    render(<DownloadModelCard model={{ ...baseModel, rank: 4 }} onDownload={vi.fn()} />);
    expect(screen.getByText('#4')).toBeInTheDocument();
  });

  it('hides the rank badge when model.rank is absent', () => {
    render(<DownloadModelCard model={baseModel} onDownload={vi.fn()} />);
    expect(screen.queryByText(/^#\d+$/)).not.toBeInTheDocument();
  });
});
