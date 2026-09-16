/**
 * PageBuilder - GrapesJS-powered visual landing page editor.
 *
 * Loads agent-generated HTML (or blank) into a WYSIWYG editor.
 * Users can drag/reorder sections, edit text inline, change styles,
 * and use AI Assist to regenerate sections via Claude.
 *
 * Route: /page-builder/:pageId?
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Snackbar,
  Alert,
  CircularProgress,
  Typography,
  Collapse,
  Paper,
  Tooltip,
  useTheme,
  alpha,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddIcon from '@mui/icons-material/Add';
import PageLayout from '../../components/Common/PageLayout';
import VersionPicker from '../../components/Deliverables/VersionPicker';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import grapesjs from 'grapesjs';
import gjsPresetWebpage from 'grapesjs-preset-webpage';
import gjsBlocksBasic from 'grapesjs-blocks-basic';
import gjsPluginForms from 'grapesjs-plugin-forms';
import 'grapesjs/dist/css/grapes.min.css';

import AppIcon from '../../components/icons/AppIcon';

// ── Landing page section blocks ──────────────────────────────────

const LANDING_BLOCKS = [
  {
    id: 'lp-hero',
    label: 'Hero Section',
    category: 'Landing Page',
    content: `<header class="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-700 to-pink-600 text-white py-24 md:py-32">
  <div class="max-w-6xl mx-auto px-6 text-center" data-aos="fade-up">
    <h1 class="text-5xl md:text-7xl font-bold tracking-tight mb-6">Your Headline Here</h1>
    <p class="text-xl md:text-2xl text-white/80 mb-10 max-w-2xl mx-auto">Supporting subheadline that explains the value proposition clearly.</p>
    <a href="#features" class="inline-block bg-white text-indigo-700 font-semibold px-8 py-4 rounded-full hover:scale-105 hover:shadow-xl transition-all duration-300">Get Started</a>
  </div>
</header>`,
  },
  {
    id: 'lp-features',
    label: 'Features Grid',
    category: 'Landing Page',
    content: `<section id="features" class="py-20 md:py-32 bg-gray-50">
  <div class="max-w-7xl mx-auto px-6">
    <h2 class="text-3xl md:text-4xl font-bold text-center mb-16" data-aos="fade-up">Why Choose Us</h2>
    <div class="grid md:grid-cols-3 gap-8">
      <div class="backdrop-blur-md bg-white/80 border border-gray-200 rounded-2xl p-8" data-aos="fade-up" data-aos-delay="100">
        <span class="material-symbols-outlined text-indigo-600 text-4xl mb-4">rocket_launch</span>
        <h3 class="text-xl font-bold mb-3">Feature One</h3>
        <p class="text-gray-600 leading-relaxed">Describe the specific benefit this feature provides to your users.</p>
      </div>
      <div class="backdrop-blur-md bg-white/80 border border-gray-200 rounded-2xl p-8" data-aos="fade-up" data-aos-delay="200">
        <span class="material-symbols-outlined text-indigo-600 text-4xl mb-4">shield</span>
        <h3 class="text-xl font-bold mb-3">Feature Two</h3>
        <p class="text-gray-600 leading-relaxed">Describe the specific benefit this feature provides to your users.</p>
      </div>
      <div class="backdrop-blur-md bg-white/80 border border-gray-200 rounded-2xl p-8" data-aos="fade-up" data-aos-delay="300">
        <span class="material-symbols-outlined text-indigo-600 text-4xl mb-4">speed</span>
        <h3 class="text-xl font-bold mb-3">Feature Three</h3>
        <p class="text-gray-600 leading-relaxed">Describe the specific benefit this feature provides to your users.</p>
      </div>
    </div>
  </div>
</section>`,
  },
  {
    id: 'lp-testimonials',
    label: 'Testimonials',
    category: 'Landing Page',
    content: `<section id="testimonials" class="py-20 md:py-32">
  <div class="max-w-7xl mx-auto px-6">
    <h2 class="text-3xl md:text-4xl font-bold text-center mb-16" data-aos="fade-up">What People Say</h2>
    <div class="grid md:grid-cols-2 gap-8">
      <div class="relative bg-white rounded-2xl p-8 shadow-lg" data-aos="fade-up" data-aos-delay="100">
        <span class="text-6xl opacity-20 absolute top-2 left-4 font-serif">"</span>
        <p class="text-gray-700 leading-relaxed mb-4 pt-6">This product changed how we work. Highly recommended for anyone looking to improve their workflow.</p>
        <p class="font-semibold text-gray-900">Jane Smith</p>
        <p class="text-sm text-gray-500">CEO, Acme Corp</p>
      </div>
      <div class="relative bg-white rounded-2xl p-8 shadow-lg" data-aos="fade-up" data-aos-delay="200">
        <span class="text-6xl opacity-20 absolute top-2 left-4 font-serif">"</span>
        <p class="text-gray-700 leading-relaxed mb-4 pt-6">The best tool we have adopted this year. Simple, powerful, and the team loves it.</p>
        <p class="font-semibold text-gray-900">John Doe</p>
        <p class="text-sm text-gray-500">CTO, StartupXYZ</p>
      </div>
    </div>
  </div>
</section>`,
  },
  {
    id: 'lp-pricing',
    label: 'Pricing Table',
    category: 'Landing Page',
    content: `<section id="pricing" class="py-20 md:py-32 bg-gray-50">
  <div class="max-w-5xl mx-auto px-6">
    <h2 class="text-3xl md:text-4xl font-bold text-center mb-16" data-aos="fade-up">Simple Pricing</h2>
    <div class="grid md:grid-cols-3 gap-8">
      <div class="bg-white rounded-2xl p-8 border border-gray-200 text-center" data-aos="fade-up" data-aos-delay="100">
        <h3 class="text-lg font-bold mb-2">Starter</h3>
        <p class="text-4xl font-bold mb-6">$9<span class="text-base font-normal text-gray-500">/mo</span></p>
        <ul class="text-gray-600 space-y-3 mb-8 text-left"><li>Feature A</li><li>Feature B</li></ul>
        <a href="#" class="block bg-gray-100 text-gray-800 rounded-full px-6 py-3 font-semibold hover:scale-105 transition-all">Choose</a>
      </div>
      <div class="bg-indigo-600 text-white rounded-2xl p-8 border-2 border-indigo-600 text-center scale-105 shadow-xl" data-aos="fade-up" data-aos-delay="200">
        <h3 class="text-lg font-bold mb-2">Pro</h3>
        <p class="text-4xl font-bold mb-6">$29<span class="text-base font-normal text-white/70">/mo</span></p>
        <ul class="text-white/90 space-y-3 mb-8 text-left"><li>Everything in Starter</li><li>Feature C</li><li>Feature D</li></ul>
        <a href="#" class="block bg-white text-indigo-700 rounded-full px-6 py-3 font-semibold hover:scale-105 transition-all">Choose</a>
      </div>
      <div class="bg-white rounded-2xl p-8 border border-gray-200 text-center" data-aos="fade-up" data-aos-delay="300">
        <h3 class="text-lg font-bold mb-2">Enterprise</h3>
        <p class="text-4xl font-bold mb-6">Custom</p>
        <ul class="text-gray-600 space-y-3 mb-8 text-left"><li>Everything in Pro</li><li>Dedicated support</li></ul>
        <a href="#" class="block bg-gray-100 text-gray-800 rounded-full px-6 py-3 font-semibold hover:scale-105 transition-all">Contact</a>
      </div>
    </div>
  </div>
</section>`,
  },
  {
    id: 'lp-faq',
    label: 'FAQ Section',
    category: 'Landing Page',
    content: `<section id="faq" class="py-20 md:py-32">
  <div class="max-w-3xl mx-auto px-6">
    <h2 class="text-3xl md:text-4xl font-bold text-center mb-16" data-aos="fade-up">Frequently Asked Questions</h2>
    <div class="space-y-4" data-aos="fade-up" data-aos-delay="100">
      <details class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 group">
        <summary class="font-semibold cursor-pointer list-none flex justify-between items-center">How does it work?<span class="ml-2 text-gray-400 group-open:rotate-180 transition-transform">&#9660;</span></summary>
        <p class="mt-4 text-gray-600 leading-relaxed">Provide a clear, helpful answer to this common question.</p>
      </details>
      <details class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 group">
        <summary class="font-semibold cursor-pointer list-none flex justify-between items-center">Is there a free trial?<span class="ml-2 text-gray-400 group-open:rotate-180 transition-transform">&#9660;</span></summary>
        <p class="mt-4 text-gray-600 leading-relaxed">Yes, we offer a 14-day free trial with no credit card required.</p>
      </details>
      <details class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 group">
        <summary class="font-semibold cursor-pointer list-none flex justify-between items-center">Can I cancel anytime?<span class="ml-2 text-gray-400 group-open:rotate-180 transition-transform">&#9660;</span></summary>
        <p class="mt-4 text-gray-600 leading-relaxed">Absolutely. Cancel your subscription at any time, no questions asked.</p>
      </details>
      <details class="bg-white rounded-xl p-6 shadow-sm border border-gray-100 group">
        <summary class="font-semibold cursor-pointer list-none flex justify-between items-center">Do you offer support?<span class="ml-2 text-gray-400 group-open:rotate-180 transition-transform">&#9660;</span></summary>
        <p class="mt-4 text-gray-600 leading-relaxed">Yes, our support team is available 24/7 via chat and email.</p>
      </details>
    </div>
  </div>
</section>`,
  },
  {
    id: 'lp-cta',
    label: 'CTA Banner',
    category: 'Landing Page',
    content: `<section class="py-20 md:py-32 bg-gradient-to-r from-indigo-600 to-purple-700 text-white text-center">
  <div class="max-w-4xl mx-auto px-6" data-aos="fade-up">
    <h2 class="text-3xl md:text-5xl font-bold mb-6">Ready to Get Started?</h2>
    <p class="text-xl text-white/80 mb-10">Join thousands of happy customers today.</p>
    <a href="#" class="inline-block bg-white text-indigo-700 font-semibold px-10 py-4 rounded-full hover:scale-105 hover:shadow-xl transition-all duration-300">Start Free Trial</a>
  </div>
</section>`,
  },
  {
    id: 'lp-footer',
    label: 'Footer',
    category: 'Landing Page',
    content: `<footer class="bg-gray-900 text-gray-400 py-12">
  <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
    <p class="text-sm">&copy; 2026 Your Brand. All rights reserved.</p>
    <nav class="flex gap-6 text-sm">
      <a href="#" class="hover:text-white transition-colors">Privacy</a>
      <a href="#" class="hover:text-white transition-colors">Terms</a>
      <a href="#" class="hover:text-white transition-colors">Contact</a>
    </nav>
  </div>
</footer>`,
  },
  {
    id: 'lp-nav',
    label: 'Navigation',
    category: 'Landing Page',
    content: `<nav class="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
  <div class="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
    <a href="#" class="text-xl font-bold text-gray-900">Brand</a>
    <div class="hidden md:flex gap-8 text-sm font-medium text-gray-600">
      <a href="#features" class="hover:text-indigo-600 transition-colors">Features</a>
      <a href="#testimonials" class="hover:text-indigo-600 transition-colors">Testimonials</a>
      <a href="#pricing" class="hover:text-indigo-600 transition-colors">Pricing</a>
      <a href="#faq" class="hover:text-indigo-600 transition-colors">FAQ</a>
    </div>
    <a href="#" class="bg-indigo-600 text-white px-6 py-2 rounded-full text-sm font-semibold hover:scale-105 transition-all">Get Started</a>
  </div>
</nav>`,
  },
];

// ── API helpers ───────────────────────────────────────────────────

async function apiFetch(op, opts = {}) {
  const { id, method = 'GET', body } = opts;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const params = new URLSearchParams({ path: 'landing-pages', op });
  if (id) params.set('id', id);
  const res = await fetch(`/api/app?${params}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

/**
 * Fire-and-forget call to /api/app?path=brand-kit&op=edit-event. Called when
 * the user manually saves a page so we can collect edit signals for the
 * next goal's pm-planning stage. Errors are swallowed - this is a learning
 * loop, not a critical path; failing to log shouldn't block a save.
 */
