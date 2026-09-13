-- Library Universe seed — generated from scripts/library-universe-seed-proposal.json
-- Re-run scripts/json-to-migration.mjs to regenerate after editing the JSON.
-- Entries are system-owned (user_id IS NULL) and visible to all authenticated users.

-- ── RLS: let any authenticated user read curated library_example rows ──
DROP POLICY IF EXISTS "Read curated library_example" ON public.knowledge_documents;
CREATE POLICY "Read curated library_example"
  ON public.knowledge_documents
  FOR SELECT
  TO authenticated
  USING (category = 'library_example' AND user_id IS NULL);

-- ── Seed entries ──

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Stripe — Homepage',
  'Animated gradient hero, code-as-product visuals, single concrete CTA, customer logos above the fold. Sets the bar for SaaS landing pages.',
  'https://stripe.com',
  'library_example',
  '{"deliverable_type":"landing_page","brand":"Stripe","asset_url":"https://stripe.com","preview_url":"https://stripe.com","quality_score":98,"source":"curated","source_goal_id":null,"what_makes_it_great":"Animated gradient hero, code-as-product visuals, single concrete CTA, customer logos above the fold. Sets the bar for SaaS landing pages.","recreate_prompt":"Build a developer-first SaaS landing page with: animated multi-color gradient hero, headline focused on a single business outcome, one primary CTA, code snippet visual showing the product in action, 6-logo customer proof strip, and a 3-column feature grid below. Sans-serif, plenty of whitespace, dark navigation that turns light on scroll.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['saas','developer','gradient','hero']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://stripe.com'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Linear — Product Page',
  'Dark mode default, scroll-triggered product demos, opinionated typography, zero stock illustrations. Every section earns its place.',
  'https://linear.app',
  'library_example',
  '{"deliverable_type":"landing_page","brand":"Linear","asset_url":"https://linear.app","preview_url":"https://linear.app","quality_score":97,"source":"curated","source_goal_id":null,"what_makes_it_great":"Dark mode default, scroll-triggered product demos, opinionated typography, zero stock illustrations. Every section earns its place.","recreate_prompt":"Build a dark-mode product landing page with: monochrome typography-first hero, single sentence value prop, scroll-locked product UI demo on the right, three feature sections each with a real product screenshot (no stock art), and a minimal footer. Accent color used sparingly.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['dark-mode','minimal','scroll-animation']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://linear.app'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Vercel — Homepage',
  'Performance metrics treated as marketing copy. Live deployment previews. Geometric monochrome aesthetic with one accent. Speaks dev-to-dev.',
  'https://vercel.com',
  'library_example',
  '{"deliverable_type":"landing_page","brand":"Vercel","asset_url":"https://vercel.com","preview_url":"https://vercel.com","quality_score":96,"source":"curated","source_goal_id":null,"what_makes_it_great":"Performance metrics treated as marketing copy. Live deployment previews. Geometric monochrome aesthetic with one accent. Speaks dev-to-dev.","recreate_prompt":"Build a developer infrastructure landing page with: black background, geometric triangle motif, live performance metrics as hero stats, single-line CTA, deployment workflow diagram, and a technical capabilities grid using monospace labels.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['developer','infrastructure','monochrome']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://vercel.com'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Notion — Homepage',
  'Custom illustrations carry the brand. Multi-persona conversion funnel. Templates gallery as social proof. Approachable without being childish.',
  'https://notion.so',
  'library_example',
  '{"deliverable_type":"landing_page","brand":"Notion","asset_url":"https://notion.so","preview_url":"https://notion.so","quality_score":94,"source":"curated","source_goal_id":null,"what_makes_it_great":"Custom illustrations carry the brand. Multi-persona conversion funnel. Templates gallery as social proof. Approachable without being childish.","recreate_prompt":"Build a productivity SaaS landing page with: cream/beige background, custom hand-drawn illustration in hero, friendly headline, persona-switcher tabs (engineering/design/marketing/sales) below the fold, and a templates gallery section as social proof.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['illustration','personas','warm']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://notion.so'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Framer — Homepage',
  'The page IS the product demo — every element is interactive. Showcases what the tool can build. Bold sans-serif type, big imagery.',
  'https://framer.com',
  'library_example',
  '{"deliverable_type":"landing_page","brand":"Framer","asset_url":"https://framer.com","preview_url":"https://framer.com","quality_score":95,"source":"curated","source_goal_id":null,"what_makes_it_great":"The page IS the product demo — every element is interactive. Showcases what the tool can build. Bold sans-serif type, big imagery.","recreate_prompt":"Build a no-code design tool landing page where every section demonstrates the product itself: interactive hero with draggable elements, oversized sans-serif headline, components gallery, and animated transitions between sections. The page must feel like the product.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['interactive','design-tool','demo-as-page']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://framer.com'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Superhuman — Homepage',
  'Premium positioning through restraint. Video-first hero, no pricing on landing page (intentional friction), keyboard-shortcut visual language.',
  'https://superhuman.com',
  'library_example',
  '{"deliverable_type":"landing_page","brand":"Superhuman","asset_url":"https://superhuman.com","preview_url":"https://superhuman.com","quality_score":93,"source":"curated","source_goal_id":null,"what_makes_it_great":"Premium positioning through restraint. Video-first hero, no pricing on landing page (intentional friction), keyboard-shortcut visual language.","recreate_prompt":"Build a premium productivity tool landing page with: full-bleed product video hero, no visible pricing (link to pricing page only), keyboard-shortcut visual motifs throughout, minimalist navigation, and testimonials from named individuals with company logos.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['premium','video-hero','keyboard']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://superhuman.com'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Apple — iPhone Product Page',
  'Long-scroll storytelling at master level. Each section is a single idea with enormous typography and zero clutter. Product photography is the design.',
  'https://www.apple.com/iphone/',
  'library_example',
  '{"deliverable_type":"landing_page","brand":"Apple","asset_url":"https://www.apple.com/iphone/","preview_url":"https://www.apple.com/iphone/","quality_score":99,"source":"curated","source_goal_id":null,"what_makes_it_great":"Long-scroll storytelling at master level. Each section is a single idea with enormous typography and zero clutter. Product photography is the design.","recreate_prompt":"Build a long-scroll product story page with: full-viewport sections (one idea each), enormous SF Pro typography, hero product photo on white background, scroll-triggered fades, no sidebars, no navigation friction. Each section answers exactly one question.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['long-scroll','storytelling','product-photo']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://www.apple.com/iphone/'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Y Combinator — Pitch Deck Template',
  '10 slides, one idea per slide, no decoration. Forces founders to think in concrete claims. Has minted thousands of funded startups.',
  'https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck',
  'library_example',
  '{"deliverable_type":"presentation","brand":"Y Combinator","asset_url":"https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck","preview_url":"https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck","quality_score":96,"source":"curated","source_goal_id":null,"what_makes_it_great":"10 slides, one idea per slide, no decoration. Forces founders to think in concrete claims. Has minted thousands of funded startups.","recreate_prompt":"Build a 10-slide seed pitch deck: title, problem, solution, why now, market size, business model, traction, team, ask, contact. One headline + one supporting visual per slide. No bullet lists. Sans-serif, white background, single accent color.","recreate_tools":["create_slides"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['pitch-deck','seed','minimal']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Sequoia Capital — Writing a Business Plan',
  'The canonical 10-section pitch structure used by tier-1 VCs. Each section has a precise question to answer — no fluff possible.',
  'https://www.sequoiacap.com/article/writing-a-business-plan/',
  'library_example',
  '{"deliverable_type":"presentation","brand":"Sequoia","asset_url":"https://www.sequoiacap.com/article/writing-a-business-plan/","preview_url":"https://www.sequoiacap.com/article/writing-a-business-plan/","quality_score":95,"source":"curated","source_goal_id":null,"what_makes_it_great":"The canonical 10-section pitch structure used by tier-1 VCs. Each section has a precise question to answer — no fluff possible.","recreate_prompt":"Build a 10-section pitch deck following Sequoia''s framework: company purpose, problem, solution, why now, market size, competition, product, business model, team, financials. Each slide states the question explicitly and answers in ≤30 words.","recreate_tools":["create_slides"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['pitch-deck','vc','framework']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://www.sequoiacap.com/article/writing-a-business-plan/'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Airbnb — Original Pitch Deck',
  'Famous for being scrappy yet effective: 14 slides, raised $600K. Proof that clarity beats polish. Numbers and screenshots, no abstraction.',
  'https://www.slideshare.net/PitchDeckCoach/airbnb-first-pitch-deck-editable',
  'library_example',
  '{"deliverable_type":"presentation","brand":"Airbnb","asset_url":"https://www.slideshare.net/PitchDeckCoach/airbnb-first-pitch-deck-editable","preview_url":"https://www.slideshare.net/PitchDeckCoach/airbnb-first-pitch-deck-editable","quality_score":92,"source":"curated","source_goal_id":null,"what_makes_it_great":"Famous for being scrappy yet effective: 14 slides, raised $600K. Proof that clarity beats polish. Numbers and screenshots, no abstraction.","recreate_prompt":"Build a 14-slide marketplace startup pitch deck inspired by early Airbnb: problem (3 clear pain points), solution (1 sentence), market validation (numbers only), product (3 screenshots), business model (transaction flow diagram), traction, team, ask. Plain typography, no design system.","recreate_tools":["create_slides"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['pitch-deck','marketplace','scrappy']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://www.slideshare.net/PitchDeckCoach/airbnb-first-pitch-deck-editable'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Stripe — Press Kit Banner Style',
  'Brand-consistent gradient banners with minimal text overlay. Each banner reads as part of one visual system, instantly recognizable.',
  'https://stripe.com/newsroom',
  'library_example',
  '{"deliverable_type":"smm_banner","brand":"Stripe","asset_url":"https://stripe.com/newsroom","preview_url":"https://stripe.com/newsroom","quality_score":94,"source":"curated","source_goal_id":null,"what_makes_it_great":"Brand-consistent gradient banners with minimal text overlay. Each banner reads as part of one visual system, instantly recognizable.","recreate_prompt":"Generate a 1200x630 social banner with: multi-color smooth gradient (purple→pink→orange), single-line headline in white sans-serif positioned bottom-left, small Stripe-style monogram in corner, no other elements. 16:9 aspect ratio, web-safe.","recreate_tools":["generate_image"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['gradient','social','brand-system']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://stripe.com/newsroom'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Apple — Product Launch Banner',
  'Product on pure white or black, dramatic side lighting, no marketing copy on the image itself. Lets the product be the message.',
  'https://www.apple.com/newsroom/',
  'library_example',
  '{"deliverable_type":"smm_banner","brand":"Apple","asset_url":"https://www.apple.com/newsroom/","preview_url":"https://www.apple.com/newsroom/","quality_score":97,"source":"curated","source_goal_id":null,"what_makes_it_great":"Product on pure white or black, dramatic side lighting, no marketing copy on the image itself. Lets the product be the message.","recreate_prompt":"Generate a 1200x1200 product launch banner: subject centered on pure black background, dramatic rim lighting from upper-left, photographic realism, no text overlay, no decorative elements. Studio product photography aesthetic.","recreate_tools":["generate_image"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['product-photo','minimal','launch']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://www.apple.com/newsroom/'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Mailchimp — Brand Illustration Style',
  'Hand-drawn illustration system that''s instantly recognizable. Yellow/black palette, slightly chaotic, never corporate. Personality at scale.',
  'https://mailchimp.com/about/brand-assets/',
  'library_example',
  '{"deliverable_type":"smm_banner","brand":"Mailchimp","asset_url":"https://mailchimp.com/about/brand-assets/","preview_url":"https://mailchimp.com/about/brand-assets/","quality_score":91,"source":"curated","source_goal_id":null,"what_makes_it_great":"Hand-drawn illustration system that''s instantly recognizable. Yellow/black palette, slightly chaotic, never corporate. Personality at scale.","recreate_prompt":"Generate a 1200x630 hand-drawn illustration banner: cream background, single hand-drawn character or object in expressive ink line style, mustard yellow accent color, slightly off-kilter composition, deliberately imperfect. Headline in chunky serif font.","recreate_tools":["generate_image"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['illustration','hand-drawn','personality']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://mailchimp.com/about/brand-assets/'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Notion — Templates Marketplace Card',
  'Each template card uses a flat duotone illustration with consistent palette. Browsable as a system, never feels like a content dump.',
  'https://www.notion.so/templates',
  'library_example',
  '{"deliverable_type":"smm_banner","brand":"Notion","asset_url":"https://www.notion.so/templates","preview_url":"https://www.notion.so/templates","quality_score":90,"source":"curated","source_goal_id":null,"what_makes_it_great":"Each template card uses a flat duotone illustration with consistent palette. Browsable as a system, never feels like a content dump.","recreate_prompt":"Generate a 1200x800 template card image: flat 2-color illustration (cream + one accent), abstract object representing the template''s purpose, centered composition, soft drop shadow, plenty of negative space. Part of a system — must look like one of 50 cards in a grid.","recreate_tools":["generate_image"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['flat','duotone','system']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://www.notion.so/templates'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'GitLab — Company Handbook',
  'The gold standard for operational documentation. 2000+ pages, fully public, every process is written down. Has shaped how remote companies operate.',
  'https://handbook.gitlab.com/',
  'library_example',
  '{"deliverable_type":"document_template","brand":"GitLab","asset_url":"https://handbook.gitlab.com/","preview_url":"https://handbook.gitlab.com/","quality_score":99,"source":"curated","source_goal_id":null,"what_makes_it_great":"The gold standard for operational documentation. 2000+ pages, fully public, every process is written down. Has shaped how remote companies operate.","recreate_prompt":"Build a company operations document with: hierarchical sectioned structure (org/process/people/values), every claim linked to a source, decision logs with dates and rationale, glossary of terms, change history per section. Plain markdown, no marketing language, no images.","recreate_tools":["generate_document"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['handbook','operations','remote']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://handbook.gitlab.com/'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Stripe — API Documentation',
  'Three-column layout (nav / prose / code) widely copied because it works. Every endpoint has runnable examples in 5 languages. Industry benchmark.',
  'https://stripe.com/docs/api',
  'library_example',
  '{"deliverable_type":"document_template","brand":"Stripe","asset_url":"https://stripe.com/docs/api","preview_url":"https://stripe.com/docs/api","quality_score":99,"source":"curated","source_goal_id":null,"what_makes_it_great":"Three-column layout (nav / prose / code) widely copied because it works. Every endpoint has runnable examples in 5 languages. Industry benchmark.","recreate_prompt":"Build API documentation with: three-column layout (sidebar nav, prose middle, code panel right), every endpoint shows curl/node/python/ruby/php examples side-by-side, request/response JSON inline, no hidden parameters, dark code theme contrasted against white prose.","recreate_tools":["generate_document"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['api-docs','three-column','runnable']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://stripe.com/docs/api'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Y Combinator — SAFE Document',
  'Made early-stage fundraising legally trivial. 5 pages instead of 50. Standardized so much that VCs don''t negotiate it. Simplicity as leverage.',
  'https://www.ycombinator.com/documents',
  'library_example',
  '{"deliverable_type":"document_template","brand":"Y Combinator","asset_url":"https://www.ycombinator.com/documents","preview_url":"https://www.ycombinator.com/documents","quality_score":95,"source":"curated","source_goal_id":null,"what_makes_it_great":"Made early-stage fundraising legally trivial. 5 pages instead of 50. Standardized so much that VCs don''t negotiate it. Simplicity as leverage.","recreate_prompt":"Build a startup fundraising document modeled on the SAFE: maximum 5 pages, plain English with defined terms in caps, fill-in fields highlighted, no boilerplate clauses unless legally required, signature block on last page only. Read like a contract a founder can understand.","recreate_tools":["generate_document"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['legal','fundraising','minimal']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://www.ycombinator.com/documents'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'AWS — Well-Architected Framework',
  'Pillar-based framework (security/reliability/perf/cost/ops) with checklist questions per pillar. Auditable. Used as a template by every cloud team.',
  'https://aws.amazon.com/architecture/well-architected/',
  'library_example',
  '{"deliverable_type":"document_template","brand":"AWS","asset_url":"https://aws.amazon.com/architecture/well-architected/","preview_url":"https://aws.amazon.com/architecture/well-architected/","quality_score":93,"source":"curated","source_goal_id":null,"what_makes_it_great":"Pillar-based framework (security/reliability/perf/cost/ops) with checklist questions per pillar. Auditable. Used as a template by every cloud team.","recreate_prompt":"Build a technical architecture review document with: 5 pillar sections (each with definition, design principles, best practices, checklist of yes/no questions), executive summary, risk register at the end. Use tables for checklists, not bullet lists.","recreate_tools":["generate_document"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['architecture','framework','checklist']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://aws.amazon.com/architecture/well-architected/'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Linear — Issue Table',
  'Dense without feeling cluttered. Every column earns its place: id, title, status pill, priority, assignee, project, due. Keyboard-first interaction model.',
  'https://linear.app/features/issue-tracking',
  'library_example',
  '{"deliverable_type":"table_structure","brand":"Linear","asset_url":"https://linear.app/features/issue-tracking","preview_url":"https://linear.app/features/issue-tracking","quality_score":96,"source":"curated","source_goal_id":null,"what_makes_it_great":"Dense without feeling cluttered. Every column earns its place: id, title, status pill, priority, assignee, project, due. Keyboard-first interaction model.","recreate_prompt":"Build a task table with columns: identifier (monospace ID), title (truncated with ellipsis), status (colored pill), priority (icon), assignee (avatar), project (colored tag), due date. Single-pixel borders, hover row highlight, keyboard navigation. Dark theme default.","recreate_tools":["generate_document"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['dense','task-tracking','keyboard-first']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://linear.app/features/issue-tracking'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Notion — Database View',
  'Same data renders as table/board/calendar/gallery without changing structure. Properties have types (date, select, relation). Resizable columns, inline edit.',
  'https://www.notion.so/help/intro-to-databases',
  'library_example',
  '{"deliverable_type":"table_structure","brand":"Notion","asset_url":"https://www.notion.so/help/intro-to-databases","preview_url":"https://www.notion.so/help/intro-to-databases","quality_score":92,"source":"curated","source_goal_id":null,"what_makes_it_great":"Same data renders as table/board/calendar/gallery without changing structure. Properties have types (date, select, relation). Resizable columns, inline edit.","recreate_prompt":"Build a flexible data table where columns have explicit types (text, number, date, select, multi-select, relation, formula, checkbox), columns are resizable, cells edit inline, and the same dataset can switch between table/kanban/calendar views via a tab control.","recreate_tools":["generate_document"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['multi-view','typed-columns','flexible']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://www.notion.so/help/intro-to-databases'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Airtable — Grid View',
  'Spreadsheet familiarity with database power. Color-coded select fields, attachment cells, formula columns, row expand to detail panel.',
  'https://www.airtable.com/platform/views',
  'library_example',
  '{"deliverable_type":"table_structure","brand":"Airtable","asset_url":"https://www.airtable.com/platform/views","preview_url":"https://www.airtable.com/platform/views","quality_score":90,"source":"curated","source_goal_id":null,"what_makes_it_great":"Spreadsheet familiarity with database power. Color-coded select fields, attachment cells, formula columns, row expand to detail panel.","recreate_prompt":"Build a grid table with: spreadsheet-like cell selection, color-coded single/multi-select cells, attachment cells showing thumbnails, formula columns with live calculation, click row to open a side panel with full record details and inline editing.","recreate_tools":["generate_document"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['spreadsheet','database','side-panel']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://www.airtable.com/platform/views'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'shadcn/ui — Component Library',
  'Copy-paste components, not an npm dependency. Every component is owned by your codebase. Radix primitives + Tailwind. Fundamentally rethought distribution.',
  'https://github.com/shadcn-ui/ui',
  'library_example',
  '{"deliverable_type":"code","brand":"shadcn","asset_url":"https://github.com/shadcn-ui/ui","preview_url":"https://ui.shadcn.com/","quality_score":97,"source":"curated","source_goal_id":null,"what_makes_it_great":"Copy-paste components, not an npm dependency. Every component is owned by your codebase. Radix primitives + Tailwind. Fundamentally rethought distribution.","recreate_prompt":"Build a React component library that ships as copy-paste source files (not an installable package): each component is a single .tsx file, uses Radix primitives for behavior and Tailwind for styling, exposes a CLI to copy components into a target project''s src/components/ui folder. No runtime dependency on the library itself.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['react','tailwind','copy-paste']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://github.com/shadcn-ui/ui'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Vercel — Next.js Commerce',
  'Production-grade ecommerce starter. App router, edge runtime, server components, real Shopify integration. Code is the docs.',
  'https://github.com/vercel/commerce',
  'library_example',
  '{"deliverable_type":"code","brand":"Vercel","asset_url":"https://github.com/vercel/commerce","preview_url":"https://demo.vercel.store/","quality_score":94,"source":"curated","source_goal_id":null,"what_makes_it_great":"Production-grade ecommerce starter. App router, edge runtime, server components, real Shopify integration. Code is the docs.","recreate_prompt":"Build a production-ready ecommerce starter using Next.js App Router with: server components for product pages, edge runtime API routes, Shopify Storefront API integration, optimistic cart updates, ISR for product pages, fully typed with TypeScript. No client-side state library — leverage URL state and server actions.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['nextjs','ecommerce','starter']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://github.com/vercel/commerce'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Cal.com — Open Source Scheduling',
  'Open-source Calendly clone with monorepo structure (turborepo), Prisma schema as source of truth, plugin architecture for integrations. Real-world Next.js at scale.',
  'https://github.com/calcom/cal.com',
  'library_example',
  '{"deliverable_type":"code","brand":"Cal.com","asset_url":"https://github.com/calcom/cal.com","preview_url":"https://cal.com","quality_score":92,"source":"curated","source_goal_id":null,"what_makes_it_great":"Open-source Calendly clone with monorepo structure (turborepo), Prisma schema as source of truth, plugin architecture for integrations. Real-world Next.js at scale.","recreate_prompt":"Build an open-source scheduling platform monorepo with: Turborepo workspaces (web/api/embed/website), Prisma schema as the data contract, tRPC for typed API calls, NextAuth for auth, plugin folder pattern for calendar integrations (Google/Outlook/Apple). Document the plugin contract.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['monorepo','scheduling','open-source']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://github.com/calcom/cal.com'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Supabase — Realtime Chat Example',
  'Minimal but complete: row-level security, realtime subscriptions, auth, all in <300 lines. Ships as a working app, not a snippet.',
  'https://github.com/supabase/supabase/tree/master/examples/realtime',
  'library_example',
  '{"deliverable_type":"code","brand":"Supabase","asset_url":"https://github.com/supabase/supabase/tree/master/examples/realtime","preview_url":"https://supabase.com/docs/guides/realtime","quality_score":91,"source":"curated","source_goal_id":null,"what_makes_it_great":"Minimal but complete: row-level security, realtime subscriptions, auth, all in <300 lines. Ships as a working app, not a snippet.","recreate_prompt":"Build a realtime chat example as a single Next.js app: Supabase auth (magic link), messages table with RLS (users can only see rooms they''re in), Supabase Realtime channel subscription per room, optimistic message sends, total under 300 lines of app code. Include the SQL migration in the repo.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['supabase','realtime','minimal-example']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://github.com/supabase/supabase/tree/master/examples/realtime'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Carrd — One-Page Site',
  'Proves that one perfect viewport beats a long page. Hero + value prop + form, nothing else. Loads in <100ms. Has powered millions of sites.',
  'https://carrd.co',
  'library_example',
  '{"deliverable_type":"landing_page","brand":"Carrd","asset_url":"https://carrd.co","preview_url":"https://carrd.co","quality_score":89,"source":"curated","source_goal_id":null,"what_makes_it_great":"Proves that one perfect viewport beats a long page. Hero + value prop + form, nothing else. Loads in <100ms. Has powered millions of sites.","recreate_prompt":"Build a single-viewport landing page: centered logo, one-line headline, one-line subhead, single email input + submit button, one social proof line below the form. No scroll, no navigation, no footer. Total page weight under 50KB.","recreate_tools":["deploy_site"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['one-page','minimal','fast']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://carrd.co'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Pitch — Modern Deck Template',
  'Showcases modern deck design: full-bleed imagery, oversized type, asymmetric layouts. The opposite of corporate PowerPoint.',
  'https://pitch.com/templates',
  'library_example',
  '{"deliverable_type":"presentation","brand":"Pitch","asset_url":"https://pitch.com/templates","preview_url":"https://pitch.com/templates","quality_score":88,"source":"curated","source_goal_id":null,"what_makes_it_great":"Showcases modern deck design: full-bleed imagery, oversized type, asymmetric layouts. The opposite of corporate PowerPoint.","recreate_prompt":"Build a modern presentation deck with: full-bleed photo backgrounds on section dividers, oversized typography (60pt+ on title slides), asymmetric two-column layouts on content slides, accent color used as a single horizontal line motif, no bullet lists — every slide uses a diagram, image, or pull quote.","recreate_tools":["create_slides"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['modern','asymmetric','full-bleed']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://pitch.com/templates'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Tufte CSS — Long-Form Document Style',
  'Margin notes instead of footnotes, ET Book typography, sidenote-driven prose. Designed for serious reading. Used by researchers, essayists, technical writers.',
  'https://edwardtufte.github.io/tufte-css/',
  'library_example',
  '{"deliverable_type":"document_template","brand":"Edward Tufte","asset_url":"https://edwardtufte.github.io/tufte-css/","preview_url":"https://edwardtufte.github.io/tufte-css/","quality_score":96,"source":"curated","source_goal_id":null,"what_makes_it_great":"Margin notes instead of footnotes, ET Book typography, sidenote-driven prose. Designed for serious reading. Used by researchers, essayists, technical writers.","recreate_prompt":"Build a long-form essay document using Tufte''s principles: ET Book serif font, wide right margin for sidenotes (not footnotes), figures inset into the margin not centered, no headers above h2, max 600px content column, paragraph indents instead of blank lines.","recreate_tools":["generate_document"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['long-form','tufte','sidenotes']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://edwardtufte.github.io/tufte-css/'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Figma — Community Cover Banners',
  'Bold geometric covers with high color saturation. Consistent 16:9 ratio, tight type hierarchy, instantly readable as a thumbnail at 200px wide.',
  'https://www.figma.com/community',
  'library_example',
  '{"deliverable_type":"smm_banner","brand":"Figma","asset_url":"https://www.figma.com/community","preview_url":"https://www.figma.com/community","quality_score":89,"source":"curated","source_goal_id":null,"what_makes_it_great":"Bold geometric covers with high color saturation. Consistent 16:9 ratio, tight type hierarchy, instantly readable as a thumbnail at 200px wide.","recreate_prompt":"Generate a 1200x675 community cover banner: bold geometric composition with overlapping shapes in saturated colors (single primary + single accent), large sans-serif title bottom-left, small subtitle below, must remain readable when scaled to 200px wide. Flat — no gradients, no shadows.","recreate_tools":["generate_image"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['geometric','thumbnail-readable','saturated']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://www.figma.com/community'
);

