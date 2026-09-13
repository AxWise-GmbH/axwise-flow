import { describe, it, expect } from 'vitest';
import { resolveIndustryIcon } from './industryIcons';
import { CONSILIUM_TEMPLATES } from './consiliumTemplates';

describe('resolveIndustryIcon', () => {
  it('honors the snake_case ligature the templates ship', () => {
    expect(resolveIndustryIcon('Finance', 'account_balance').name).toBe('AccountBalanceOutlined');
    expect(resolveIndustryIcon('Retail', 'shopping_cart').name).toBe('ShoppingCartOutlined');
    expect(resolveIndustryIcon('Energy', 'bolt').name).toBe('BoltOutlined');
  });

  it('resolves every predefined Consilium template to an icon', () => {
    for (const t of CONSILIUM_TEMPLATES) {
      const r = resolveIndustryIcon(t.industry, t.icon);
      expect(r, `template ${t.industry}`).not.toBeNull();
      expect(typeof r.name).toBe('string');
      expect(r.fallback).toBeTruthy();
    }
  });

  it('matches by industry keyword when no ligature is given', () => {
    expect(resolveIndustryIcon('Healthcare & Pharma').name).toBe('LocalHospitalOutlined');
    expect(resolveIndustryIcon('E-Commerce & Retail').name).toBe('StorefrontOutlined');
    expect(resolveIndustryIcon('Legal & Consulting').name).toBe('GavelOutlined');
  });

  it('covers the CLAUDE.md directions', () => {
    expect(resolveIndustryIcon('fintech').name).toBe('AccountBalanceOutlined');
    expect(resolveIndustryIcon('marketing').name).toBe('CampaignOutlined');
    expect(resolveIndustryIcon('data-center').name).toBe('DnsOutlined');
  });

  it('returns null for unknown / empty industry', () => {
    expect(resolveIndustryIcon('Underwater Basket Weaving')).toBeNull();
    expect(resolveIndustryIcon('')).toBeNull();
    expect(resolveIndustryIcon(undefined)).toBeNull();
  });
});
