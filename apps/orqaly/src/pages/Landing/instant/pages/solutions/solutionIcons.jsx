// One line-icon set for the Solutions pages and the header menu: a 24 px grid, one stroke
// weight, no fills, so every icon reads as part of the same drawing.
import { INDUSTRY_ICONS, PATHS } from './solutionIconPaths';

export function SolutionIcon({ name, className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        d={PATHS[name] ?? PATHS.spark}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IndustryIcon({ slug, className }) {
  return <SolutionIcon name={INDUSTRY_ICONS[slug]} className={className} />;
}
