import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import Anywhere from './Anywhere';

const LIVE = [
  ['Desktop App', 'The full workspace on your Mac.'],
  ['Messenger by Choice', 'Message it in the messenger you already use.'],
  ['Email', 'Briefs and results in your inbox.'],
];

// The owner presents all five channels as equals: no group or badge sets any apart.
const MORE = [
  ['Voice Commands', 'Say it instead of typing it.'],
  ['Mobile Application', 'Your workspace in your pocket.'],
];

function renderBlock() {
  return render(
    <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
      <Anywhere />
    </ThemeProvider>
  );
}

function channels() {
  return screen.getByRole('list', { name: 'Channels' });
}

function row(name) {
  return within(channels()).getByRole('button', { name: new RegExp(`^${name}`) });
}

// This jsdom has no PointerEvent, so fireEvent.pointerEnter would drop pointerType.
// React builds enter/leave from over/out, so those are what gets dispatched.
function movePointer(node, type, pointerType = 'mouse') {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(node, event);
}

const IDS = ['desktop', 'messenger', 'email', 'voice', 'mobile'];

function activeDevices(container) {
  return [...container.querySelectorAll('.oia-dev[data-active="true"]')];
}

describe('Anywhere', () => {
  it('is one labelled section with the heading, the bracket tag and a single line', () => {
    const { container } = renderBlock();
    const heading = screen.getByRole('heading', { level: 2, name: 'Chat from anywhere.' });
    expect(heading).toHaveClass('oi-h2');
    const section = heading.closest('section');
    expect(section).toHaveAttribute('id', 'anywhere');
    expect(section).toHaveAttribute('aria-labelledby', heading.id);
    expect(section).toHaveClass('oi-section');
    expect(container.querySelectorAll('section')).toHaveLength(1);

    const tag = screen.getByText('Connectivity');
    expect(tag).toHaveClass('oi-tag', 'oi-tag-bracket');
    expect(screen.getByText('Reach Orqanix from where you already are.')).toBeInTheDocument();
  });

  it('lists all five channels word for word, none marked or set apart', () => {
    renderBlock();
    for (const [name, line] of [...LIVE, ...MORE]) {
      const button = row(name);
      expect(within(button).getByText(name)).toBeInTheDocument();
      expect(within(button).getByText(line)).toBeInTheDocument();
      expect(button.closest('[data-planned]')).toBeNull();
      expect(button.querySelector('.oi-badge')).toBeNull();
    }
  });

  it('makes every row a button in the Channels list, in the given order', () => {
    renderBlock();
    const buttons = within(channels()).getAllByRole('button');
    expect(buttons.map((button) => button.querySelector('.oia-row-name').textContent)).toEqual(
      [...LIVE, ...MORE].map(([name]) => name)
    );
    for (const button of buttons) {
      expect(button).toHaveAttribute('type', 'button');
      expect(button).toHaveAttribute('aria-pressed');
    }
    expect(document.querySelector('[data-planned]')).toBeNull();
    expect(screen.queryByText('Planned')).not.toBeInTheDocument();
  });

  it('starts on the first row and moves aria-pressed to the row that is clicked', () => {
    const { container } = renderBlock();
    expect(row('Desktop App')).toHaveAttribute('aria-pressed', 'true');
    expect(within(channels()).getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(activeDevices(container)).toHaveLength(1);

    fireEvent.click(row('Email'));
    expect(row('Email')).toHaveAttribute('aria-pressed', 'true');
    expect(row('Desktop App')).toHaveAttribute('aria-pressed', 'false');
    expect(within(channels()).getAllByRole('button', { pressed: true })).toHaveLength(1);

    fireEvent.click(row('Email'));
    expect(row('Email')).toHaveAttribute('aria-pressed', 'true');
    expect(within(channels()).getAllByRole('button', { pressed: true })).toHaveLength(1);
  });

  it('lights a channel on hover or focus, then falls back to the pressed one', () => {
    const { container } = renderBlock();
    const litRow = () => container.querySelector('.oia-row[data-active="true"]');
    expect(litRow()).toBe(row('Desktop App'));

    movePointer(row('Messenger by Choice'), 'pointerover');
    expect(litRow()).toBe(row('Messenger by Choice'));
    expect(row('Desktop App')).toHaveAttribute('aria-pressed', 'true');
    expect(activeDevices(container)).toHaveLength(1);
    expect(container.querySelectorAll('.oia-link[data-active="true"]')).toHaveLength(1);
    movePointer(row('Messenger by Choice'), 'pointerout');
    expect(litRow()).toBe(row('Desktop App'));

    // A finger must not leave a row stuck in its hover state.
    movePointer(row('Email'), 'pointerover', 'touch');
    expect(litRow()).toBe(row('Desktop App'));

    fireEvent.focus(row('Voice Commands'));
    expect(litRow()).toBe(row('Voice Commands'));
    expect(activeDevices(container)[0]).toHaveAttribute('data-channel', 'voice');
    fireEvent.blur(row('Voice Commands'));
    expect(litRow()).toBe(row('Desktop App'));
    expect(activeDevices(container)[0]).toHaveAttribute('data-channel', 'desktop');
  });

  it('lets a mouse pick a channel from its device in the scene', () => {
    const { container } = renderBlock();
    const device = container.querySelector('.oia-dev[data-channel="mobile"]');
    movePointer(device, 'pointerover');
    expect(container.querySelector('.oia-row[data-active="true"]')).toBe(row('Mobile Application'));
    expect(row('Desktop App')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(device);
    expect(row('Mobile Application')).toHaveAttribute('aria-pressed', 'true');
  });

  it('draws five devices, each joined to the card by its own line', () => {
    const { container } = renderBlock();
    const scene = container.querySelector('.oia-scene');
    const devices = [...scene.querySelectorAll('.oia-dev')];
    expect(devices.map((device) => device.getAttribute('data-channel'))).toEqual(IDS);

    const links = [...scene.querySelectorAll('.oia-link')];
    expect(links.map((link) => link.getAttribute('data-channel'))).toEqual(IDS);
    expect(scene.querySelectorAll('path.oia-link-base')).toHaveLength(5);
    for (const link of links) {
      const base = link.querySelector('path.oia-link-base');
      expect(base.getAttribute('d')).toMatch(/^M[\d .-]+C[\d .-]+$/);
      expect(base).toHaveAttribute('pathLength', '100');
      // Messages travel both ways along the same curve.
      for (const packet of link.querySelectorAll('.oia-packet')) {
        expect(packet.getAttribute('d')).toBe(base.getAttribute('d'));
      }
      expect(link.querySelectorAll('.oia-packet-in')).toHaveLength(1);
      expect(link.querySelectorAll('.oia-packet-out')).toHaveLength(1);
    }
  });

  it('puts Orqanix in the middle as a chat card that answers the active channel', () => {
    const { container } = renderBlock();
    const card = container.querySelector('.oia-card');
    expect(card.querySelector('svg.oia-mark')).not.toBeNull();
    expect(within(card).getByText('Ask whatever\u2019s on your mind.')).toBeInTheDocument();
    expect(card.querySelector('.oia-caret')).not.toBeNull();

    const reply = () => card.querySelector('.oia-card-reply');
    expect(reply()).toHaveAttribute('data-channel', 'desktop');
    const first = reply();
    fireEvent.click(row('Email'));
    expect(reply()).toHaveAttribute('data-channel', 'email');
    // A fresh node each time, so the slide-in plays again.
    expect(reply()).not.toBe(first);
    expect(container.querySelectorAll('.oia-link[data-active="true"]')).toHaveLength(1);
    expect(container.querySelector('.oia-link[data-active="true"]')).toHaveAttribute(
      'data-channel',
      'email'
    );
  });

  it('keeps the scene decorative: hidden from assistive tech, nothing focusable inside', () => {
    const { container } = renderBlock();
    const scene = container.querySelector('.oia-scene');
    expect(scene).toHaveAttribute('aria-hidden', 'true');
    expect(scene.querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull();
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
    }
  });

  it('draws everything in markup: no canvas, no orb, no embedded media', () => {
    const { container } = renderBlock();
    expect(container.querySelector('canvas, img, iframe, video')).toBeNull();
    expect(container.querySelector('[data-orb]')).toBeNull();
  });

  it('never words a claim the app cannot back', () => {
    const { container } = renderBlock();
    const text = container.textContent;
    expect(text).not.toMatch(
      /shield|data leaks|SOC2|verified|production|beta|Orqaly|AxWise|Slack|Telegram|WhatsApp|any LLM/i
    );
    expect(text).not.toMatch(/\bPlanned\b|\bsoon\b/i);
    expect(text).not.toMatch(
      /\bPIN\b|YubiKey|U2F|password vault|voice-to-voice|spoken replies|built-in browser|mind.?map/i
    );
  });
});
