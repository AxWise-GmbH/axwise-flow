import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import DocTabBar from './DocTabBar';
import { TABS } from '../data/tabs';

// AppIcon reaches into ThemeContext; stub it so the strip renders in isolation.
vi.mock('../../../components/icons/AppIcon', () => ({ default: () => null }));

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    (() => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
    }));
});

describe('DocTabBar', () => {
  it('renders a pill for every tab', () => {
    const { getByText } = render(<DocTabBar tabs={TABS} active="start" onChange={() => {}} />);
    expect(getByText('Getting Started')).toBeInTheDocument();
    expect(getByText('LLM Providers')).toBeInTheDocument();
    expect(getByText('API Keys')).toBeInTheDocument();
  });

  it('fires onChange with the tab key when a pill is clicked', () => {
    const onChange = vi.fn();
    const { getByText } = render(<DocTabBar tabs={TABS} active="start" onChange={onChange} />);
    fireEvent.click(getByText('Consilium'));
    expect(onChange).toHaveBeenCalledWith('consilium');
  });

  it('marks the active pill as selected', () => {
    const { getByRole } = render(<DocTabBar tabs={TABS} active="faq" onChange={() => {}} />);
    const faqTab = getByRole('tab', { name: 'FAQ' });
    expect(faqTab).toHaveAttribute('aria-selected', 'true');
  });
});
