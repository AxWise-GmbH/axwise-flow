-- ============================================================
-- 096_po_depth.sql — PO depth mode for PRD generation
-- ============================================================

ALTER TABLE goals ADD COLUMN IF NOT EXISTS po_depth TEXT DEFAULT 'standard';
