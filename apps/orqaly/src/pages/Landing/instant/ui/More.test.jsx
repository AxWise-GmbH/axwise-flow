import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import More from './More';

describe('More', () => {
  it('starts closed with its content still in the document', () => {
    render(
      <More>
        <p>Hidden detail</p>
      </More>
    );
    const toggle = screen.getByRole('button', { name: 'More' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Hidden detail')).toBeInTheDocument();
    expect(screen.getByText('Hidden detail')).not.toBeVisible();
  });

  it('opens and closes, and the toggle names the state', () => {
    render(
      <More>
        <p>Hidden detail</p>
      </More>
    );
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const toggle = screen.getByRole('button', { name: 'Less' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Hidden detail')).toBeVisible();
    expect(document.getElementById(toggle.getAttribute('aria-controls'))).toContainElement(
      screen.getByText('Hidden detail')
    );

    fireEvent.click(toggle);
    expect(screen.getByText('Hidden detail')).not.toBeVisible();
  });

  it('lets closed content describe another control', () => {
    render(
      <>
        <a href="/file" aria-describedby="facts">
          Download
        </a>
        <More>
          <p id="facts">286 MB, sign-in needed</p>
        </More>
      </>
    );
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAccessibleDescription(
      '286 MB, sign-in needed'
    );
  });

  it('can read as a question row that keeps its label when open', () => {
    render(
      <More row label="Do I need to code?" openLabel="Do I need to code?" id="faq-code">
        <p>No.</p>
      </More>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Do I need to code?' }));
    expect(screen.getByRole('button', { name: 'Do I need to code?' })).toHaveAttribute(
      'aria-controls',
      'faq-code'
    );
    expect(screen.getByText('No.')).toBeVisible();
  });
});
