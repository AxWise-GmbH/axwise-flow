import { defaultModel, defaultProvider } from '../_shared/llm-defaults.js';

/**
 * Resolve an internal goal-stage model choice.
 *
 * Internal lifecycle work inherits the platform provider/model pair and pins
 * it. This prevents completion, Osja, and theory stages from silently moving
 * to another vendor when the selected provider is unavailable.
 *
 * User-explicit request selections do not use this helper and remain intact.
 */
export function resolveGoalStageLlm() {
  return {
    provider: defaultProvider(),
    model: defaultModel(),
    pinnedProvider: true,
  };
}
