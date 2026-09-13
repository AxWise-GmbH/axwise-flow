import { describe, it, expect } from 'vitest';
import { resolveModelBrand, HUGGINGFACE_BRAND } from './modelBrands';

describe('resolveModelBrand', () => {
  const cases = [
    ['Command R+', 'c4ai-command-r-plus-Q4_K_M-104B', 'Cohere'],
    ['DeepSeek Coder 33B', 'DeepSeek-Coder-33B-Instruct-FP16', 'DeepSeek'],
    ['Llama 3.1 70B', 'Meta-Llama-3.1-70B-Instruct-Q4_K_M', 'Meta'],
    ['Mistral Nemo 12B', 'Mistral-Nemo-12B-Instruct-2407-Q8_0', 'Mistral AI'],
    ['Qwen 2.5 72B', 'Qwen2.5-72B-Instruct-Q8_0', 'QWen'],
    ['Phi-3 Medium 14B', 'Phi-3-medium-128k-instruct-Q6_K', 'Microsoft'],
    ['Gemma 2 27B', 'gemma-2-27b-it', 'Google'],
    ['GPT-4o mini', 'gpt-4o-mini', 'OpenAI'],
    ['Claude 3.5 Sonnet', 'claude-3-5-sonnet', 'Claude'],
    // Brand-named community merges (Download tab) resolve to their base maker.
    ['Ornith 35B', 'deepreinforce-ai/Ornith-1.0-35B', 'QWen'],
    ['Qwythos 9B', 'Qwythos-9B', 'QWen'],
    ['AEON Ultimate', 'AEON-7/Qwen3.6-27B-AEON-Ultimate-Uncensored', 'QWen'],
    ['Cydonia 24B', 'TheDrummer/Cydonia-24B-v4', 'Mistral AI'],
    // Use repo-style (hyphenated) names - what the HF Download card actually
    // passes - so the separator-tolerant patterns are exercised for real.
    ['L3.3-Dark-Champion-MOE', 'DavidAU/L3.3-Dark-Champion-MOE', 'Meta'],
    ['Midnight-Rose-70B', 'sophosympatheia/Midnight-Rose-70B-v2.0.3', 'Meta'],
    ['MythoMax-L2-13B', 'Gryphe/MythoMax-L2-13b', 'Meta'],
  ];

  it.each(cases)('maps %s to %s', (name, exactModel, title) => {
    expect(resolveModelBrand({ name, exactModel })?.title).toBe(title);
  });

  it('returns null for an unrecognised maker', () => {
    expect(resolveModelBrand({ name: 'Homegrown 7B', exactModel: 'custom-7b' })).toBeNull();
  });

  it('returns null for empty / missing input', () => {
    expect(resolveModelBrand(null)).toBeNull();
    expect(resolveModelBrand({})).toBeNull();
  });

  it('does not misclassify dolphin as Phi (Microsoft)', () => {
    expect(resolveModelBrand({ name: 'Dolphin 2.9', exactModel: 'dolphin-2.9' })).toBeNull();
  });

  it('exposes multi-colour paths for Microsoft and a monogram for Cohere', () => {
    expect(resolveModelBrand({ name: 'Phi-3' }).paths).toHaveLength(4);
    expect(resolveModelBrand({ name: 'Command R+' }).mono).toBe('C');
  });

  it('exports a Hugging Face fallback brand with a glyph', () => {
    expect(HUGGINGFACE_BRAND.title).toMatch(/hugging/i);
    expect(HUGGINGFACE_BRAND.path).toBeTruthy();
  });
});
