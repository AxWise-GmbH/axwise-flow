import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import IntegrationsHub from './IntegrationsHub';

const CONNECTORS = [
  'Playwright',
  'Chrome DevTools',
  'Asana',
  'Netlify',
  'Neon',
  'MongoDB',
  'Square',
  'Tavily Web Search',
  'Exa Search',
  'PDF Reader',
  'YouTube Transcript',
  'Excalidraw',
  'Context7',
  'Repomix',
  'Fetch',
];

function renderHub() {
  return render(
    <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
      <IntegrationsHub />
    </ThemeProvider>
  );
}

const CARDS = [
  ['Gemini', 'gemini'],
  ['OpenAI', 'openai'],
  ['Anthropic', 'anthropic'],
  ['GitHub', 'github'],
  ['Figma', 'figma'],
  ['Supabase', 'supabase'],
];

afterEach(cleanup);

describe('IntegrationsHub', () => {
  it('is one labelled section with the heading, the tag and the one line', () => {
    const { container } = renderHub();
    const heading = screen.getByRole('heading', { level: 2, name: 'Plug in any LLM & Tool' });
    expect(heading).toHaveClass('oi-h2');
    const sections = container.querySelectorAll('section');
    expect(sections).toHaveLength(1);
    expect(sections[0]).toHaveAttribute('id', 'integrations');
    expect(sections[0]).toHaveClass('oi-section');
    expect(sections[0]).toHaveAttribute('aria-labelledby', heading.id);
    expect(screen.getByText('Integrations')).toHaveClass('oi-tag-bracket');
    expect(screen.getByText('One workspace for everything.')).toBeVisible();
  });

  it('lists three models and three tools, each with its type tag', () => {
    renderHub();
    const models = screen.getByRole('list', { name: 'Models' });
    const tools = screen.getByRole('list', { name: 'Tools' });
    expect(
      within(models)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.oih-name').textContent)
    ).toEqual(['Gemini', 'OpenAI', 'Anthropic']);
    expect(
      within(tools)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.oih-name').textContent)
    ).toEqual(['GitHub', 'Figma', 'Supabase']);
    expect(within(models).getAllByText('LLM')).toHaveLength(3);
    expect(within(tools).getAllByText('Tool')).toHaveLength(3);
  });

  it("shows each product's own mark from brandMarks, one per card", () => {
    const { container } = renderHub();
    for (const [name, brand] of CARDS) {
      const card = screen.getByRole('button', { name: new RegExp(`^${name}`) });
      const marks = card.querySelectorAll('svg');
      expect(marks).toHaveLength(1);
      expect(marks[0]).toHaveAttribute('data-brand', brand);
      expect(marks[0]).toHaveAttribute('viewBox', '0 0 24 24');
      expect(marks[0]).toHaveAttribute('fill', 'currentColor');
      expect(marks[0].querySelectorAll('path')).toHaveLength(1);
    }
    expect(container.querySelectorAll('svg[data-brand]')).toHaveLength(6);
  });

  it('presents all six as equals: nothing planned, badged, dashed or set apart', () => {
    const { container } = renderHub();
    expect(container.querySelectorAll('[data-planned]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-status]')).toHaveLength(0);
    expect(container.querySelectorAll('.oi-badge')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-pressed]')).toHaveLength(0);
    expect(container.textContent).not.toMatch(
      /planned|soon|coming|\bbeta\b|what's next|not in the app|switch it on/i
    );
    const shapes = [...container.querySelectorAll('.oih-card')].map((card) =>
      [...card.children].map((child) => child.className).join(' ')
    );
    expect(new Set(shapes).size).toBe(1);
  });

  it('draws six curved wires, and light travels on every one', () => {
    const { container } = renderHub();
    const wires = [...container.querySelectorAll('.oih-wire')];
    expect(wires).toHaveLength(6);
    for (const wire of wires) {
      expect(wire.querySelector('.oih-tail')).not.toBeNull();
      expect(wire.querySelector('.oih-pulse')).not.toBeNull();
      expect(wire.querySelector('.oih-lit')).not.toBeNull();
      expect(wire.querySelector('.oih-rail').getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+C/);
    }
  });

  it('brightens the wire of the card in focus and swells the orb, then lets go', () => {
    const { container } = renderHub();
    const hub = container.querySelector('.oih-hub');
    const lit = () => [...container.querySelectorAll('.oih-wire[data-active="true"]')];
    expect(lit()).toHaveLength(0);
    expect(hub).toHaveAttribute('data-swell', 'false');
    for (const [name] of CARDS) {
      const card = screen.getByRole('button', { name: new RegExp(`^${name}`) });
      fireEvent.focus(card);
      expect(lit()).toHaveLength(1);
      expect(hub).toHaveAttribute('data-swell', 'true');
      fireEvent.blur(card);
      expect(lit()).toHaveLength(0);
      expect(hub).toHaveAttribute('data-swell', 'false');
    }
  });

  it('sends a fresh pulse down the wire of a pressed card', () => {
    const { container } = renderHub();
    const figma = screen.getByRole('button', { name: /^Figma/ });
    fireEvent.click(figma);
    const lit = container.querySelectorAll('.oih-wire[data-active="true"]');
    expect(lit).toHaveLength(1);
    const first = lit[0].querySelector('.oih-pulse');
    fireEvent.click(figma);
    const second = container.querySelector('.oih-wire[data-active="true"] .oih-pulse');
    // A new element: its run starts again from the card.
    expect(second).not.toBe(first);
  });

  it('runs the connector names as plain text, with the looping copy hidden from readers', () => {
    const { container } = renderHub();
    const lists = container.querySelectorAll('.oih-marquee ul');
    expect(lists).toHaveLength(2);
    expect(lists[0]).not.toHaveAttribute('aria-hidden');
    expect(lists[1]).toHaveAttribute('aria-hidden', 'true');
    for (const list of lists) {
      expect([...list.querySelectorAll('li')].map((item) => item.textContent)).toEqual(CONNECTORS);
    }
    // Focusable, so the keyboard can stop the movement as the pointer can.
    expect(screen.getByRole('group', { name: 'Connectors' })).toHaveAttribute('tabindex', '0');
  });

  it('closes with the exact small line', () => {
    renderHub();
    const line = screen.getByText('50+ connectors.');
    expect(line).toHaveClass('oi-small');
    expect(line.textContent).toBe('50+ connectors.');
  });

  it('draws everything in markup, with canvas reserved for the decorative orb', () => {
    const { container } = renderHub();
    expect(container.querySelector('img, iframe, video')).toBeNull();
    const canvases = container.querySelectorAll('canvas');
    expect(canvases).toHaveLength(1);
    for (const canvas of canvases) {
      expect(canvas.closest('[data-orb]')).toHaveAttribute('aria-hidden', 'true');
    }
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
    }
  });

  it('never words a claim the app cannot back', () => {
    const { container } = renderHub();
    expect(container.textContent).not.toMatch(
      /shield|data leaks|SOC2|\bverified\b|\bproduction\b|Orqaly|AxWise|Slack|Telegram/i
    );
    expect(container.textContent).not.toMatch(
      /\bPIN\b|YubiKey|U2F|password vault|voice-to-voice|spoken replies|built-in browser|mind.?map/i
    );
  });

  it('uses each id once', () => {
    const { container } = renderHub();
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });
});
