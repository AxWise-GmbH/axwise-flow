import { INSTANT_PAGES, pageTitleKey } from '../../pages/instantPages';
import { INFO_PAGES, INFO_SKIP, infoPrefix } from '../../pages/info/info.data';
import { featureWords } from '../../pages/features.data';
import { deepDiveWords } from '../../pages/FeatureDeepDives';
import { howWords } from '../../pages/HowItWorksPage';
import { speedWords } from '../../pages/SpeedPage';
import { howHeroWords } from '../../pages/heroes/HowHero';
import { developerWords } from '../../DevelopersMore';
import { hubWords } from '../../IntegrationsHub';
import { localeWords } from '../localize';

// The pg area's words that are keyed at run time: page titles, the About / Contact copy,
// the features, the mocks' lists, the How it works steps and rules, the speed runs.
export default function words() {
  return Object.assign(
    Object.fromEntries(
      INSTANT_PAGES.filter((page) => page.title).map((page) => [
        pageTitleKey(page.slug),
        page.title,
      ])
    ),
    ...Object.entries(INFO_PAGES).map(([slug, page]) =>
      localeWords(page, infoPrefix(slug), INFO_SKIP)
    ),
    featureWords(),
    deepDiveWords(),
    howWords(),
    speedWords(),
    howHeroWords(),
    developerWords(),
    hubWords()
  );
}