async function recordEditSignal({ landingPageId, goalId, originalHtml, newHtml }) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    const edits = [];

    // Rough kind classification - we only emit signal when the user changed
    // something meaningful. Length-delta heuristic catches "rewrote_copy"
    // and "removed_section" cases; refinement (real diff) lives server-side
    // in a future iteration.
    const lenBefore = (originalHtml || '').length;
    const lenAfter = (newHtml || '').length;
    if (lenBefore && Math.abs(lenAfter - lenBefore) > 200) {
      edits.push({
        kind: lenAfter < lenBefore ? 'removed_section' : 'rewrote_copy',
        delta: `${lenAfter - lenBefore > 0 ? '+' : ''}${lenAfter - lenBefore} chars`,
        note: 'Detected via client-side length delta in PageBuilder save.',
      });
    }

    // Color-swap heuristic: find hex literals in both versions, diff sets.
    const hexes = (s) =>
      new Set(((s || '').match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase()));
    const before = hexes(originalHtml);
    const after = hexes(newHtml);
    const added = [...after].filter((h) => !before.has(h)).slice(0, 5);
    const removed = [...before].filter((h) => !after.has(h)).slice(0, 5);
    if (added.length || removed.length) {
      edits.push({
        kind: 'color_swap',
        from: removed.join(',') || null,
        to: added.join(',') || null,
        note: 'Hex literal set changed between save iterations.',
      });
    }

    if (edits.length === 0) return; // Nothing interesting changed

    await fetch(`/api/app?path=brand-kit&op=edit-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        landingPageId,
        goalId,
        edits,
        summary: edits.map((e) => `${e.kind}${e.target ? ` ${e.target}` : ''}`).join('; '),
        signal_eligible: true,
      }),
    });
  } catch {
    // Intentionally swallowed - see fn doc.
  }
}

// ── Component ─────────────────────────────────────────────────────

export default function PageBuilder() {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  useAuth(); // ensure user is authenticated

  const editorRef = useRef(null);
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [pageData, setPageData] = useState(null);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });

  // AI Assist state
  const [aiOpen, setAiOpen] = useState(true);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const showSnack = useCallback((msg, severity = 'success') => {
    setSnack({ open: true, msg, severity });
  }, []);

  // ── Initialize GrapesJS ──────────────────────────────────────

  useEffect(() => {
    let editor;
    let cancelled = false;

    async function init() {
      if (cancelled || !containerRef.current) return;

      editor = grapesjs.init({
        container: containerRef.current,
        height: '100%',
        width: 'auto',
        fromElement: false,
        storageManager: false,
        plugins: [gjsPresetWebpage, gjsBlocksBasic, gjsPluginForms],
        pluginsOpts: {
          [gjsPresetWebpage]: {
            blocksBasicOpts: { flexGrid: true },
          },
        },
        canvas: {
          styles: [
            'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
            'https://unpkg.com/aos@2.3.1/dist/aos.css',
            'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined',
            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap',
          ],
          scripts: ['https://unpkg.com/aos@2.3.1/dist/aos.js'],
        },
        deviceManager: {
          devices: [
            { name: 'Desktop', width: '' },
            { name: 'Tablet', width: '768px', widthMedia: '992px' },
            { name: 'Mobile', width: '375px', widthMedia: '480px' },
          ],
        },
      });

      // Register landing page blocks
      for (const block of LANDING_BLOCKS) {
        editor.BlockManager.add(block.id, {
          label: block.label,
          category: block.category,
          content: block.content,
          media:
            '<svg viewBox="0 0 24 24" width="40" height="40"><rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
        });
      }

      editorRef.current = editor;

      // Load existing page if pageId provided
      if (pageId) {
        try {
          const data = await apiFetch('get', { id: pageId });
          setPageData(data);
          if (data.gjs_components) {
            editor.loadProjectData({
              pages: [{ component: data.gjs_components, styles: data.gjs_styles || [] }],
              ...(data.gjs_assets ? { assets: data.gjs_assets } : {}),
            });
          } else if (data.html) {
            editor.setComponents(data.html);
          }
        } catch (err) {
          showSnack(`Failed to load page: ${err.message}`, 'error');
        }
      }

      setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
      if (editor) editor.destroy();
    };
  }, [pageId, showSnack]);

  // ── Save ─────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    setSaving(true);
    try {
      const projectData = editor.getProjectData();
      const page = projectData.pages?.[0];
      const html = editor.getHtml();
      const css = editor.getCss();
      const fullHtml = buildFullHtml(html, css);

      const body = {
        gjs_components: page?.component || null,
        gjs_styles: page?.styles || null,
        gjs_assets: projectData.assets || null,
        html: fullHtml,
      };

      if (pageData?.id) {
        await apiFetch('save', { id: pageData.id, method: 'PATCH', body });
        showSnack('Page saved');
        // Phase 3 learning loop: signal that the user touched the AI's HTML.
        recordEditSignal({
          landingPageId: pageData.id,
          goalId: pageData.goal_id,
          originalHtml: pageData.html,
          newHtml: fullHtml,
        });
        // Keep local pageData.html fresh so the next save compares against
        // the version the user just committed, not the original AI output.
        setPageData((prev) => ({ ...prev, html: fullHtml }));
      } else {
        const created = await apiFetch('create', {
          method: 'POST',
          body: { ...body, title: 'Untitled Page' },
        });
        setPageData(created);
        navigate(`/page-builder/${created.id}`, { replace: true });
        showSnack('Page created');
      }
    } catch (err) {
      showSnack(`Save failed: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [pageData, navigate, showSnack]);

  // ── Deploy ───────────────────────────────────────────────────

  const handleDeploy = useCallback(async () => {
    if (!pageData?.id) {
      showSnack('Save the page first', 'warning');
      return;
    }
    setDeploying(true);
    try {
      // Save first
      await handleSave();
      const result = await apiFetch('deploy', { id: pageData.id, method: 'POST' });
      setPageData((prev) => ({
        ...prev,
        deployment_url: result.deploymentUrl,
        status: 'deployed',
      }));
      showSnack(`Deployed! ${result.deploymentUrl}`);
    } catch (err) {
      showSnack(`Deploy failed: ${err.message}`, 'error');
    } finally {
      setDeploying(false);
    }
  }, [pageData, handleSave, showSnack]);

  // ── AI Assist ────────────────────────────────────────────────

  const handleAiEdit = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      // Detect if canvas is empty - triggers full-page generation
      const wrapper = editor.getWrapper();
      const hasContent = wrapper.components().length > 0;
      const selected = editor.getSelected();
      const sectionHtml = selected ? selected.toHTML() : '';
      const isFullPage = !hasContent && !selected;

      const result = await apiFetch('ai-edit', {
        id: pageData?.id || '',
        method: 'POST',
        body: {
          sectionHtml,
          prompt: aiPrompt.trim(),
          mode: isFullPage ? 'full-page' : 'section',
        },
      });

      if (result.html) {
        if (result.isFullPage || isFullPage) {
          // Full page - replace entire canvas
          editor.setComponents(result.html);
          showSnack('Landing page generated!');
        } else if (selected) {
          // Replace selected component
          selected.replaceWith(result.html);
          showSnack('Section updated');
        } else {
          // Append new section
          wrapper.append(result.html);
          showSnack('Section added');
        }
        setAiPrompt('');
      }
    } catch (err) {
      showSnack(`AI edit failed: ${err.message}`, 'error');
    } finally {
      setAiLoading(false);
    }
  }, [pageData, aiPrompt, showSnack]);

  // ── Build full HTML document from GrapesJS output ────────────

  function buildFullHtml(bodyHtml, css) {
    return `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageData?.title || 'Landing Page'}</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <link rel="stylesheet" href="https://unpkg.com/aos@2.3.1/dist/aos.css" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>${css || ''}</style>
</head>
<body>
${bodyHtml}
<script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>
<script>AOS.init({ duration: 800, once: true });</script>
</body>
</html>`;
  }

  // ── Toolbar actions ──────────────────────────────────────────

  const toolbar = (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Improve quality: full-document refinement via LLM. Loads the new
          HTML into the editor; Save + Deploy still gate the actual ship. */}
      {pageData?.id && (
        <VersionPicker
          kind="landing_page"
          parentId={pageData.id}
          originalValue={pageData.html || ''}
          onSelectVersion={(html) => {
            const editor = editorRef.current;
            if (!editor || !html) return;
            editor.setComponents(html);
            showSnack('Version loaded - Save & Deploy to publish.', 'info');
          }}
        />
      )}
      {pageData?.deployment_url && (
        <Tooltip title="View live site">
          <Button
            size="small"
            variant="text"
            href={pageData.deployment_url}
            target="_blank"
            rel="noopener"
          >
            Live
          </Button>
        </Tooltip>
      )}
      <Button
        size="small"
        variant="outlined"
        startIcon={
          saving ? <CircularProgress size={16} /> : <AppIcon name="Save" fallback={SaveIcon} />
        }
        onClick={handleSave}
        disabled={saving || loading}
      >
        Save
      </Button>
      <Button
        size="small"
        variant="contained"
        startIcon={
          deploying ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            <AppIcon name="RocketLaunch" fallback={RocketLaunchIcon} />
          )
        }
        onClick={handleDeploy}
        disabled={deploying || loading}
      >
        Deploy
      </Button>
    </Box>
  );

  return (
    <PageLayout
      title="Page Builder"
      subtitle="Visual landing page editor - drag sections, edit text, deploy live"
      action={toolbar}
      maxWidth={1920}
      sx={{ pb: 0 }}
    >
      {/* Editor container */}
      <Box
        sx={{
          height: 'calc(100vh - 200px)',
          minHeight: 500,
          border: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.3),
          borderRadius: 2,
          overflow: 'hidden',
          position: 'relative',
          // GrapesJS dark theme overrides
          '& .gjs-one-bg': { backgroundColor: theme.palette.background.paper },
          '& .gjs-two-color': { color: theme.palette.text.primary },
          '& .gjs-pn-panel': { borderColor: alpha(theme.palette.divider, 0.2) },
        }}
      >
        {loading && (
          <Box
            sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}
          >
            <CircularProgress />
          </Box>
        )}
        <div ref={containerRef} style={{ height: '100%', display: loading ? 'none' : 'block' }} />
      </Box>
      {/* AI Assist Bar */}
      <Paper
        elevation={0}
        sx={{
          mt: 1,
          border: '1px solid',
          borderColor: alpha(theme.palette.primary.main, 0.2),
          borderRadius: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 2,
            py: 1,
            cursor: 'pointer',
          }}
          onClick={() => setAiOpen(!aiOpen)}
        >
          <AppIcon
            name="AutoFixHigh"
            fallback={AutoFixHighIcon}
            sx={{ mr: 1, color: 'primary.main', fontSize: 20 }}
          />
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            AI Assist - describe a landing page to generate, or select a section to edit
          </Typography>
          {aiOpen ? (
            <AppIcon name="ExpandLess" fallback={ExpandLessIcon} />
          ) : (
            <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
          )}
        </Box>
        <Collapse in={aiOpen}>
          <Box sx={{ display: 'flex', gap: 1, px: 2, pb: 2, pt: 0.5 }}>
            <TextField
              size="small"
              fullWidth
              placeholder='e.g. "Landing page for a coffee shop with 6 sections" or select a section and type "make this more modern"'
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAiEdit()}
              disabled={aiLoading}
            />
            <Button
              variant="contained"
              size="small"
              onClick={handleAiEdit}
              disabled={aiLoading || !aiPrompt.trim()}
              startIcon={
                aiLoading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <AppIcon name="Add" fallback={AddIcon} />
                )
              }
              sx={{ minWidth: 100 }}
            >
              Apply
            </Button>
          </Box>
        </Collapse>
      </Paper>
      {/* Snackbar */}
      <Snackbar
        open={snack.open}
        autoHideDuration={5000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={snack.severity}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          variant="filled"
        >
          {snack.msg}
        </Alert>
      </Snackbar>
    </PageLayout>
  );
}
