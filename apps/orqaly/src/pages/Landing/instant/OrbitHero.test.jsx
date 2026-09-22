import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import OrbitHero from './OrbitHero';
import { PULSE_LINK_LABEL } from './HeroPulse';
import { DESKTOP_RELEASE } from '../simple/desktop-release';

const LONG_TEXT = /The AI thinks in the cloud and does the work on your Mac\./;

const LABELS = [
  ['ready', 'Ready to use', 'sign in and start, nothing to set up'],
  ['orchestration', 'Orchestration', 'several AI agents, one plan'],
  ['layering', 'Cognitive layer', 'cloud thinking, local doing, step by step'],
  ['llms', 'Multi LLMs', 'Gemini, OpenAI or Anthropic, your choice'],
  ['plugins', 'Plug-in library', '50+ connectors, switched on one by one'],
  ['voice', 'Voice control', 'talk instead of typing'],
  ['build', 'Build anything', 'documents, web pages and tools, made for you'],
];

function renderHero() {
  return render(
    <ThemeProvider
      theme={createTheme({
        components: { MuiButtonBase: { defaultProps: { disableRipple: true } } },
      })}
    >
      <MemoryRouter>
        <OrbitHero />
      </MemoryRouter>
    </ThemeProvider>
  );
}

function labelList() {
  return screen.getByRole('list', { name: 'What you are looking at' });
}

function labelButton(tag) {
  return within(labelList()).getByRole('button', { name: new RegExp(`^${tag}`) });
}

function stage(container) {
  return container.querySelector('.oh-stage');
}

// This jsdom has no PointerEvent, so fireEvent.pointerEnter would drop pointerType.
// React builds enter/leave from over/out, so those are what gets dispatched.
function movePointer(node, type, pointerType) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(node, event);
}

function hover(node, pointerType = 'mouse') {
  movePointer(node, 'pointerover', pointerType);
}

