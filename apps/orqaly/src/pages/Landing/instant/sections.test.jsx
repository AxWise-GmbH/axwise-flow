import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { landingTheme } from '../simple/landingTheme';
import { DESKTOP_RELEASE } from '../simple/desktop-release';
import {
  CAPABILITY_GROUPS,
  DEVELOPER_EARLY_LINES,
  DEVELOPER_LINES,
  PLANNED,
  PLANNED_PATTERN,
  SWITCH_ON_LABEL,
  STRIP_NOTES,
} from './capabilities.data';
import SpeedStrip from './SpeedStrip';
import Capabilities from './Capabilities';
import PrivacyPreface from './PrivacyPreface';
import DevelopersMore from './DevelopersMore';
import InstantFaq from './InstantFaq';
import DownloadBlock from './DownloadBlock';

function renderSection(section) {
  return render(
    <ThemeProvider theme={landingTheme}>
      <MemoryRouter>{section}</MemoryRouter>
    </ThemeProvider>
  );
}

function open(name) {
  const toggle = screen.getByRole('button', { name });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return toggle;
}

afterEach(cleanup);

describe('SpeedStrip', () => {
  const FOOTNOTE =
    'Measured once each on 18 Sep 2026 in the Orqanix cloud preview, not in the desktop app, one test scenario. Exact: 1.86 s · 19.08 s (767 words) · 84.04 s (3,951 words). Not averages; yours will differ. A full starter pack is many pieces and takes longer.';

  it('shows exactly three rounded numbers, each with a plain label', () => {
    const { container } = renderSection(<SpeedStrip />);
    expect(screen.getByRole('heading', { level: 2, name: 'Speed' })).toBeInTheDocument();
    expect(screen.getByText('The cloud side, measured')).toBeVisible();
    const pairs = [...container.querySelectorAll('.oi-stat')].map((stat) => [
      // The visible digits count up; the finished figure is the text readers get.
      stat.querySelector('dd .oi-sr-only').textContent,
      stat.querySelector('dt').textContent,
    ]);
    expect(pairs).toEqual([
      ['1.9 s', 'a direct answer'],
      ['19 s', 'a short summary'],
      ['84 s', 'an 8-page document'],
    ]);
    expect(screen.getByText('Single runs · Sept 2026')).toBeVisible();
  });

  it('keeps the exact figures and their limits one click away', () => {
    renderSection(<SpeedStrip />);
    expect(screen.getByText(FOOTNOTE)).not.toBeVisible();
    open('More');
    expect(screen.getByText(FOOTNOTE)).toBeVisible();
    expect(screen.getByRole('link', { name: 'How we measured' })).toHaveAttribute(
      'href',
      '/benchmark'
    );
  });

  it('never words the numbers as checked, live-system or typical results', () => {
    const { container } = renderSection(<SpeedStrip />);
    // "Not averages" is the honest wording; only the bare claim word is banned.
    expect(container.textContent).not.toMatch(/\bverified\b|\bproduction\b|\baverage\b/i);
  });
});

