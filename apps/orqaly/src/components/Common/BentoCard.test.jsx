import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import BentoCard from './BentoCard';

// PageExplain pulls in tour/route context; stub it so `explain` cards mount in isolation.
vi.mock('./PageExplain', () => ({
  default: () => <button type="button" aria-label="Explain this page" />,
}));

// The content area is the Paper's last child. Read back its emotion-generated
// rule so we can assert the overflow behaviour the `scrollBody` prop controls.
function ruleFor(el) {
  const cls = el
    .getAttribute('class')
    .split(' ')
    .find((c) => c.startsWith('css-'));
  const css = Array.from(document.querySelectorAll('style'))
    .map((s) => s.textContent)
    .join('\n');
  const match = css.match(new RegExp(`\\.${cls}\\{([^}]*)\\}`));
  return match ? match[1] : '';
}

function bodyStyle(container) {
  const paper = container.querySelector('.MuiPaper-root');
  return ruleFor(paper.lastElementChild);
}

// Header is the Paper's first child when the card has a header.
function headerStyle(container) {
  const paper = container.querySelector('.MuiPaper-root');
  return ruleFor(paper.firstElementChild);
}

describe('BentoCard', () => {
  it('renders its title and children', () => {
    const { getByText } = render(
      <BentoCard title="My Card" icon={HomeRoundedIcon}>
        <div>inner content</div>
      </BentoCard>
    );
    expect(getByText('My Card')).toBeInTheDocument();
    expect(getByText('inner content')).toBeInTheDocument();
  });

  it('does not scroll the body by default', () => {
    const { container } = render(
      <BentoCard title="Static" icon={HomeRoundedIcon}>
        <div>x</div>
      </BentoCard>
    );
    expect(bodyStyle(container)).not.toContain('overflow-y:auto');
  });

  it('scrolls the body when scrollBody is set', () => {
    const { container } = render(
      <BentoCard title="Scrolls" icon={HomeRoundedIcon} scrollBody>
        <div>x</div>
      </BentoCard>
    );
    expect(bodyStyle(container)).toContain('overflow-y:auto');
  });

  it('never tints the header with the accent (transparent, divider kept)', () => {
    const { container } = render(
      <BentoCard title="Untinted" icon={HomeRoundedIcon}>
        <div>x</div>
      </BentoCard>
    );
    const header = headerStyle(container);
    expect(header).toContain('background-color:transparent');
    expect(header).toContain('border-bottom:1px solid');
  });

  it('also drops the header divider when plainHeader is set', () => {
    const { container } = render(
      <BentoCard title="Plain" icon={HomeRoundedIcon} plainHeader>
        <div>x</div>
      </BentoCard>
    );
    const header = headerStyle(container);
    expect(header).toContain('background-color:transparent');
    expect(header).toContain('border-bottom:none');
  });

  it('hides the visible title on page-wrapper (explain) cards, keeping the help button', () => {
    const { queryByText, getByLabelText, getByText } = render(
      <BentoCard title="Workflows" icon={HomeRoundedIcon} explain noTour>
        <div>body</div>
      </BentoCard>
    );
    expect(queryByText('Workflows')).toBeNull();
    expect(getByLabelText('Explain this page')).toBeInTheDocument();
    expect(getByText('body')).toBeInTheDocument();
  });

  it('hides the visible title when hideTitle is set', () => {
    const { queryByText, getByText } = render(
      <BentoCard title="Also Hidden" icon={HomeRoundedIcon} hideTitle>
        <div>body</div>
      </BentoCard>
    );
    expect(queryByText('Also Hidden')).toBeNull();
    expect(getByText('body')).toBeInTheDocument();
  });

  describe('collapsible (compact) mode', () => {
    it('renders children inline and shows no More button by default', () => {
      const { getByText, queryByRole } = render(
        <BentoCard title="Full" subtitle="desc" icon={HomeRoundedIcon}>
          <div>always body</div>
        </BentoCard>
      );
      expect(getByText('always body')).toBeInTheDocument();
      expect(queryByRole('button', { name: /^more$/i })).toBeNull();
    });

    it('hides children behind a More button when collapsible', () => {
      const { queryByText, getByRole } = render(
        <BentoCard title="Compact" subtitle="desc" icon={HomeRoundedIcon} collapsible>
          <div>hidden body</div>
        </BentoCard>
      );
      // Header (title + description) still shows; the body starts collapsed.
      expect(queryByText('hidden body')).toBeNull();
      expect(getByRole('button', { name: /more/i })).toBeInTheDocument();
    });

    it('expands children and flips to Less when More is clicked', () => {
      const { getByText, getByRole } = render(
        <BentoCard title="Compact" subtitle="desc" icon={HomeRoundedIcon} collapsible>
          <div>hidden body</div>
        </BentoCard>
      );
      fireEvent.click(getByRole('button', { name: /more/i }));
      expect(getByText('hidden body')).toBeInTheDocument();
      expect(getByRole('button', { name: /less/i })).toBeInTheDocument();
    });
  });
});
