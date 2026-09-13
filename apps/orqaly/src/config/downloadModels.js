/**
 * Curated "Uncensored" model list for the Marketplace "Download" sub-tab.
 *
 * These are NOT hard-coded repo ids - each entry is resolved live against the
 * Hugging Face API (see resolveCuratedModels in huggingfaceModelsService) and
 * the top match is rendered. `name` is the friendly label shown on the card;
 * `query` is a tightened HF search string so `sort=downloads` lands on the
 * intended repo.
 *
 * IMPORTANT: array order IS the displayed rank (1..N). Keep it deliberate.
 */
export const UNCENSORED_MODELS = [
  { name: 'SuperGemma 4 26B', query: 'SuperGemma 4 26B' },
  { name: 'Huihui Qwen Abliterated', query: 'huihui Qwen abliterated' },
  { name: 'HauhauCS Qwen Aggressive', query: 'Qwen abliterated aggressive' },
  { name: 'AEON Ultimate', query: 'Qwen AEON Ultimate Uncensored' },
  { name: 'Ornith 35B', query: 'Ornith 35B' },
  { name: 'Qwythos 9B', query: 'Qwythos 9B' },
  { name: 'Big Tiger Gemma', query: 'Big Tiger Gemma 27B' },
  { name: 'Gemma Heretic', query: 'gemma-3-27b heretic' },
  { name: 'Gemma Derestricted', query: 'Gemma 3 27B Derestricted' },
  { name: 'Cydonia 24B', query: 'Cydonia 24B' },
  { name: 'GPT-OSS Heretic', query: 'gpt-oss heretic' },
  { name: 'GPT-OSS Derestricted', query: 'gpt-oss derestricted' },
  { name: 'Josefied Qwen', query: 'Josiefied Qwen' },
  { name: 'Dark Champion MoE', query: 'L3 Dark Champion MOE' },
  { name: 'Lexi Llama', query: 'Llama 3.1 8B Lexi Uncensored' },
  { name: 'DarkIdol Llama', query: 'DarkIdol Llama 3.1 8B' },
  { name: 'Dolphin 3 Cyber', query: 'Dolphin3 Cyber' },
  { name: 'Nous Hermes 3', query: 'Hermes 3 Llama 3.1 8B' },
  { name: 'Midnight Rose', query: 'Midnight Rose 70B' },
  { name: 'MythoMax', query: 'MythoMax L2 13B' },
];

// Back-compat alias for anything still importing the old seed name.
export const DOWNLOAD_MODEL_SEEDS = UNCENSORED_MODELS;

export default UNCENSORED_MODELS;