describe('Capabilities', () => {
  it('is one quiet strip now: no heading, no legend, no capability cards', () => {
    const { container } = renderSection(<Capabilities />);
    expect(screen.getByRole('region', { name: 'More inside' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'You stay in control' })).not.toBeInTheDocument();
    expect(screen.queryByText(/In the app today/)).not.toBeInTheDocument();
    expect(container.querySelectorAll('.oi-card')).toHaveLength(0);
  });

  it('carries seven more capabilities on a hand-scrollable rail, each named once', () => {
    const { container } = renderSection(<Capabilities />);
    const strip = screen.getByRole('group', { name: 'More capabilities' });
    expect(strip).toHaveClass('oi-planned');
    expect(within(strip).queryByText('More inside')).not.toBeInTheDocument();

    // Readers get each name once, verbatim, with a drawing that stays silent.
    const items = within(strip).getAllByRole('listitem');
    // Each card says its name, then one short line about it.
    expect(items.map((item) => item.textContent)).toEqual(
      PLANNED.map((name) => `${name}${STRIP_NOTES[name]}`)
    );
    for (const item of items) {
      expect(item.querySelectorAll('svg')).toHaveLength(1);
      for (const drawing of item.querySelectorAll('svg')) {
        expect(drawing).toHaveAttribute('aria-hidden', 'true');
        expect(drawing).toHaveAttribute('focusable', 'false');
      }
    }
    const accessible = strip.cloneNode(true);
    accessible.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
    for (const name of PLANNED) {
      expect(accessible.textContent.split(name), name).toHaveLength(2);
    }
    // The seven names and their lines are all the strip says.
    expect(accessible.textContent).toBe(
      PLANNED.map((name) => `${name}${STRIP_NOTES[name]}`).join('')
    );

    // The second copy only closes the loop: hidden from readers, nothing to tab into.
    const rows = strip.querySelectorAll('.ois-strip-list');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveAttribute('aria-hidden', 'true');
    expect(rows[1].querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull();
    const rail = within(strip).getByRole('region', { name: 'Capabilities, scroll sideways' });
    expect(rail).toHaveAttribute('tabindex', '0');

    // The seven names live in the strip and nowhere else in the section.
    expect(strip.textContent).toMatch(PLANNED_PATTERN);
    const withoutStrip = container.cloneNode(true);
    withoutStrip.querySelectorAll('.oi-planned').forEach((node) => node.remove());
    expect(withoutStrip.textContent).not.toMatch(PLANNED_PATTERN);
  });

  it('presents every item as an equal feature, with no later-marks anywhere', () => {
    const { container } = renderSection(<Capabilities />);
    expect(container.textContent).not.toMatch(
      /planned|what's next|not in the app yet|\bsoon\b|\bcoming\b|\bbeta\b/i
    );
    expect(container.querySelector('[data-planned]')).toBeNull();
    expect(container.querySelector('.oi-planned .oi-badge')).toBeNull();
  });
});

describe('PrivacyPreface', () => {
  it('answers in one line and keeps the old diagram behind More', () => {
    renderSection(<PrivacyPreface />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'What stays on your Mac' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "On your Mac: files, commands, chat history. In the cloud: the AI's thinking."
      )
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'From your request to useful work.' })).toBeNull();
    expect(screen.getByText(/AI model keys stay on our servers/)).not.toBeVisible();

    const toggle = open('More, with the diagram');
    expect(toggle).toHaveTextContent('Less');
    expect(
      screen.getByRole('heading', { name: 'From your request to useful work.' })
    ).toBeVisible();
    expect(
      screen.getByText(
        'Your conversation and the results the AI needs are sent to the cloud to get an answer.'
      )
    ).toBeVisible();
    expect(
      screen.getByText('AI model keys stay on our servers. They never reach your Mac.')
    ).toBeVisible();
    expect(screen.getByLabelText('How Orqanix connects your desktop and the cloud')).toBeVisible();

    fireEvent.click(toggle);
    expect(screen.queryByRole('heading', { name: 'From your request to useful work.' })).toBeNull();
  });
});

