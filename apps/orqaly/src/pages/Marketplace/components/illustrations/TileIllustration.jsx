import { useState } from 'react';
import SkillsArt from './SkillsArt';
import ToolsArt from './ToolsArt';
import ConsiliumArt from './ConsiliumArt';
import OrganizationsArt from './OrganizationsArt';
import BusinessArt from './BusinessArt';
import ReplicatorsArt from './ReplicatorsArt';
import AccountArt from './AccountArt';
import AgentsArt from './AgentsArt';

// Map tile IDs to:
//  - the public path where a user-uploaded image is expected
//  - the SVG fallback component (always present)
const ASSETS = {
  skills: { img: '/illustrations/marketplace/skills.png', Svg: SkillsArt, alt: 'Skills' },
  tools: { img: '/illustrations/marketplace/tools.png', Svg: ToolsArt, alt: 'Tools' },
  teams: { img: '/illustrations/marketplace/teams.png', Svg: ConsiliumArt, alt: 'Consilium' },
  orgs: { img: '/illustrations/marketplace/orgs.png', Svg: OrganizationsArt, alt: 'Organizations' },
  businesses: {
    img: '/illustrations/marketplace/businesses.png',
    Svg: BusinessArt,
    alt: 'Business models',
  },
  replicators: {
    img: '/illustrations/marketplace/replicators.png',
    Svg: ReplicatorsArt,
    alt: 'Replicators',
  },
  account: { img: '/illustrations/marketplace/account.png', Svg: AccountArt, alt: 'Account' },
  agents: { img: '/illustrations/marketplace/agents.png', Svg: AgentsArt, alt: 'Agents' },
};

/**
 * Tries to render the user-supplied PNG/WebP first; falls back to the
 * inline SVG illustration if the image file doesn't exist or fails to load.
 *
 * Drop files at `/public/illustrations/marketplace/<id>.png` to override.
 *
 * @param {string} id  tile id (skills | tools | teams | orgs | businesses | replicators)
 */
export default function TileIllustration({ id }) {
  const entry = ASSETS[id];
  const [imgFailed, setImgFailed] = useState(false);

  if (!entry) return null;
  const { img, Svg, alt } = entry;

  if (!img || imgFailed) {
    return <Svg />;
  }

  return (
    <img
      src={img}
      alt={alt}
      onError={() => setImgFailed(true)}
      loading="lazy"
      decoding="async"
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        objectPosition: 'right center',
        display: 'block',
        // Slight glow + drop shadow so transparent PNGs read well on the dark tile.
        // Uses the accent var (set on <html> by ThemeContext) so it follows the theme.
        filter: 'drop-shadow(0 6px 18px rgba(var(--app-accent-rgb, 16, 185, 129), 0.20))',
      }}
    />
  );
}
