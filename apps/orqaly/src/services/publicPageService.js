import { supabase, hasSupabase } from '../lib/supabase';

const TABLE = 'public_pages';
const STORAGE_KEY = 'orch_public_pages_v1';

export const PUBLIC_PAGE_TEMPLATES = [
  { key: 'classic_links', label: 'Classic links' },
  { key: 'company_focus', label: 'Company focus' },
  { key: 'social_grid', label: 'Social grid' },
  { key: 'minimal_clean', label: 'Minimal & clean' },
  { key: 'bento_cards', label: 'Bento cards' },
  { key: 'dark_pro', label: 'Dark pro' },
  { key: 'gradient_hero', label: 'Gradient hero' },
  { key: 'social_first', label: 'Social first' },
  { key: 'professional', label: 'Professional' },
  { key: 'glass', label: 'Glass' },
  { key: 'bold_statement', label: 'Bold statement' },
  { key: 'creator', label: 'Creator' },
  { key: 'compact', label: 'Compact' },
  { key: 'ai_designed', label: 'AI Designed' },
];

const DEFAULT_SOCIAL = {
  instagram: '',
  facebook: '',
  x: '',
  linkedin: '',
  tiktok: '',
  youtube: '',
};

const DEFAULT_CONTACT = {
  email: '',
  phone: '',
  whatsapp: '',
};

const clone = (value) => JSON.parse(JSON.stringify(value));

let supabaseTableReady = null;

function normalizeText(value, max = 240) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

export function normalizeSlug(value) {
  const base = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return base;
}

function normalizeTelegramHandle(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/[^\w]/g, '')
    .slice(0, 64);
}

export function normalizeExternalUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^(mailto:|tel:)/i.test(text)) return text;
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z]+:\/\//i.test(text)) return '';
  return `https://${text}`;
}

function readLocalMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalMap(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota/storage errors.
  }
}

function getDefaultSlug(user) {
  const baseSource = user?.displayName || user?.email?.split('@')?.[0] || 'profile';
  const base = normalizeSlug(baseSource);
  if (base) return base;
  return `profile-${Math.random().toString(36).slice(2, 8)}`;
}

function getBasePage(user) {
  return {
    slug: getDefaultSlug(user),
    title: normalizeText(user?.displayName || user?.email?.split('@')?.[0] || 'My Public Page', 80),
    subtitle: 'Find all important links in one place.',
    templateKey: 'classic_links',
    isPublished: false,
    bookingSlug: '',
    showScheduleMeeting: false,
    telegramHandle: '',
    telegramGroup: '',
    companyName: '',
    companyDescription: '',
    companyWebsite: '',
    websiteUrl: '',
    photoUrl: '',
    accentColor: '',
    social: clone(DEFAULT_SOCIAL),
    contact: clone(DEFAULT_CONTACT),
    updatedAt: null,
  };
}

function normalizePage(input, user) {
  const base = getBasePage(user);
  const raw = input && typeof input === 'object' ? input : {};
  const social = {
    ...base.social,
    ...(raw.social && typeof raw.social === 'object' ? raw.social : {}),
  };
  const contact = {
    ...base.contact,
    ...(raw.contact && typeof raw.contact === 'object' ? raw.contact : {}),
  };

  const allowedTemplateKeys = new Set(PUBLIC_PAGE_TEMPLATES.map((tpl) => tpl.key));
  const normalizedTemplate = allowedTemplateKeys.has(raw.templateKey)
    ? raw.templateKey
    : base.templateKey;

  const slugNormalized = normalizeSlug(raw.bookingSlug ?? base.bookingSlug) || '';
  const showScheduleMeeting =
    raw.showScheduleMeeting !== undefined ? Boolean(raw.showScheduleMeeting) : !!slugNormalized;

  return {
    ...base,
    ...raw,
    slug: normalizeSlug(raw.slug || base.slug) || base.slug,
    bookingSlug: slugNormalized,
    showScheduleMeeting,
    title: normalizeText(raw.title ?? base.title, 80),
    subtitle: normalizeText(raw.subtitle ?? base.subtitle, 180),
    templateKey: normalizedTemplate,
    isPublished: Boolean(raw.isPublished),
    telegramHandle: normalizeTelegramHandle(raw.telegramHandle ?? base.telegramHandle),
    telegramGroup: normalizeExternalUrl(raw.telegramGroup ?? base.telegramGroup),
    companyName: normalizeText(raw.companyName ?? base.companyName, 120),
    companyDescription: normalizeText(raw.companyDescription ?? base.companyDescription, 480),
    companyWebsite: normalizeExternalUrl(raw.companyWebsite ?? base.companyWebsite),
    websiteUrl: normalizeExternalUrl(raw.websiteUrl ?? base.websiteUrl),
    photoUrl: String(raw.photoUrl ?? base.photoUrl ?? '')
      .trim()
      .slice(0, 4_000_000),
    accentColor: normalizeText(raw.accentColor ?? base.accentColor, 20),
    social: {
      instagram: normalizeExternalUrl(social.instagram),
      facebook: normalizeExternalUrl(social.facebook),
      x: normalizeExternalUrl(social.x),
      linkedin: normalizeExternalUrl(social.linkedin),
      tiktok: normalizeExternalUrl(social.tiktok),
      youtube: normalizeExternalUrl(social.youtube),
    },
    contact: {
      email: normalizeText(contact.email, 120),
      phone: normalizeText(contact.phone, 40),
      whatsapp: normalizeText(contact.whatsapp, 40),
    },
    updatedAt: raw.updatedAt || null,
  };
}

