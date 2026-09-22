import { solutionWords } from '../../pages/solutions/data';

// The ten Solutions pages, keyed as SolutionPage asks for them (sp.<slug>.<path>). The scene
// windows' own words are plain t() calls in scenes.jsx, found by the source scan.
const PAGES = import.meta.glob(
  ['../../pages/solutions/data/*.js', '!../../pages/solutions/data/index.js', '!../../pages/solutions/data/*.test.js'],
  { eager: true, import: 'default' }
);

export default function words() {
  return Object.assign({}, ...Object.values(PAGES).map(solutionWords));
}
