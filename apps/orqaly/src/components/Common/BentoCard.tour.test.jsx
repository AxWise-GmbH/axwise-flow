import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';

import BentoCard from './BentoCard';

const theme = createTheme();
const renderCard = (props) =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <BentoCard {...props}>body</BentoCard>
      </ThemeProvider>
    </MemoryRouter>
  );

describe('BentoCard tour registration', () => {
  it('emits data-tour-block/label from the title', () => {
    const { container } = renderCard({ title: 'Key Stats' });
    const el = container.querySelector('[data-tour-block="key-stats"]');
    expect(el).toBeTruthy();
    expect(el.getAttribute('data-tour-label')).toBe('Key Stats');
  });

  it('noTour opts a card out of the tour', () => {
    const { container } = renderCard({ title: 'Wrapper', noTour: true });
    expect(container.querySelector('[data-tour-block]')).toBeNull();
  });

  it('explain renders the Explain button', () => {
    const { getByLabelText } = renderCard({ title: 'Page', explain: true });
    expect(getByLabelText('Explain this page')).toBeTruthy();
  });
});