async function ensureTableReady() {
  if (!hasSupabase() || !supabase) return false;
  if (supabaseTableReady !== null) return supabaseTableReady;
  try {
    const { error } = await supabase.from(TABLE).select('id').limit(0);
    supabaseTableReady = !error;
  } catch {
    supabaseTableReady = false;
  }
  return supabaseTableReady;
}

function isUniqueViolation(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique');
}

export function buildDefaultPublicPage(user) {
  return getBasePage(user);
}

export async function loadUserPublicPage(userId, user = null) {
  if (!userId) return buildDefaultPublicPage(user);

  const localMap = readLocalMap();
  const localData = localMap[userId];
  let fallback = localData ? normalizePage(localData, user) : buildDefaultPublicPage(user);

  if (await ensureTableReady()) {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('slug, is_published, data, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data?.data) {
        fallback = normalizePage(
          {
            ...data.data,
            slug: data.slug || data.data.slug,
            isPublished: data.is_published ?? data.data.isPublished,
            updatedAt: data.updated_at || data.data.updatedAt || null,
          },
          user
        );
      }
    } catch {
      // Fall back to local data when Supabase read fails.
    }
  }

  localMap[userId] = fallback;
  writeLocalMap(localMap);
  return fallback;
}

export async function saveUserPublicPage(userId, page, user = null) {
  if (!userId) throw new Error('User required');

  const nowIso = new Date().toISOString();
  const normalized = normalizePage({ ...page, updatedAt: nowIso }, user);
  if (!/^[a-z0-9-]{3,40}$/.test(normalized.slug)) {
    throw new Error('Slug must be 3-40 chars, using lowercase letters, numbers, and hyphens.');
  }

  const localMap = readLocalMap();
  const slugConflict = Object.entries(localMap).some(
    ([otherUserId, otherPage]) =>
      otherUserId !== userId && normalizeSlug(otherPage?.slug) === normalized.slug
  );
  if (slugConflict) {
    throw new Error('This public slug is already used by another page on this device.');
  }

  localMap[userId] = normalized;
  writeLocalMap(localMap);

  if (await ensureTableReady()) {
    const { error } = await supabase.from(TABLE).upsert(
      {
        user_id: userId,
        slug: normalized.slug,
        is_published: normalized.isPublished,
        data: normalized,
        updated_at: normalized.updatedAt,
      },
      { onConflict: 'user_id' }
    );
    if (error) {
      if (isUniqueViolation(error)) {
        throw new Error('This public slug is already taken. Try another one.');
      }
      throw error;
    }
  }

  return normalized;
}

export async function loadPublishedPublicPageBySlug(slug) {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) return null;

  if (await ensureTableReady()) {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('slug, is_published, data, updated_at')
        .eq('slug', normalizedSlug)
        .eq('is_published', true)
        .maybeSingle();
      if (!error && data?.data) {
        const merged = {
          ...data.data,
          slug: data.slug || data.data.slug,
          isPublished: true,
          updatedAt: data.updated_at || data.data.updatedAt || null,
        };
        const normalized = normalizePage(merged, null);
        normalized.templateKey = merged.templateKey || normalized.templateKey || 'classic_links';
        return normalized;
      }
    } catch {
      // Use local fallback.
    }
  }

  const localMap = readLocalMap();
  const match = Object.values(localMap).find(
    (item) => normalizeSlug(item?.slug) === normalizedSlug && Boolean(item?.isPublished)
  );
  if (match) {
    const normalized = normalizePage(match, null);
    normalized.templateKey = match.templateKey || normalized.templateKey || 'classic_links';
    return normalized;
  }
  return null;
}

export function getPublicPageUrl(
  slug,
  origin = typeof window !== 'undefined' ? window.location.origin : ''
) {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug || !origin) return '';
  return `${origin}/p/${normalizedSlug}`;
}
