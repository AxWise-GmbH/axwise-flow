import { render, screen } from '@testing-library/react';
import HomePage from '../page';

// Mock the components used in HomePage
jest.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/FileUpload', () => ({
  FileUpload: ({ onUploadComplete }: { onUploadComplete: (dataId: number) => void }) => (
    <button onClick={() => onUploadComplete(1)} data-testid="file-upload">
      Upload
    </button>
  ),
}));

describe('HomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.log to prevent noise in test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('renders the welcome section', () => {
    render(<HomePage />);

    expect(screen.getByText('Interview Analysis')).toBeInTheDocument();
    expect(
      screen.getByText(/Upload your interview data to gain valuable insights/i)
    ).toBeInTheDocument();
  });

  it('renders the file upload section', () => {
    render(<HomePage />);

    expect(screen.getByText('Upload Interview Data')).toBeInTheDocument();
    expect(screen.getByTestId('file-upload')).toBeInTheDocument();
  });

  it('renders all feature cards', () => {
    render(<HomePage />);

    const features = [
      'Theme Analysis',
      'Sentiment Analysis',
      'Pattern Recognition',
    ];

    features.forEach(feature => {
      expect(screen.getByText(feature)).toBeInTheDocument();
    });
  });

  it('handles file upload completion', () => {
    const consoleSpy = jest.spyOn(console, 'log');
    render(<HomePage />);

    const uploadButton = screen.getByTestId('file-upload');
    uploadButton.click();

    expect(consoleSpy).toHaveBeenCalledWith('Upload complete:', 1);
  });

  it('has proper heading hierarchy', () => {
    render(<HomePage />);

    const mainHeading = screen.getByRole('heading', { level: 1 });
    expect(mainHeading).toHaveTextContent('Interview Analysis');

    const subHeadings = screen.getAllByRole('heading', { level: 2 });
    expect(subHeadings).toHaveLength(2); // Welcome and Upload sections

    const featureHeadings = screen.getAllByRole('heading', { level: 3 });
    expect(featureHeadings).toHaveLength(3); // Three feature cards
  });
});