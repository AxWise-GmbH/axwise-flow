/**
 * Model picker options for the "Talk with Team Lead" dialog.
 *
 * A flat list of every available LLM, built from the shared provider/model
 * catalog (the same list the Concilium member picker uses) so the two never
 * drift, with the "cheap" default pinned first and Consilium last.
 */
import { MEMBER_PROVIDERS, PROVIDER_MODELS } from '../../services/conciliumMembersService';

export const MODEL_OPTIONS = [
  { id: 'cheap', label: 'Cheap (default) - Gemini 3.8 Flash', mode: 'cheap' },
  ...MEMBER_PROVIDERS.flatMap((p) =>
    (PROVIDER_MODELS[p.value] || []).map((m) => ({
      id: `${p.value}:${m.value}`,
      label: `${p.label} - ${m.label}`,
      mode: 'model',
      provider: p.value,
      model: m.value,
    }))
  ),
  { id: 'consilium', label: 'Consilium - ask the council', mode: 'consilium' },
];
