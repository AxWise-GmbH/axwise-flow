import { describe, expect, it } from 'vitest';
import { deriveReaderOutputContract } from './reader-output-contract.js';

function requirement(index, category, description, authority = 'owner') {
  return {
    id: `req-${index.toString(16).padStart(16, '0')}`,
    category,
    description,
    priority: 'P0',
    authority,
  };
}

function scope(artifactType, requirements) {
  return { deliverableProfile: { artifactType }, requirements };
}

describe('reader output contract derivation', () => {
  it('derives exact owner-authored format, item, and word constraints with fixed measurement', () => {
    const deliverable = requirement(1, 'deliverable', 'Create a concise 5-item checklist.');
    const limit = requirement(2, 'limit', 'Keep the reader output to at most 300 words.');

    expect(deriveReaderOutputContract(scope('content_artifact', [limit, deliverable]))).toEqual({
      schemaVersion: 'orqaly.reader-output.v1',
      readerFormat: { value: 'checklist', requirementId: deliverable.id },
      wordLimit: {
        maximumWords: 300,
        basis: 'owner_explicit',
        requirementId: limit.id,
      },
      itemLimit: {
        exactItems: 5,
        itemKind: 'checklist_item',
        requirementId: deliverable.id,
      },
      measurement: {
        scope: 'reader_markdown_before_server_disclosures',
        wordCounter: 'unicode_words_v1',
        itemCounter: 'top_level_markdown_items_v1',
      },
    });
  });

  it('applies the bounded default only when a compact adjective modifies the format', () => {
    const concise = requirement(1, 'deliverable', 'Create a concise checklist.');
    const shortSentences = requirement(
      2,
      'deliverable',
      'Create a checklist with short sentences and up to 5 items.'
    );

    expect(
      deriveReaderOutputContract(scope('general_artifact', [concise])).wordLimit
    ).toMatchObject({
      maximumWords: 250,
      basis: 'bounded_content_default_v1',
      requirementId: concise.id,
    });
    expect(
      deriveReaderOutputContract(scope('general_artifact', [shortSentences]))
    ).toMatchObject({ wordLimit: null, itemLimit: null });

    const minimumLength = requirement(
      3,
      'deliverable',
      'Create a checklist with a minimum 300-word explanation.'
    );
    expect(
      deriveReaderOutputContract(scope('general_artifact', [minimumLength])).wordLimit
    ).toBeNull();
  });

  it('preserves an owner exact item count written as a number word', () => {
    const deliverable = requirement(
      1,
      'deliverable',
      'Create a concise Markdown checklist with exactly three items for opening a café.'
    );

    expect(
      deriveReaderOutputContract(scope('content_artifact', [deliverable]))
    ).toMatchObject({
      readerFormat: { value: 'checklist', requirementId: deliverable.id },
      wordLimit: {
        maximumWords: 250,
        basis: 'bounded_content_default_v1',
        requirementId: deliverable.id,
      },
      itemLimit: {
        exactItems: 3,
        itemKind: 'checklist_item',
        requirementId: deliverable.id,
      },
    });
  });

  it('does not invert negated owner word or item constraints', () => {
    const deliverable = requirement(1, 'deliverable', 'Create a checklist.');
    const itemPolicy = requirement(2, 'policy', 'Do not use a 5-item checklist.');
    const wordPolicy = requirement(3, 'policy', 'Do not use a maximum of 300 words.');

    expect(
      deriveReaderOutputContract(
        scope('content_artifact', [deliverable, itemPolicy, wordPolicy])
      )
    ).toMatchObject({
      readerFormat: { value: 'checklist', requirementId: deliverable.id },
      wordLimit: null,
      itemLimit: null,
    });
  });

  it('preserves positive format directives across owner requirement categories', () => {
    const email = requirement(1, 'deliverable', 'Create an email.');
    const checklist = requirement(
      2,
      'policy',
      'Format the reader output as a checklist.'
    );

    expect(() =>
      deriveReaderOutputContract(scope('content_artifact', [email, checklist]))
    ).toThrowError(expect.objectContaining({
      code: 'ORQALY_AMBIGUOUS_READER_OUTPUT_CONSTRAINT',
    }));

    const checklistDeliverable = requirement(3, 'deliverable', 'Create a checklist.');
    const tonePolicy = requirement(4, 'policy', 'Use an approachable email tone.');
    expect(
      deriveReaderOutputContract(
        scope('content_artifact', [checklistDeliverable, tonePolicy])
      ).readerFormat
    ).toEqual({ value: 'checklist', requirementId: checklistDeliverable.id });
  });

  it('does not derive authority from defaults, AxWise requirements, or non-reader artifacts', () => {
    const derived = requirement(
      1,
      'deliverable',
      'Create a concise checklist.',
      'axwise_derived'
    );
    expect(deriveReaderOutputContract(scope('content_artifact', [derived]))).toBeNull();
    expect(
      deriveReaderOutputContract(
        scope('product_prd', [requirement(2, 'deliverable', 'Create a concise checklist.')])
      )
    ).toBeNull();
  });

  it('fails closed on conflicting owner constraints', () => {
    const first = requirement(1, 'deliverable', 'Create a checklist under 200 words.');
    const second = requirement(2, 'limit', 'Use no more than 300 words.');

    expect(() =>
      deriveReaderOutputContract(scope('content_artifact', [first, second]))
    ).toThrowError(expect.objectContaining({
      code: 'ORQALY_AMBIGUOUS_READER_OUTPUT_CONSTRAINT',
    }));
  });
});
