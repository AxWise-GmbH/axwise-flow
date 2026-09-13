import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import useTextEntryFocused, {
  COMPOSER_TEXT_ENTRY_SELECTOR,
  isComposerTextEntry,
  isTextEntry,
} from './useTextEntryFocused';

// A probe that renders nothing but the hook's answer, so the assertions read as
// the behaviour ("writing", "idle") rather than as DOM plumbing.
function Probe() {
  return <span data-testid="state">{useTextEntryFocused() ? 'writing' : 'idle'}</span>;
}

function field(tag = 'textarea') {
  const el = document.createElement(tag);
  document.body.appendChild(el);
  return el;
}

function composerField(tag = 'textarea', { direct = false } = {}) {
  const el = document.createElement(tag);
  if (direct) {
    el.setAttribute('data-composer-text-entry', '');
    document.body.appendChild(el);
    return el;
  }
  const composer = document.createElement('div');
  composer.setAttribute('data-composer-text-entry', '');
  composer.appendChild(el);
  document.body.appendChild(composer);
  return el;
}

/** focus() alone does not emit focusin in jsdom. */
function focus(el) {
  act(() => {
    el.focus();
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });
}

function blurTo(el, relatedTarget = null) {
  act(() => {
    el.blur();
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }));
  });
}

describe('isTextEntry', () => {
  it('accepts the fields a user writes into', () => {
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isTextEntry(document.createElement('textarea'))).toBe(true);
    expect(isTextEntry(document.createElement('input'))).toBe(true);
    expect(isTextEntry(editable)).toBe(true);
  });

  it('rejects controls that take no text, and non-elements', () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    expect(isTextEntry(checkbox)).toBe(false);
    expect(isTextEntry(document.createElement('button'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe('isComposerTextEntry', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('accepts a text field marked directly or by a composer ancestor', () => {
    expect(isComposerTextEntry(composerField())).toBe(true);
    expect(isComposerTextEntry(composerField('input', { direct: true }))).toBe(true);
  });

  it('rejects ordinary text fields outside a composer scope', () => {
    const filter = field('input');
    expect(filter.closest(COMPOSER_TEXT_ENTRY_SELECTOR)).toBeNull();
    expect(isTextEntry(filter)).toBe(true);
    expect(isComposerTextEntry(filter)).toBe(false);
  });
});

describe('useTextEntryFocused', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('reports idle on a page nobody is typing into', () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('state').textContent).toBe('idle');
  });

  it('turns on when a composer takes focus and off when it leaves', () => {
    const input = composerField();
    const { getByTestId } = render(<Probe />);

    focus(input);
    expect(getByTestId('state').textContent).toBe('writing');

    blurTo(input);
    expect(getByTestId('state').textContent).toBe('idle');
  });

  it('ignores focus landing on a button', () => {
    const button = field('button');
    const { getByTestId } = render(<Probe />);
    focus(button);
    expect(getByTestId('state').textContent).toBe('idle');
  });

  it('ignores unrelated filters and dialog text fields', () => {
    const filter = field('input');
    const dialogField = field();
    const { getByTestId } = render(<Probe />);

    focus(filter);
    expect(getByTestId('state').textContent).toBe('idle');
    focus(dialogField);
    expect(getByTestId('state').textContent).toBe('idle');
  });

  it('stays on when focus moves straight from one composer field to another', () => {
    const a = composerField();
    const b = composerField('input');
    const { getByTestId } = render(<Probe />);

    focus(a);
    // focusout fires before focusin; without relatedTarget the chrome would
    // flash back on for a frame between the two fields.
    blurTo(a, b);
    expect(getByTestId('state').textContent).toBe('writing');
  });

  it('turns off when focus moves from a composer to an ordinary text field', () => {
    const composer = composerField();
    const filter = field('input');
    const { getByTestId } = render(<Probe />);

    focus(composer);
    blurTo(composer, filter);
    expect(getByTestId('state').textContent).toBe('idle');
  });

  it('picks up a composer that already had focus when it mounted', () => {
    const input = composerField();
    input.focus();
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('state').textContent).toBe('writing');
  });

  it('detaches its listeners on unmount', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = render(<Probe />);
    unmount();
    const events = remove.mock.calls.map((c) => c[0]);
    expect(events).toContain('focusin');
    expect(events).toContain('focusout');
  });
});
