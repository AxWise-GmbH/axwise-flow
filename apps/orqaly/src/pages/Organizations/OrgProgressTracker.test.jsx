import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { OrgProgressTracker } from './SimpleOrganizations';

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

const theme = createTheme();
const renderTracker = (props = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <OrgProgressTracker
        hasOrg
        hasAssistant={false}
        hasConsilium={false}
        hasTeam={false}
        onAction={() => {}}
        {...props}
      />
    </ThemeProvider>
  );

describe('OrgProgressTracker collapse', () => {
  it('is collapsed by default but still shows the title and percent', () => {
    renderTracker();
    expect(screen.getByText('Onboarding')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy(); // 1 of 4 milestones
    // The steps timeline is hidden until expanded.
    expect(screen.queryByText('Create Organisation')).toBeNull();
  });

  it('expands the steps when the header is clicked', () => {
    renderTracker();
    fireEvent.click(screen.getByText('Onboarding'));
    expect(screen.getByText('Create Organisation')).toBeTruthy();
    // Percent stays visible while expanded.
    expect(screen.getByText('25%')).toBeTruthy();
  });
});