function unhover(node, pointerType = 'mouse') {
  movePointer(node, 'pointerout', pointerType);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OrbitHero', () => {
  it('shows the exact two-part headline with no eyebrow above it', () => {
    renderHero();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Instant Intelligence.'
    );
    expect(screen.queryByText(/AI app for your Mac/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Turn a Single Prompt into Completed Work - Delivered Directly to Your Mac.')
    ).toBeVisible();
    expect(screen.getByText('For founders and small teams.')).toBeVisible();
    expect(screen.getByText('Free during the early version.')).toBeVisible();
  });

  it('keeps the long text in the page but out of sight until More is opened', () => {
    renderHero();
    const toggle = screen.getByRole('button', { name: 'More' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(LONG_TEXT)).not.toBeVisible();

    fireEvent.click(toggle);
    expect(screen.getByText(LONG_TEXT)).toBeVisible();
    expect(screen.queryByText(/Preview \(not notarized\)/)).toBeNull();
    expect(toggle).toHaveTextContent('Less');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'instant-hero-more');

    fireEvent.click(toggle);
    expect(screen.getByText(LONG_TEXT)).not.toBeVisible();
  });

  it('has one download link, with Apple silicon under it and no release small print', () => {
    renderHero();
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false');
    const downloads = screen.getAllByRole('link', { name: 'Download for macOS' });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toHaveAttribute('href', DESKTOP_RELEASE.url);
    expect(screen.getByText('Apple silicon')).toHaveClass('oh-silicon');
    expect(downloads[0]).toHaveAttribute('download', DESKTOP_RELEASE.filename);
    expect(downloads[0]).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(/Sign in with your Orqanix account/)).toBeNull();
  });

  it('has no second call to action and no screenshots or embeds', () => {
    const { container } = renderHero();
    const hero = container.querySelector('section');
    expect(hero.textContent).not.toMatch(/web version/i);
    expect(hero.textContent).not.toMatch(/Watch it build/i);
    expect(hero.textContent).not.toMatch(/web preview/i);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(container.querySelector('img, iframe, video')).toBeNull();
    // Canvas is reserved for the decorative line-orb.
    for (const canvas of container.querySelectorAll('canvas')) {
      expect(canvas.closest('[data-orb]')).toHaveAttribute('aria-hidden', 'true');
    }
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('lists the seven labels in the agreed order, none pressed and nothing highlighted at the start', () => {
    const { container } = renderHero();
    const buttons = within(labelList()).getAllByRole('button');
    expect(buttons).toHaveLength(7);
    for (const [index, [, tag, line]] of LABELS.entries()) {
      expect(buttons[index]).toHaveTextContent(tag);
      expect(buttons[index]).toHaveTextContent(line);
      expect(buttons[index]).toHaveAttribute('aria-pressed', 'false');
    }
    expect(stage(container)).not.toHaveAttribute('data-active');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('gives every label exactly one part of the scene to light up', () => {
    const { container } = renderHero();
    for (const [key] of LABELS) {
      expect(container.querySelectorAll(`.hp-scene [data-region~='${key}']`)).toHaveLength(1);
    }
  });

  it('sticks on click, releases on a second click, and clears on Escape', () => {
    const { container } = renderHero();
    const llms = labelButton('Multi LLMs');

    fireEvent.click(llms);
    expect(llms).toHaveAttribute('aria-pressed', 'true');
    expect(within(labelList()).getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(stage(container)).toHaveAttribute('data-active', 'llms');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Multi LLMs highlighted: the model chooser under the message box.'
    );

    fireEvent.click(llms);
    expect(llms).toHaveAttribute('aria-pressed', 'false');
    expect(stage(container)).not.toHaveAttribute('data-active');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    fireEvent.click(labelButton('Voice control'));
    expect(stage(container)).toHaveAttribute('data-active', 'voice');
    fireEvent.click(labelButton('Build anything'));
    expect(stage(container)).toHaveAttribute('data-active', 'build');
    expect(labelButton('Voice control')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(labelButton('Build anything')).toHaveAttribute('aria-pressed', 'false');
    expect(stage(container)).not.toHaveAttribute('data-active');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('previews on keyboard focus without pressing, and stops on blur', () => {
    const { container } = renderHero();
    const ide = labelButton('Build anything');
    act(() => ide.focus());
    expect(stage(container)).toHaveAttribute('data-active', 'build');
    expect(ide).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent(
      /^Build anything highlighted: the finished files/
    );
    act(() => ide.blur());
    expect(stage(container)).not.toHaveAttribute('data-active');
  });

  it('previews on mouse hover only, never on touch, and falls back to the sticky label', () => {
    const { container } = renderHero();
    const layering = labelButton('Cognitive layer');
    const coding = labelButton('Build anything');

    hover(layering, 'touch');
    expect(stage(container)).not.toHaveAttribute('data-active');
    hover(layering, 'pen');
    expect(stage(container)).not.toHaveAttribute('data-active');

    hover(layering);
    expect(stage(container)).toHaveAttribute('data-active', 'layering');
    expect(screen.getByRole('status')).toHaveTextContent(/^Cognitive layer highlighted/);
    unhover(layering);
    expect(stage(container)).not.toHaveAttribute('data-active');

    fireEvent.click(coding);
    hover(layering);
    expect(stage(container)).toHaveAttribute('data-active', 'layering');
    expect(layering).toHaveAttribute('aria-pressed', 'false');
    expect(coding).toHaveAttribute('aria-pressed', 'true');
    unhover(layering);
    expect(stage(container)).toHaveAttribute('data-active', 'build');
  });

  it('does not keep the light on after a pressed label is released with the mouse', () => {
    const { container } = renderHero();
    const voice = labelButton('Voice control');
    for (const expected of ['voice', null]) {
      fireEvent.pointerDown(voice);
      act(() => voice.focus());
      fireEvent.click(voice);
      if (expected) expect(stage(container)).toHaveAttribute('data-active', expected);
      else expect(stage(container)).not.toHaveAttribute('data-active');
    }
  });

  it('makes the whole scene one link to the demo with nothing focusable inside', () => {
    renderHero();
    const link = screen.getByRole('link', { name: /^Orqanix at work/ });
    expect(link).toHaveAttribute('href', '#watch');
    expect(link).toHaveAttribute('aria-label', PULSE_LINK_LABEL);
    expect(
      link.querySelector(
        'a, button, input, select, textarea, summary, [tabindex], [contenteditable]'
      )
    ).toBeNull();
    expect(link.children).toHaveLength(1);
    expect(link.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    // The app window itself is the next block down; the hero no longer repeats it.
    expect(link.querySelector('.hw-window')).toBeNull();
    expect(link).toHaveTextContent('Research');
    expect(link).toHaveTextContent('business-plan.md');
  });

  it('stays consistent through a full pass of pointer, click, focus and Escape', () => {
    renderHero();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const orchestration = labelButton('Orchestration');
    hover(orchestration);
    fireEvent.click(orchestration);
    unhover(orchestration);
    // Not element.focus(): jsdom's own focus() schedules a selectionchange with setTimeout.
    fireEvent.focus(labelButton('Multi LLMs'));
    expect(screen.getByRole('status')).toHaveTextContent(/^Multi LLMs highlighted/);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
