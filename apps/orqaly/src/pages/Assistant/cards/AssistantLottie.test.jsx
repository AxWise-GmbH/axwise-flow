import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Stub lottie-react so tests do not touch the real animation renderer.
const lottieProps = vi.hoisted(() => ({ last: null }));
vi.mock('lottie-react', () => ({
  default: (props) => {
    lottieProps.last = props;
    return <div data-testid="lottie-stub" />;
  },
}));

import AssistantLottie from './AssistantLottie';
import { buildBrainLottie } from './brainLottie';

const setReducedMotion = (matches) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }));
};

describe('AssistantLottie', () => {
  beforeEach(() => {
    lottieProps.last = null;
  });
  afterEach(() => {
    delete window.matchMedia;
  });

  it('renders the Lottie player and loops by default', () => {
    setReducedMotion(false);
    render(<AssistantLottie animationData={buildBrainLottie('#1e88e5')} ariaLabel="brain" />);
    expect(screen.getByTestId('lottie-stub')).toBeInTheDocument();
    expect(screen.getByLabelText('brain')).toBeInTheDocument();
    expect(lottieProps.last.loop).toBe(true);
    expect(lottieProps.last.autoplay).toBe(true);
  });

  it('holds a static frame when the user prefers reduced motion', () => {
    setReducedMotion(true);
    render(<AssistantLottie animationData={buildBrainLottie('#1e88e5')} ariaLabel="brain" />);
    expect(lottieProps.last.loop).toBe(false);
    expect(lottieProps.last.autoplay).toBe(false);
  });
});

describe('buildBrainLottie', () => {
  it('produces a valid Lottie object themed to the given color', () => {
    const anim = buildBrainLottie('#1e88e5');
    expect(anim.layers.length).toBeGreaterThan(0);
    expect(anim.w).toBeGreaterThan(0);
    expect(anim.op).toBeGreaterThan(anim.ip);
    // Color flows into a fill: 0x1e/255 ~= 0.118 for the red channel.
    const someFill = JSON.stringify(anim).includes('0.11764705882352941');
    expect(someFill).toBe(true);
  });
});
