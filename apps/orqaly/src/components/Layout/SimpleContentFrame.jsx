/**
 * SimpleContentFrame — shared horizontal gutter for non-adapted pages in simple mode.
 *
 * In simple mode the app shell's <main> has px:0 (see getAppMainScrollSx), so each
 * page must supply its own side spacing. Adapted pages do this via the Marketplace
 * compact chrome (.mkt-landing[data-compact="1"], 16px padding + 920px centered inner).
 * This frame gives every other routed page the SAME centered 920px column (.simple-frame__inner)
 * with a 16px gutter floor, so all simple-mode pages share one content width. Adapted pages
 * opt out declaratively in CSS: `.simple-frame:has(.mkt-landing[data-compact="1"])` zeroes the
 * gutter and removes the cap so they are never padded/capped twice (see src/index.css).
 *
 * When inactive (advanced mode) it renders children untouched — no extra DOM node.
 *
 * @param {boolean} active - true in simple mode (useSimpleDock); wraps children in .simple-frame.
 */
export default function SimpleContentFrame({ active, children }) {
  if (!active) return children;
  return (
    <div className="simple-frame">
      <div className="simple-frame__inner">{children}</div>
    </div>
  );
}
