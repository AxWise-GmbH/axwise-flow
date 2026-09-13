/**
 * Layout helpers extracted to keep DashboardGrid.jsx component-only
 * (so react-refresh works correctly).
 */

/**
 * Compute the next free position for a new block.
 * @param {Array} _blocks - existing blocks (unused, kept for future use)
 * @param {{lg: Array}} layouts - current layout state
 * @param {{w:number,h:number}} defaultLayout - default size for the new block
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function nextPosition(_blocks, layouts, defaultLayout) {
  const lg = layouts?.lg || [];
  const maxY = lg.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);
  return { x: 0, y: maxY, w: defaultLayout.w, h: defaultLayout.h };
}
