/**
 * persistAssistantStep — the one save contract shared by every surface that
 * completes an assistant setup step (the modal wizard's persistStep and the
 * right-side AssistantContextDrawer's inline accordions). Keeping it here means
 * both persist identically: merge the card's patch, mark the step done, and —
 * for the "keys" (brain) step, which is the activation gate — flip `activated`.
 *
 * @param {(patch: object) => Promise<any>} save  useAssistantSetup().save
 * @param {string} stepKey  one of ASSISTANT_SETUP_STEPS[].key
 * @param {object} [patch]  the card's onComplete payload (e.g. { config: {...} })
 * @returns {Promise<any>} whatever save() resolves to
 */
export function persistAssistantStep(save, stepKey, patch = {}) {
  const merged = { ...patch, steps: { ...(patch.steps || {}), [stepKey]: true } };
  if (stepKey === 'keys') merged.activated = true;
  return save(merged);
}

export default persistAssistantStep;
