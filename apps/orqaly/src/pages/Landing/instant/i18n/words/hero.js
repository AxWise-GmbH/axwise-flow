import { LABELS, labelKey } from '../../OrbitHero';
import { AGENTS, SCENES, agentKey, askKey } from '../../HeroPulse';

// The hero's run-time keys: the seven labels (OrbitHero.jsx) and the moving picture's asks
// and agents (HeroPulse.jsx).
export default function words() {
  return {
    ...Object.fromEntries(
      LABELS.flatMap((label) =>
        ['tag', 'line', 'status'].map((field) => [labelKey(label.key, field), label[field]])
      )
    ),
    ...Object.fromEntries(SCENES.map(({ id, ask }) => [askKey(id), ask])),
    ...Object.fromEntries(AGENTS.map((name) => [agentKey(name), name])),
  };
}
