import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitForElementToBeRemoved } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import SetupSection from './SetupSection';

const theme = createTheme({ palette: { primary: { main: '#10B981' } } });

function renderSection(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <SetupSection
        sectionKey="keys"
        title="Core"
        icon={KeyRoundedIcon}
        description="Pick the AI model."
        expanded
        onToggle={vi.fn()}
        {...props}
      >
        <div>section body</div>
      </SetupSection>
    </ThemeProvider>
  );
}

describe('SetupSection', () => {
  it('shows its title and description', () => {
    renderSection();
    expect(screen.getByText('Core')).toBeInTheDocument();
    expect(screen.getByText('Pick the AI model.')).toBeInTheDocument();
  });

  // Both panels' suites click the title text to open a section, so the handler
  // has to sit on an ancestor of that text node.
  it('toggles from a click on the title text itself', () => {
    const onToggle = vi.fn();
    renderSection({ expanded: false, onToggle });
    fireEvent.click(screen.getByText('Core'));
    expect(onToggle).toHaveBeenCalledWith('keys', true);
  });

  it('reports the close as well as the open', () => {
    const onToggle = vi.fn();
    renderSection({ expanded: true, onToggle });
    fireEvent.click(screen.getByText('Core'));
    expect(onToggle).toHaveBeenCalledWith('keys', false);
  });

  it('marks itself expanded for a screen reader', () => {
    renderSection({ expanded: true });
    expect(screen.getByRole('button', { name: /Core/ })).toHaveAttribute('aria-expanded', 'true');
  });

  // The star has to stay a separate element: Testing Library joins only an
  // element's direct text children, so `getByText('Core')` survives a <span>
  // sibling but not `{title}{' *'}`. Both panels query sections by bare title.
  it('keeps the required star out of the title_s own text node', () => {
    renderSection({ required: true });
    expect(screen.getByText('Core')).toBeInTheDocument();
  });

  it('shows a tick only once the section is settled', () => {
    const { rerender } = renderSection({ done: false });
    expect(screen.queryByTestId('CheckCircleRoundedIcon')).not.toBeInTheDocument();
    rerender(
      <ThemeProvider theme={theme}>
        <SetupSection
          sectionKey="keys"
          title="Core"
          icon={KeyRoundedIcon}
          expanded
          done
          onToggle={vi.fn()}
        >
          <div>section body</div>
        </SetupSection>
      </ThemeProvider>
    );
    expect(screen.getByTestId('CheckCircleRoundedIcon')).toBeInTheDocument();
  });

  describe('content mounting', () => {
    // The Assistant panel relies on this: six sections each render a card, and
    // only the open one may exist, or every query inside a card matches six
    // times over.
    it('does not mount a closed section_s children by default', () => {
      renderSection({ expanded: false });
      expect(screen.queryByText('section body')).not.toBeInTheDocument();
    });

    // Not synchronous: the collapse plays out and *then* unmounts, so a closing
    // section is briefly still in the tree. Anything asserting on a card's
    // absence has to wait for the transition rather than the rerender.
    it('discards them again once the section has finished closing', async () => {
      const { rerender } = renderSection({ expanded: true });
      expect(screen.getByText('section body')).toBeInTheDocument();
      rerender(
        <ThemeProvider theme={theme}>
          <SetupSection
            sectionKey="keys"
            title="Core"
            icon={KeyRoundedIcon}
            expanded={false}
            onToggle={vi.fn()}
          >
            <div>section body</div>
          </SetupSection>
        </ThemeProvider>
      );
      await waitForElementToBeRemoved(() => screen.queryByText('section body'));
    });

    // The Goal panel opts in, so collapsing the roster does not throw away a
    // search the user has typed.
    it('keeps them mounted when asked to', () => {
      renderSection({ expanded: false, keepContentMounted: true });
      expect(screen.getByText('section body')).toBeInTheDocument();
    });
  });
});