describe('DevelopersMore', () => {
  it('stays one closed toggle until a developer asks for more', () => {
    renderSection(<DevelopersMore />);
    const block = screen.getByRole('region', { name: 'For developers' });
    expect(within(block).queryByRole('heading')).toBeNull();
    for (const line of [...DEVELOPER_LINES, ...DEVELOPER_EARLY_LINES]) {
      expect(within(block).getByText(line)).not.toBeVisible();
    }

    open('More for developers');
    for (const line of DEVELOPER_LINES) expect(within(block).getByText(line)).toBeVisible();
    const early = within(block).getByRole('list', { name: 'Early, needs setup' });
    expect(
      within(early)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(DEVELOPER_EARLY_LINES);
  });
});

describe('InstantFaq', () => {
  const ANSWERS = {
    'Do I need to code?':
      'No. You describe what you need in plain words. Orqanix writes the files and shows you each change to review.',
    'What does it cost?':
      'Orqanix is free during the early version. Commercial terms will be published before paid access begins.',
    'Is my data safe?':
      'Your files, commands and chat history stay on your Mac. Your conversation and the results the AI needs are sent to the cloud AI to get an answer. Your sign-in is stored in the macOS Keychain. Chat history is saved on your Mac in a normal file; Orqanix does not add its own encryption.',
    'Will it work on my Mac?':
      'It needs a Mac with an Apple M1 chip or newer. To check: Apple menu > About This Mac > Chip. Intel Macs and Windows are not supported yet; the web version works in any browser.',
    'What does early version mean?':
      'It is a preview build. It works, but it is not notarized by Apple yet, so macOS asks you to confirm the first time you open it. Expect changes.',
  };

  it('has five closed rows that each open to their own answer', () => {
    renderSection(<InstantFaq />);
    expect(screen.getByRole('heading', { level: 2, name: 'Questions' })).toBeInTheDocument();
    const rows = screen.getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual(Object.keys(ANSWERS));
    for (const row of rows) expect(row).toHaveAttribute('aria-expanded', 'false');

    for (const [question, answer] of Object.entries(ANSWERS)) {
      expect(screen.getByText(answer)).not.toBeVisible();
      const row = open(question);
      expect(screen.getByText(answer)).toBeVisible();
      expect(row).toHaveAccessibleName(question);
    }
  });
});

describe('DownloadBlock', () => {
  const RELEASE_FACTS = /Apple Silicon.*MB.*Preview \(not notarized\).*Sign in/;
  const SIZE_MB = Math.round(DESKTOP_RELEASE.bytes / 1_000_000);

  it('offers one download whose release facts are attached even while More is closed', () => {
    renderSection(<DownloadBlock />);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Start with the work in front of you.' })
    ).toBeInTheDocument();
    const downloads = screen.getAllByRole('link', { name: 'Download for macOS' });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toHaveAttribute('href', DESKTOP_RELEASE.url);
    expect(downloads[0]).toHaveAttribute('download', DESKTOP_RELEASE.filename);
    expect(downloads[0]).toHaveAccessibleDescription(RELEASE_FACTS);
    expect(screen.getByText(`Free · M1 Mac or newer · ${SIZE_MB} MB`)).toBeVisible();
    expect(screen.getByText(/Preview \(not notarized\)/)).not.toBeVisible();
    expect(screen.queryByRole('link', { name: 'SHA-256 checksum' })).toBeNull();
  });

  it('opens to the checksum, the chip check, the first-open steps and the web version', () => {
    renderSection(<DownloadBlock />);
    open('More');
    expect(screen.getByText(/Preview \(not notarized\)/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'SHA-256 checksum' })).toHaveAttribute(
      'href',
      `${DESKTOP_RELEASE.url}.sha256`
    );
    expect(
      screen.getByText('Will it run? Apple menu > About This Mac > Chip: Apple M1 or newer.')
    ).toBeVisible();
    const steps = screen.getByRole('list', { name: 'First open' });
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((step) => step.textContent)
    ).toEqual([
      'Open the DMG and drag Orqanix Preview to Applications.',
      'Open it. If macOS blocks it: System Settings > Privacy & Security > Open Anyway.',
      'Sign in with your Orqanix account.',
    ]);
    expect(screen.getByText(/Windows or Intel Mac\? Not yet\./)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Try the web version' })).toHaveAttribute(
      'href',
      '/goals'
    );
  });
});

describe('every static section', () => {
  const SECTIONS = [
    ['SpeedStrip', <SpeedStrip />],
    ['Capabilities', <Capabilities />],
    ['PrivacyPreface', <PrivacyPreface />],
    ['DevelopersMore', <DevelopersMore />],
    ['InstantFaq', <InstantFaq />],
    ['DownloadBlock', <DownloadBlock />],
  ];

  it.each(SECTIONS)('%s is drawn in markup and closed by default', (_name, section) => {
    const { container } = renderSection(section);
    expect(container.querySelector('img, iframe, video')).toBeNull();
    for (const canvas of container.querySelectorAll('canvas')) {
      expect(canvas.closest('[data-orb]')).toHaveAttribute('aria-hidden', 'true');
    }
    const toggles = container.querySelectorAll('.oi-more-toggle');
    // The capability strip has nothing to fold away; every other section keeps a More.
    if (_name !== 'Capabilities') expect(toggles.length).toBeGreaterThan(0);
    for (const toggle of toggles) {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(document.getElementById(toggle.getAttribute('aria-controls'))).not.toBeVisible();
    }
  });

  it('can share one page: ids stay unique and planned words stay in the band', () => {
    const { container } = renderSection(
      <main>
        {SECTIONS.map(([name, section]) => (
          <div key={name}>{section}</div>
        ))}
      </main>
    );
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    for (const id of ['speed', 'control', 'what-stays', 'questions', 'download']) {
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
    }

    const withoutBand = container.cloneNode(true);
    withoutBand.querySelectorAll('.oi-planned').forEach((node) => node.remove());
    expect(withoutBand.textContent).not.toMatch(PLANNED_PATTERN);
    expect(container.textContent).not.toMatch(/\bverified\b|\bproduction\b|sources checked/i);
  });
});