INSERT INTO public.knowledge_documents
  (user_id, title, content, source, category, metadata, owner_type, owner_id, content_type, tags)
SELECT
  NULL,
  'Hugging Face — Model Card',
  'Standardized AI model documentation: intended use, limitations, training data, eval results, environmental impact. Made AI transparency a default, not an extra.',
  'https://huggingface.co/docs/hub/model-cards',
  'library_example',
  '{"deliverable_type":"document_template","brand":"Hugging Face","asset_url":"https://huggingface.co/docs/hub/model-cards","preview_url":"https://huggingface.co/docs/hub/model-cards","quality_score":90,"source":"curated","source_goal_id":null,"what_makes_it_great":"Standardized AI model documentation: intended use, limitations, training data, eval results, environmental impact. Made AI transparency a default, not an extra.","recreate_prompt":"Build an AI model documentation template with sections: model description, intended uses & limitations, training data, training procedure, evaluation results (table format), environmental impact, citation, contact. Each section has required fields — never optional. Markdown frontmatter for metadata.","recreate_tools":["generate_document"],"promoted_by":null,"promoted_at":null}'::jsonb,
  'user',
  NULL,
  'note',
  ARRAY['ai','transparency','standardized']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.knowledge_documents
  WHERE category = 'library_example'
    AND metadata->>'asset_url' = 'https://huggingface.co/docs/hub/model-cards'
);
