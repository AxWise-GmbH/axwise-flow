# UI porting notes for the clean v2 cutover

PR #56 was re-fetched at head `cd928300`. Its merge-base diff contains 1,313 files
because commit `58f4fd78` is an in-flight snapshot of the Standart UI chain. That
snapshot must not be merged into the v2 cutover.

The actual Personal Catalog feature is the single commit `cd928300` (32 files).
Its reusable design intent is:

- add **Personal Catalog** after Consilium in the Intelligence navigation;
- keep `/marketplace` as the route while presenting the Personal Catalog label;
- use the shared page toolbar/filter popover and flat standard tiles;
- preserve the same information and actions in Simple and Advanced modes;
- disable decorative particle/cursor/confetti work in the standard presentation.

Port only after the v2 Clerk shell and command client are stable. Prefer adapting
the current equivalents of `standardNavItems`, `MarketplaceToolbar`,
`standardPage`, and the marketplace tab cards. Do not cherry-pick `58f4fd78` or
`cd928300`; the feature commit itself depends on files introduced by the snapshot.

## Reconciliation on the clean two-mode base

The current base has Simple and Advanced modes, not the snapshot's third
`standard` mode. It does not contain `useUiMode`, `StandardNav`, the mono theme,
`PageToolbar`, `standardCell`, or the other structural prerequisites used by the
PR #56 styling helpers. Porting those files would import the rejected snapshot
architecture, so the mono marketplace/card restyle remains intentionally
skipped.

The applicable user-facing delta is adapted to the existing shell:

- both Simple and Advanced navigation present `/marketplace` as **Personal Catalog**;
- the signed-in catalog page and route metadata use the same label;
- marketplace domain routes and public marketplace terminology remain stable;
- the Models landing tile now targets the `models` tab instead of the unrelated
  historical `businesses` tab;
- marketplace industry glyphs pass an explicit `size` through `AppIcon`, so the
  Advanced Iconify renderer honors the requested dimension.

The earlier persistent Simple chat reconciliation, `a58abca6`, is already a
direct ancestor of this branch. Its persistent chat, dashboard, composer, and
conversation-context behavior remains represented; the only deliberate change
to its dock in this reconciliation is the catalog label. None of the earlier
chat work is duplicated here. The WorkflowV2 Simple/Advanced page and shared
command API are deliberately untouched by this UI reconciliation.
