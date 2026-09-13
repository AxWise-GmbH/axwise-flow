import { describe, expect, it } from 'vitest';
import {
  cleanGeneratedDocumentText,
  cleanGeneratedPresentationText,
} from './generatedPresentationText.js';

describe('generated presentation text', () => {
  it('removes visible Markdown and bounded LaTeX decoration without changing meaning', () => {
    expect(
      cleanGeneratedPresentationText(
        '**Finance Pricing Specialist** uses marketing\\_icp and \\textbf{evidence}.'
      )
    ).toBe('Finance Pricing Specialist uses marketing_icp and evidence.');
    expect(
      cleanGeneratedPresentationText(
        'roles: [object Object] · industry: [object Object] · confidence: 1'
      )
    ).toBe('confidence: 1');
  });

  it('presents common generated formulas as plain readable text but preserves currency', () => {
    expect(
      cleanGeneratedPresentationText(
        String.raw`\[ ROI = \frac{revenue}{cost} \times 100\% \] and prices are $5 or $10.`
      )
    ).toBe('ROI = revenue / cost × 100% and prices are $5 or $10.');
    expect(cleanGeneratedPresentationText('Formula: x_i = x^2')).toBe(
      'Formula: x sub i = x to the power of 2'
    );
    expect(cleanGeneratedPresentationText('Formula: 20 * 5 = 100')).toBe('Formula: 20 × 5 = 100');
    expect(cleanGeneratedPresentationText('economic_buyer')).toBe('economic_buyer');
  });

  it('removes raw Markdown and broad LaTeX syntax while preserving readable document structure', () => {
    const rendered = cleanGeneratedDocumentText(String.raw`# **Unit economics**

* Formula: \[ M = \sum_{i=1}^{n} \frac{R_i}{\sqrt{C_i}} \]
* literal null: null
* missing object: [object Object]

Decision text.`);

    expect(rendered).toContain('Unit economics');
    expect(rendered).toContain('Formula: M = Σ sub i=1 to the power of n R sub i / √(C sub i)');
    expect(rendered).toContain('Decision text.');
    expect(rendered).not.toMatch(/\*\*|^\s*\*|\\(?:frac|sqrt|sum)|\$|\[object Object\]|\bnull\b/im);
  });
});
