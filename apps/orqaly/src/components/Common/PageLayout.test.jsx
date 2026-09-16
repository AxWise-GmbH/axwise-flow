import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PageLayout from './PageLayout';

function renderPageLayout(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// Read back the emotion-generated rule for the title-block Paper so we can
// assert it carries no red/primary tint (only a neutral divider border).
function titleBlockStyle(container) {
  const paper = container.querySelector('.MuiPaper-root');
  const cls = paper
    .getAttribute('class')
    .split(' ')
    .find((c) => c.startsWith('css-'));
  const css = Array.from(document.querySelectorAll('style'))
    .map((s) => s.textContent)
    .join('\n');
  const match = css.match(new RegExp(`\\.${cls}\\{([^}]*)\\}`));
  return match ? match[1] : '';
}

describe('PageLayout', () => {
  it('renders a title block with no accent tint or gradient', () => {
    const { container, getByText } = renderPageLayout(
      <PageLayout title="My Page" subtitle="hello">
        <div>body</div>
      </PageLayout>
    );
    expect(getByText('My Page')).toBeInTheDocument();
    const style = titleBlockStyle(container);
    // No primary-color gradient fill remains; border is the neutral divider.
    expect(style).not.toContain('linear-gradient');
    expect(style).toContain('border-color:rgba(0, 0, 0, 0.12)');
  });

  it('hides the title block when showTitleBlock is false', () => {
    const { container, queryByText } = renderPageLayout(
      <PageLayout title="Hidden" subtitle="x" showTitleBlock={false}>
        <div>body</div>
      </PageLayout>
    );
    expect(queryByText('Hidden')).not.toBeInTheDocument();
    expect(container.querySelector('.MuiPaper-root')).toBeNull();
  });
});
