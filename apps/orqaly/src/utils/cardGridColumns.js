/**
 * Responsive `gridTemplateColumns` for card grids that adapt to Simple Mode.
 *
 * In Simple Mode the layout caps at 2 cards per row (xs:1 → sm:2) so cards stay
 * fully visible and never clip against tight container padding. In Advanced Mode
 * the caller's denser template (e.g. 3-up at lg) is used as-is.
 *
 * @param {boolean} simpleMode  current Simple Mode flag (from useSimpleMode)
 * @param {object} advanced     gridTemplateColumns object for Advanced Mode
 */
export function cardGridColumns(simpleMode, advanced) {
  return simpleMode ? { xs: '1fr', sm: 'repeat(2, 1fr)' } : advanced;
}

export default cardGridColumns;
