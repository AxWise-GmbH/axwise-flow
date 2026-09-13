import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material';

const mocks = vi.hoisted(() => ({
  startCalibration: vi.fn(),
  loadCalibrationSamples: vi.fn(),
  saveSampleComment: vi.fn(),
  synthesizeCalibration: vi.fn(),
  findLatestCalibrationRun: vi.fn(),
  getCalibrationMode: vi.fn(),
  previewCommentImpact: vi.fn(),
}));

vi.mock('../../services/calibrationService', () => mocks);
vi.mock('./ToolSelector', () => ({ default: () => null }));
vi.mock('../../../shared/deliverableToolsCatalog', () => ({
  getDefaultEnabledTool: () => null,
  listToolsForDeliverable: () => [],
}));

import CalibrationWizard from './CalibrationWizard';

const theme = createTheme();
const samples = Array.from({ length: 6 }, (_, index) => ({
  id: `sample-${index + 1}`,
  content: `Sample ${index + 1} output`,
  metadata: {
    label: `Category ${index + 1}`,
    deliverable_type: 'document_template',
    sample_prompt: `Prompt ${index + 1}`,
    library_anchors: [],
  },
}));

function renderWizard(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <CalibrationWizard
        open
        organizationId="org-1"
        organizationName="Acme"
        onClose={vi.fn()}
        onComplete={vi.fn()}
        {...props}
      />
    </ThemeProvider>
  );
}

async function clickAction(name) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await Promise.resolve();
  });
}

describe('CalibrationWizard organization scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCalibrationMode.mockResolvedValue({ mode: 'observe', active_run_id: null });
    mocks.startCalibration.mockResolvedValue({ calibrationRunId: 'run-1' });
    mocks.loadCalibrationSamples.mockResolvedValue(samples);
    mocks.saveSampleComment.mockResolvedValue(undefined);
    mocks.synthesizeCalibration.mockResolvedValue({ criteriaCount: 6 });
    mocks.previewCommentImpact.mockResolvedValue({
      improvedDescription: 'Improved output',
      artifact_after: { kind: 'text', text: 'Improved output' },
    });
  });

  it('resumes an active drift run in the exact organization without starting a personal run', async () => {
    mocks.getCalibrationMode.mockResolvedValue({
      mode: 'comment',
      active_run_id: 'run-drift',
    });
    renderWizard();

    await clickAction('Start calibration');

    await waitFor(() =>
      expect(mocks.loadCalibrationSamples).toHaveBeenCalledWith('run-drift', 'org-1')
    );
    expect(mocks.getCalibrationMode).toHaveBeenCalledWith('org-1');
    expect(mocks.startCalibration).not.toHaveBeenCalled();
    expect(screen.getByText(/for Acme/)).toBeInTheDocument();
  });

  it('keeps preview, comments, and synthesis in the selected organization', async () => {
    renderWizard();
    await clickAction('Start calibration');

    await waitFor(() => expect(screen.getByText(/Sample 1 of 6/)).toBeInTheDocument());
    expect(mocks.startCalibration).toHaveBeenCalledWith({
      costPreference: 'free_first',
      organizationId: 'org-1',
    });
    expect(mocks.loadCalibrationSamples).toHaveBeenCalledWith('run-1', 'org-1');

    fireEvent.change(screen.getByLabelText("What's missing? What's wrong? What's good?"), {
      target: { value: 'Use stronger evidence.' },
    });
    await clickAction('Apply my comment');
    await waitFor(() =>
      expect(mocks.previewCommentImpact).toHaveBeenCalledWith(
        'sample-1',
        'Use stronger evidence.',
        1,
        null,
        'org-1'
      )
    );

    await clickAction('Lock in & next');
    await waitFor(() =>
      expect(mocks.saveSampleComment).toHaveBeenCalledWith(
        'sample-1',
        'Use stronger evidence.',
        'org-1'
      )
    );

    for (let sampleIndex = 2; sampleIndex <= 5; sampleIndex += 1) {
      await waitFor(() =>
        expect(screen.getByText(new RegExp(`Sample ${sampleIndex} of 6`))).toBeInTheDocument()
      );
      await clickAction('Lock in & next');
    }
    await waitFor(() => expect(screen.getByText(/Sample 6 of 6/)).toBeInTheDocument());
    await clickAction('Lock in & synthesize');

    await waitFor(() => expect(mocks.synthesizeCalibration).toHaveBeenCalledWith('run-1', 'org-1'));
  });
});
