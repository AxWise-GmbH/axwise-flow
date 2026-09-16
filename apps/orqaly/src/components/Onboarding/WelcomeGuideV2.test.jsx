import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Render GlassIcon's MUI fallbacks (avoids the simple-mode glass map + supabase chain).
vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({ simpleMode: false }),
}));

import WelcomeGuideV2 from './WelcomeGuideV2';
import { WELCOME_V2_PANELS } from '../../config/welcomeGuideContentV2';

function setup(props = {}) {
  const onClose = vi.fn();
  const onSetup = vi.fn();
  render(<WelcomeGuideV2 open onClose={onClose} onSetup={onSetup} {...props} />);
  return { onClose, onSetup };
}

const TOTAL = WELCOME_V2_PANELS.length;
const dot = (n) => screen.getByRole('button', { name: `Go to section ${n} of ${TOTAL}` });
/** 1-based position of a slide, so inserting one does not shift every assertion. */
const at = (id) => WELCOME_V2_PANELS.findIndex((p) => p.id === id) + 1;

describe('WelcomeGuideV2 (story version)', () => {
  it('renders the welcome intro with Orqaly branding', () => {
    setup();
    expect(screen.getByText(/Welcome to Orqaly/i)).toBeInTheDocument();
    expect(screen.getByText(/Describe a goal\. Get a finished result\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Orchestratori/i)).not.toBeInTheDocument();
  });

  it('keeps embedded mockups inert (out of the a11y tree)', () => {
    setup();
    expect(screen.queryByRole('button', { name: /New Request/i })).not.toBeInTheDocument();
  });

  it('walks the story steps via the section dots', () => {
    setup();
    fireEvent.click(dot(2));
    expect(screen.getByText(/Connect Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/learns your business/i)).toBeInTheDocument();

    fireEvent.click(dot(3));
    expect(screen.getByText(/Organization & Consilium/i)).toBeInTheDocument();
    expect(screen.getByText(/board of directors/i)).toBeInTheDocument();

    fireEvent.click(dot(4));
    expect(screen.getByText(/One loop runs everything/i)).toBeInTheDocument();
    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();

    fireEvent.click(dot(5));
    expect(screen.getByText(/View Reports/i)).toBeInTheDocument();
    expect(screen.getByText('Monitor tasks')).toBeInTheDocument();
    expect(screen.getByText('Edit workflows')).toBeInTheDocument();
    expect(screen.getByText('Review conversations')).toBeInTheDocument();

    fireEvent.click(dot(at('easyuse')));
    expect(screen.getByText(/any messenger/i)).toBeInTheDocument();
  });

  it('shows Arena as the place people and agents are compared on the same job', () => {
    setup();
    fireEvent.click(dot(at('arena')));
    expect(screen.getByText(/Compare in Arena/i)).toBeInTheDocument();
    expect(screen.getByText(/where agents beat doing it by hand/i)).toBeInTheDocument();
    expect(screen.getByText('Real cost per job')).toBeInTheDocument();
    expect(screen.getByText('Time and rework')).toBeInTheDocument();
    expect(screen.getByText('A recommendation, not a decision')).toBeInTheDocument();
  });

  it('reuses the hub + operators panels and drops Where-to-start and Key-terms', () => {
    setup();
    fireEvent.click(dot(at('chapters')));
    expect(screen.getByText(/Tap any topic to open its page/i)).toBeInTheDocument();
    fireEvent.click(dot(at('operators')));
    expect(screen.getByText(/Running your own Orqaly/i)).toBeInTheDocument();
    expect(screen.getByText('Personal database')).toBeInTheDocument();
    // Removed slides: Where-to-start CTA and the Key-terms glossary.
    expect(screen.queryByRole('button', { name: 'Start setup' })).not.toBeInTheDocument();
    expect(screen.queryByText(/The words you will see/i)).not.toBeInTheDocument();
  });

  it('fires onSetup from the operators "Open setup" CTA', () => {
    const { onSetup, onClose } = setup();
    fireEvent.click(dot(at('operators')));
    fireEvent.click(screen.getByRole('button', { name: 'Open setup' }));
    expect(onSetup).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the final call-to-action and fires a quick-action event', () => {
    const { onClose } = setup();
    fireEvent.click(dot(at('cta')));
    expect(screen.getByText(/make your first step/i)).toBeInTheDocument();
    ['Activate Assistant', 'Create Organization', 'Select AI Core', 'Hire US'].forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();

    const events = [];
    const handler = (e) => events.push(e.detail?.action);
    window.addEventListener('orch-quick-action', handler);
    fireEvent.click(screen.getByRole('button', { name: 'Select AI Core' }));
    window.removeEventListener('orch-quick-action', handler);

    expect(events).toContain('keys');
    expect(onClose).toHaveBeenCalled();
  });
});
