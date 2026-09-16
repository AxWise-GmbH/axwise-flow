import { describe, it, expect } from 'vitest';
import { DOWNLOAD_MODEL_SEEDS } from './downloadModels';
import { resolveModelBrand, HUGGINGFACE_BRAND } from './modelBrands';

describe('DOWNLOAD_MODEL_SEEDS', () => {
  it('has the 20 requested models', () => {
    expect(DOWNLOAD_MODEL_SEEDS).toHaveLength(20);
  });

  it('every seed has a non-empty name and query', () => {
    for (const seed of DOWNLOAD_MODEL_SEEDS) {
      expect(seed.name?.trim()).toBeTruthy();
      expect(seed.query?.trim()).toBeTruthy();
    }
  });

  it('names are unique', () => {
    const names = DOWNLOAD_MODEL_SEEDS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every seed resolves to a logo (brand match or HF fallback)', () => {
    for (const seed of DOWNLOAD_MODEL_SEEDS) {
      // The Download card resolves the brand from name + repo id; seeds are
      // HF-sourced so worst case they fall back to the Hugging Face glyph.
      const brand =
        resolveModelBrand({ name: seed.name, exactModel: seed.query }) || HUGGINGFACE_BRAND;
      expect(brand?.title).toBeTruthy();
    }
  });
});
