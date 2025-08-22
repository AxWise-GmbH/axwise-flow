/**
 * Test cases for persona enhancement utilities
 * Based on PROJECT_DEEP_DIVE_ANALYSIS.md requirements
 */

import { parseMarkdownBold, renderMarkdownWithHighlighting } from '../personaEnhancements';

describe('parseMarkdownBold', () => {
  test('converts **text** to <strong>text</strong>', () => {
    const input = "I need to know precisely what's in the **food**, not just a vague translation";
    const expected = "I need to know precisely what's in the <strong>food</strong>, not just a vague translation";
    expect(parseMarkdownBold(input)).toBe(expected);
  });

  test('handles multiple bold words', () => {
    const input = "The biggest one, by far, is the **language** **barrier**";
    const expected = "The biggest one, by far, is the <strong>language</strong> <strong>barrier</strong>";
    expect(parseMarkdownBold(input)).toBe(expected);
  });

  test('handles bold phrases', () => {
    const input = "In **Bangalore**, I knew which places were reliable";
    const expected = "In <strong>Bangalore</strong>, I knew which places were reliable";
    expect(parseMarkdownBold(input)).toBe(expected);
  });

  test('handles empty string', () => {
    expect(parseMarkdownBold("")).toBe("");
  });

  test('handles text without bold formatting', () => {
    const input = "This is regular text without any formatting";
    expect(parseMarkdownBold(input)).toBe(input);
  });

  test('handles nested asterisks correctly', () => {
    const input = "This **has **nested** formatting** which should work";
    const expected = "This <strong>has <strong>nested</strong> formatting</strong> which should work";
    expect(parseMarkdownBold(input)).toBe(expected);
  });
});

describe('renderMarkdownWithHighlighting', () => {
  test('returns proper HTML object structure', () => {
    const input = "Test **bold** text";
    const result = renderMarkdownWithHighlighting(input);
    
    expect(result).toHaveProperty('__html');
    expect(typeof result.__html).toBe('string');
    expect(result.__html).toContain('<strong>bold</strong>');
  });

  test('handles empty input', () => {
    const result = renderMarkdownWithHighlighting("");
    expect(result).toEqual({ __html: "" });
  });

  test('preserves existing HTML structure', () => {
    const input = "This has **bold** and should preserve structure";
    const result = renderMarkdownWithHighlighting(input);
    
    // Should contain the bold formatting
    expect(result.__html).toContain('<strong>bold</strong>');
    // Should not contain raw asterisks
    expect(result.__html).not.toContain('**');
  });
});

// Integration test cases based on PROJECT_DEEP_DIVE_ANALYSIS.md examples
describe('Real-world persona quote examples', () => {
  const testCases = [
    {
      input: "I need to know precisely what's in the **food**, not just a vague translation",
      expectedBold: "food"
    },
    {
      input: "The biggest one, by far, is the **language** **barrier**",
      expectedBold: ["language", "barrier"]
    },
    {
      input: "In **Bangalore**, I knew which places were reliable",
      expectedBold: "Bangalore"
    },
    {
      input: "Here, it's like starting from scratch, trying to figure out portion sizes for a **family**",
      expectedBold: "family"
    },
    {
      input: "My **kids** are picky eaters",
      expectedBold: "kids"
    }
  ];

  testCases.forEach(({ input, expectedBold }, index) => {
    test(`processes real persona quote ${index + 1} correctly`, () => {
      const result = parseMarkdownBold(input);
      
      // Should not contain raw asterisks
      expect(result).not.toContain('**');
      
      // Should contain strong tags
      if (Array.isArray(expectedBold)) {
        expectedBold.forEach(word => {
          expect(result).toContain(`<strong>${word}</strong>`);
        });
      } else {
        expect(result).toContain(`<strong>${expectedBold}</strong>`);
      }
    });
  });
});

// Visual test guidance (for manual testing)
describe('Visual test guidance', () => {
  test('provides examples for manual visual testing', () => {
    const examples = [
      {
        description: "Keywords should appear bold, not with asterisks",
        input: "I need **reliable** restaurants with **familiar** flavors",
        expected: "Keywords 'reliable' and 'familiar' should be visually bold"
      },
      {
        description: "Color test: Keywords should have appropriate category colors",
        input: "The **language** **barrier** is my biggest **challenge**",
        expected: "Words should be bold and potentially color-coded by category"
      },
      {
        description: "Evidence test: Hover should show supporting quote count",
        input: "Multiple **evidence** items should show counts",
        expected: "Tooltips should display evidence counts on hover"
      }
    ];

    // This test documents the expected visual behavior
    examples.forEach(example => {
      const processed = parseMarkdownBold(example.input);
      expect(processed).not.toContain('**');
      console.log(`Visual Test: ${example.description}`);
      console.log(`Input: ${example.input}`);
      console.log(`Processed: ${processed}`);
      console.log(`Expected: ${example.expected}\n`);
    });
  });
});
