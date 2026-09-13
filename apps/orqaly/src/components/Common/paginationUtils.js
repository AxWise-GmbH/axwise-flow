/**
 * Compute the windowed list of page tokens to render in <Pagination>.
 * Returns an array of 1-indexed page numbers and the string '…' sentinels.
 *
 * Guarantees: first and last page are always present (unless they coincide
 * with the current window); the window contains at most `maxVisible` numeric
 * tokens in total.
 */
export function getPageWindow(pageCount, currentPage, maxVisible = 6) {
  const tokens = [];
  if (pageCount <= maxVisible) {
    for (let i = 1; i <= pageCount; i += 1) tokens.push(i);
    return tokens;
  }

  const current = currentPage + 1;
  const siblings = 1;

  const leftBoundary = Math.max(2, current - siblings);
  const rightBoundary = Math.min(pageCount - 1, current + siblings);

  const showLeftEllipsis = leftBoundary > 2;
  const showRightEllipsis = rightBoundary < pageCount - 1;

  tokens.push(1);

  if (!showLeftEllipsis && showRightEllipsis) {
    const end = Math.min(pageCount - 1, maxVisible - 1);
    for (let i = 2; i <= end; i += 1) tokens.push(i);
    tokens.push('…');
  } else if (showLeftEllipsis && !showRightEllipsis) {
    tokens.push('…');
    const start = Math.max(2, pageCount - (maxVisible - 2));
    for (let i = start; i <= pageCount - 1; i += 1) tokens.push(i);
  } else if (showLeftEllipsis && showRightEllipsis) {
    tokens.push('…');
    for (let i = leftBoundary; i <= rightBoundary; i += 1) tokens.push(i);
    tokens.push('…');
  } else {
    for (let i = 2; i <= pageCount - 1; i += 1) tokens.push(i);
  }

  tokens.push(pageCount);
  return tokens;
}
