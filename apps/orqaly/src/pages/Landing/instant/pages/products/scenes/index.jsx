/*
 * The product scenes: one looping story per product, drawn in markup and moved by CSS.
 *
 * Contract (the header menu, the phone menu and the product pages all rely on it):
 * - ProductScene({ slug, cut, className }) renders SCENES[slug] or nothing.
 * - Every scene is aria-hidden, holds nothing focusable, uses no element ids, no img, video,
 *   iframe or canvas, and follows its CARD's width (container queries), never the screen's.
 * - `cut` picks which parts show and which story plays: 'menu' is the header preview; each
 *   page may add its own cuts (for example 'hero').
 * - Off screen the story rests (data-live="false"); with reduced motion it shows its finished
 *   frame.
 */
import DesktopScene from './DesktopScene';
import MobileScene from './MobileScene';
import ApiScene from './ApiScene';
import BotScene from './BotScene';
import ModelsScene from './ModelsScene';
import EnterpriseScene from './EnterpriseScene';

// eslint-disable-next-line react-refresh/only-export-components -- the map and its renderer are one contract.
export const SCENES = {
  desktop: DesktopScene,
  mobile: MobileScene,
  api: ApiScene,
  'assistant-bot': BotScene,
  'personalised-models': ModelsScene,
  enterprise: EnterpriseScene,
};

export function ProductScene({ slug, cut = 'menu', className = '' }) {
  const Scene = SCENES[slug];
  return Scene ? <Scene cut={cut} className={className} /> : null;
}
