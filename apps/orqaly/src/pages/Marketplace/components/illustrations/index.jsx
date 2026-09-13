import TileIllustration from './TileIllustration';

// Tries the user-supplied PNG/WebP from /public/illustrations/marketplace/
// first; falls back to the inline SVG illustration on load error.
//
// Drop files at:
//   /public/illustrations/marketplace/skills.png
//   /public/illustrations/marketplace/tools.png
//   /public/illustrations/marketplace/consilium.png
//   /public/illustrations/marketplace/organizations.png
//   /public/illustrations/marketplace/business-models.png
//   /public/illustrations/marketplace/replicators.png
//
// They will automatically override the SVG fallbacks.
export function getIllustration(id) {
  if (!id) return null;
  return <TileIllustration id={id} />;
}
