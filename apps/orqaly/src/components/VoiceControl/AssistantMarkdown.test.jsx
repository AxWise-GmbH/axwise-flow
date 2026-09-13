import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AssistantMarkdown, { markdownBlockCount } from './AssistantMarkdown.jsx';

describe('AssistantMarkdown', () => {
  it('parses inline Markdown without showing formatting markers', () => {
    const { container } = render(
      <AssistantMarkdown text={'A **clear** answer with *emphasis* and `inlineCode`.'} />
    );

    expect(container.querySelector('strong')?.textContent).toBe('clear');
    expect(container.querySelector('em')?.textContent).toBe('emphasis');
    expect(container.querySelector('code')?.textContent).toBe('inlineCode');
    expect(container.textContent).not.toContain('**');
    expect(container.textContent).not.toContain('`');
  });

  it('starts assistant-authored heading hierarchy at h2', () => {
    render(<AssistantMarkdown text={'# Overview\n\n## Supporting detail'} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Supporting detail' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('renders nested unordered and ordered lists semantically', () => {
    const { container } = render(
      <AssistantMarkdown
        text={['- Parent', '  - Nested child', '- Sibling', '', '1. First', '2. Second'].join('\n')}
      />
    );

    expect(container.querySelectorAll('ul')).toHaveLength(2);
    expect(container.querySelector('ul ul li')?.textContent).toContain('Nested child');
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
  });

  it('renders links containing balanced parentheses and preserves local-link behaviour', () => {
    render(
      <AssistantMarkdown
        text={[
          '[External specification](https://example.com/spec_(draft))',
          '',
          '[Local section](#details)',
        ].join('\n')}
      />
    );

    expect(screen.getByRole('link', { name: 'External specification' })).toHaveAttribute(
      'href',
      'https://example.com/spec_(draft)'
    );
    expect(screen.getByRole('link', { name: 'External specification' })).toHaveAttribute(
      'target',
      '_blank'
    );
    expect(screen.getByRole('link', { name: 'Local section' })).not.toHaveAttribute('target');
  });

  it('keeps bare URLs readable and only links explicitly authored Markdown links', () => {
    render(
      <AssistantMarkdown
        text={
          'Bare source: https://example.com/source\n\n[Open source](https://example.com/source)'
        }
      />
    );

    expect(screen.getByText(/Bare source: https:\/\/example\.com\/source/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'https://example.com/source' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open source' })).toHaveAttribute(
      'href',
      'https://example.com/source'
    );
  });

  it('renders GFM tables semantically with readable linked cells', () => {
    render(
      <AssistantMarkdown
        text={[
          '| Source | Status |',
          '| --- | ---: |',
          '| [EU guidance](https://example.eu/guidance) | Verified |',
        ].join('\n')}
      />
    );

    expect(screen.getByRole('table', { name: 'Markdown table' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Source' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Verified' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'EU guidance' })).toHaveAttribute(
      'href',
      'https://example.eu/guidance'
    );
  });

  it('renders task lists, blockquotes, rules, and labelled fenced code', () => {
    const { container } = render(
      <AssistantMarkdown
        text={[
          '- [x] Verified',
          '- [ ] Pending',
          '',
          '> Evidence should remain secondary.',
          '',
          '---',
          '',
          '```js',
          'const ready = true;',
          '```',
        ].join('\n')}
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Completed task: Verified' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Not completed task: Pending' })).not.toBeChecked();
    expect(container.querySelector('blockquote')?.textContent).toContain(
      'Evidence should remain secondary.'
    );
    expect(container.querySelector('hr')).toBeTruthy();
    expect(container.querySelector('pre code')?.textContent).toContain('const ready = true;');
    expect(screen.getByText('js')).toBeTruthy();
  });

  it.each([
    ['script URL', 'javascript:alert(1)'],
    ['protocol-relative URL', '//evil.example/path'],
    ['backslash authority URL', '/\\evil.example/path'],
    ['encoded backslash authority URL', '/%5Cevil.example/path'],
    ['data URL', 'data:text/html,unsafe'],
  ])('does not make an unsafe %s clickable', (_label, href) => {
    render(<AssistantMarkdown text={`[Unsafe](${href})`} />);

    expect(screen.getByText('Unsafe')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Unsafe' })).toBeNull();
  });

  it('does not execute, mount, or expose dangerous raw HTML content', () => {
    const { container } = render(
      <AssistantMarkdown
        text={[
          'Before <script>window.__unsafe = true</script> after',
          '',
          '<img src=x onerror="window.__unsafe = true">',
          '',
          '<button onclick="window.__unsafe = true">Unsafe control</button>',
        ].join('\n')}
      />
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
    expect(container.textContent).not.toContain('window.__unsafe');
    expect(container.textContent).not.toContain('<script>');
    expect(container.textContent).not.toContain('onerror');
    expect(globalThis.__unsafe).toBeUndefined();
  });

  it('rejects data images while allowing safe remote images', () => {
    const { container } = render(
      <AssistantMarkdown
        text={[
          '![Unsafe image](data:text/html,%3Cscript%3Ealert(1)%3C/script%3E)',
          '',
          '![Safe diagram](https://images.example.com/diagram.png)',
        ].join('\n')}
      />
    );

    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Safe diagram' })).toHaveAttribute(
      'src',
      'https://images.example.com/diagram.png'
    );
    expect(screen.getByText('Unsafe image')).toBeInTheDocument();
  });

  it('keeps HTML-looking text visible when it is explicitly fenced as code', () => {
    const { container } = render(
      <AssistantMarkdown text={'```html\n<button onclick="demo()">Example</button>\n```'} />
    );

    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('pre code')).toHaveTextContent(
      '<button onclick="demo()">Example</button>'
    );
  });

  it('limits previews at complete top-level Markdown blocks', () => {
    render(
      <AssistantMarkdown
        maxBlocks={2}
        text={[
          '# Summary',
          '',
          'The visible conclusion is **properly parsed**.',
          '',
          '## Hidden section',
          '',
          'This content must not enter the accessibility tree.',
        ].join('\n')}
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Summary' })).toBeTruthy();
    expect(screen.getByText(/The visible conclusion is/).querySelector('strong')).toHaveTextContent(
      'properly parsed'
    );
    expect(screen.getByText('…')).toBeTruthy();
    expect(screen.queryByText('Hidden section')).toBeNull();
    expect(screen.queryByText(/must not enter/)).toBeNull();
  });

  it('counts complete parsed blocks for collapsible document controls', () => {
    const source = [
      '# Heading',
      '',
      'A paragraph with **inline formatting**.',
      '',
      '- A list',
      '  - with a nested item',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n');

    expect(markdownBlockCount(source)).toBe(4);
    expect(markdownBlockCount('   ')).toBe(0);
    expect(markdownBlockCount('![](https://images.example.com/decorative.png)')).toBe(1);
    expect(markdownBlockCount('![](data:text/html,unsafe)')).toBe(0);
  });

  it('preserves definitions required by retained reference links', () => {
    const source = [
      '[Official guide][guide]',
      '',
      'This second block is hidden.',
      '',
      '[guide]: https://example.com/guide_(current)',
    ].join('\n');

    render(<AssistantMarkdown text={source} maxBlocks={1} />);

    expect(screen.getByRole('link', { name: 'Official guide' })).toHaveAttribute(
      'href',
      'https://example.com/guide_(current)'
    );
    expect(screen.queryByText('This second block is hidden.')).toBeNull();
    expect(screen.getByText('…')).toBeInTheDocument();
  });

  it('does not count definitions or skipped raw HTML as visible blocks', () => {
    expect(markdownBlockCount('[guide]: https://example.com')).toBe(0);
    expect(markdownBlockCount('<div>Skipped raw HTML</div>')).toBe(0);
    expect(markdownBlockCount('<span></span>')).toBe(0);
    expect(
      markdownBlockCount(
        '[Official guide][guide]\n\nVisible paragraph.\n\n[guide]: https://example.com'
      )
    ).toBe(2);
  });

  it('returns nothing for empty input', () => {
    const { container } = render(<AssistantMarkdown text={'   '} />);
    expect(container.firstChild).toBeNull();
  });
});
