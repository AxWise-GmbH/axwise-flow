-- ============================================================
-- 068: Knowledge Base V2 — multi-owner, file/link support, tags
-- ============================================================

-- New columns on existing knowledge_documents table
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS owner_type text DEFAULT 'user';
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS owner_id text;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS content_type text DEFAULT 'note';
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS file_size integer;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS file_mime text;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS url_meta jsonb DEFAULT '{}';
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS refs text[] DEFAULT '{}';

-- Constraints (idempotent via DO blocks)
DO $$ BEGIN
  ALTER TABLE knowledge_documents ADD CONSTRAINT chk_kd_owner_type
    CHECK (owner_type IN ('user', 'agent', 'team', 'partner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE knowledge_documents ADD CONSTRAINT chk_kd_content_type
    CHECK (content_type IN ('note', 'file', 'link', 'template'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kd_owner ON knowledge_documents(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_kd_content_type ON knowledge_documents(content_type);
CREATE INDEX IF NOT EXISTS idx_kd_tags ON knowledge_documents USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_kd_is_pinned ON knowledge_documents(is_pinned) WHERE is_pinned = true;

-- RLS stays the same: user_id = auth.uid()
-- The existing policy "Users can manage knowledge_documents" already covers this.
