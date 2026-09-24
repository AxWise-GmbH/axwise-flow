import ApiBanner from './ApiBanner';
import ChatBanner from './ChatBanner';
import MergeBanner from './MergeBanner';
import OpenBanner from './OpenBanner';
import PhoneBanner from './PhoneBanner';
import SwarmBanner from './SwarmBanner';
import WindowBanner from './WindowBanner';
import WiresBanner from './WiresBanner';

// One moving story per post, picked by the post's `cover`. No text of any kind on any of them.
export const BANNERS = {
  swarm: SwarmBanner,
  wires: WiresBanner,
  chat: ChatBanner,
  phone: PhoneBanner,
  window: WindowBanner,
  merge: MergeBanner,
  api: ApiBanner,
  open: OpenBanner,
};

export default function NewsBanner({ post, className = '' }) {
  const Banner = BANNERS[post.cover] ?? SwarmBanner;
  return <Banner className={className} />;
}
