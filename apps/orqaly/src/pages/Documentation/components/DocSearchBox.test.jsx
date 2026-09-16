import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import DocSearchBox from './DocSearchBox';

const results = [
  { id: 'doc-faq-0', tab: 'faq', type: 'faq', title: 'What is Orqaly', subtitle: 'Intro', body: '' },
  { id: 'doc-provider-groq', tab: 'providers', type: 'provider', title: 'Groq', subtitle: 'llama-3.3-70b', body: '' },
];

describe('DocSearchBox', () => {
  it('opens a results dropdown on focus when a query is present', () => {
    const { getByLabelText, getByText } = render(
      <DocSearchBox query="orq" setQuery={() => {}} results={results} onSelect={() => {}} onClear={() => {}} />
    );
    fireEvent.focus(getByLabelText('Search documentation'));
    expect(getByText('What is Orqaly')).toBeInTheDocument();
    expect(getByText('Groq')).toBeInTheDocument();
  });

  it('calls onSelect with the record when a result is chosen', () => {
    const onSelect = vi.fn();
    const { getByLabelText, getByText } = render(
      <DocSearchBox query="orq" setQuery={() => {}} results={results} onSelect={onSelect} onClear={() => {}} />
    );
    fireEvent.focus(getByLabelText('Search documentation'));
    fireEvent.mouseDown(getByText('What is Orqaly'));
    expect(onSelect).toHaveBeenCalledWith(results[0]);
  });

  it('calls onClear when the clear button is pressed', () => {
    const onClear = vi.fn();
    const { getByLabelText } = render(
      <DocSearchBox query="orq" setQuery={() => {}} results={results} onSelect={() => {}} onClear={onClear} />
    );
    fireEvent.click(getByLabelText('Clear search'));
    expect(onClear).toHaveBeenCalled();
  });
});
