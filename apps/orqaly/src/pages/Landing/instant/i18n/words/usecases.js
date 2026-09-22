import { CARD_COPY, CARD_FIELDS, caseKey } from '../../UseCases';

// The cards' titles, lines and requests. The pills use `solutions.<slug>.label`, which the
// Solutions menu's own words file lists.
export default function words() {
  return Object.fromEntries(
    Object.entries(CARD_COPY).flatMap(([slug, copy]) =>
      CARD_FIELDS.map((field) => [caseKey(slug, field), copy[field]])
    )
  );
}
