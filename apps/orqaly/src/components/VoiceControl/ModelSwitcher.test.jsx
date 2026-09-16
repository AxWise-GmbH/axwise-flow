import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';
import { getEnterpriseTheme } from '../../theme/enterpriseTheme';
import ModelSwitcher from './ModelSwitcher.jsx';

describe('ModelSwitcher', () => {
  it('shows the short label for the current model on the chip', () => {
    render(<ModelSwitcher provider="groq" model="llama-3.3-70b-versatile" onChange={() => {}} />);
    expect(screen.getByText('Llama 3.3')).toBeTruthy();
  });

  it('opens a flat menu with provider + full model id and reports the pick', () => {
    const onChange = vi.fn();
    render(<ModelSwitcher provider="groq" model="llama-3.3-70b-versatile" onChange={onChange} />);
    fireEvent.click(screen.getByText('Llama 3.3'));

    // provider name on top, full model id underneath, no group-header row
    expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0);
    expect(screen.getByText('(gpt-4o)')).toBeTruthy();

    fireEvent.click(screen.getByText('(gpt-4o)'));
    expect(onChange).toHaveBeenCalledWith({ provider: 'openai', model: 'gpt-4o' });
  });

  it('uses dark chip ink when hosted by Voice Studio inside a light app', () => {
    render(
      <ThemeProvider theme={getEnterpriseTheme('light', null)}>
        <ModelSwitcher
          provider="groq"
          model="llama-3.3-70b-versatile"
          onChange={() => {}}
          surfaceTone="dark"
        />
      </ThemeProvider>
    );

    const chip = screen.getByText('Llama 3.3').closest('.MuiChip-root');
    expect(getComputedStyle(chip).color).toBe('rgba(255, 255, 255, 0.85)');
  });
});
