/**
 * Model categories for the Marketplace "Download" sub-tab shelves.
 *
 * Each category renders as one horizontal shelf of the top-downloaded Hugging
 * Face models for that task/domain. `value` is passed to the huggingface-models
 * handler as `?category=<value>`; the handler maps it to one or more HF
 * pipeline-tag / tag-filter sub-queries.
 *
 * IMPORTANT: keys must stay in sync with:
 *   - CATEGORY_QUERIES in lib/api-handlers/huggingface-models.js
 *   - the `category` enum in api/_lib/validate.js
 *
 * `icon` is an AppIcon name (with a MUI fallback resolved in the component).
 *
 * A `curated` array marks a category as a hand-picked, rank-ordered list (each
 * entry a { name, query } resolved live to its top HF match, kept in order)
 * rather than a `pipeline_tag`/`filter` query - it is resolved client-side and
 * is NOT sent to the backend `category` param.
 */
import { UNCENSORED_MODELS } from './downloadModels';

export const MODEL_CATEGORIES = [
  { value: 'uncensored', label: 'Uncensored', icon: 'LockOpenOutlined', curated: UNCENSORED_MODELS },
  { value: 'text', label: 'Text / LLM', icon: 'ChatOutlined' },
  { value: 'coding', label: 'Coding', icon: 'CodeOutlined' },
  { value: 'image', label: 'Image', icon: 'ImageOutlined' },
  { value: 'video', label: 'Video', icon: 'MovieOutlined' },
  { value: 'audio', label: 'Audio / Speech', icon: 'GraphicEqOutlined' },
  { value: 'multimodal', label: 'Multimodal / Vision', icon: 'VisibilityOutlined' },
  { value: 'embeddings', label: 'Embeddings', icon: 'HubOutlined' },
  { value: '3d', label: '3D', icon: 'ViewInArOutlined' },
  { value: 'research', label: 'Research', icon: 'ScienceOutlined' },
];

export default MODEL_CATEGORIES;
