use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Invalid storage scope: {0}")]
    InvalidScope(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationRecord {
    pub operation_id: String,
    pub session_id: String,
    pub tool: String,
    pub title: Option<String>,
    pub created_at: String,
    pub sha256: String,
    pub json_path: String,
    pub md_path: String,
    pub markdown: Option<String>,
    pub artifact_json: Option<String>,
    pub candidate_json: Option<String>,
    pub input_json: Option<String>,
    pub provenance_json: Option<String>,
    pub quality_review_json: Option<String>,
    pub status: String,
}

pub struct StorageManager {
    conn: Connection,
    state_dir: PathBuf,
}

impl StorageManager {
    pub fn new(state_dir: PathBuf) -> Result<Self, StorageError> {
        fs::create_dir_all(&state_dir)?;
        let db_path = state_dir.join("axwise.db");
        let conn = Connection::open(&db_path)?;

        // WAL mode & normal synchronous for concurrency
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS operations (
                operation_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                tool TEXT NOT NULL,
                title TEXT,
                created_at TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                json_path TEXT NOT NULL,
                md_path TEXT NOT NULL,
                markdown TEXT,
                artifact_json TEXT,
                candidate_json TEXT,
                input_json TEXT,
                provenance_json TEXT,
                quality_review_json TEXT,
                status TEXT DEFAULT 'completed'
            );
            CREATE INDEX IF NOT EXISTS idx_ops_session ON operations(session_id);
            CREATE INDEX IF NOT EXISTS idx_ops_tool ON operations(tool);
            CREATE INDEX IF NOT EXISTS idx_ops_created ON operations(created_at DESC);

            CREATE TABLE IF NOT EXISTS stages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_id TEXT NOT NULL,
                stage_name TEXT NOT NULL,
                stage_data TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_stages_op ON stages(operation_id);

            CREATE TABLE IF NOT EXISTS model_cache (
                provider TEXT PRIMARY KEY,
                selected_model TEXT NOT NULL,
                available_models_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
        )?;

        Ok(Self { conn, state_dir })
    }

    pub fn save_operation(
        &mut self,
        record: &OperationRecord,
        raw_artifact_json: &str,
        raw_markdown: &str,
    ) -> Result<(), StorageError> {
        let session_dir = self.state_dir.join(&record.session_id);
        fs::create_dir_all(&session_dir)?;

        let json_dest = PathBuf::from(&record.json_path);
        let md_dest = PathBuf::from(&record.md_path);

        // Atomic file writes via temporary file
        Self::atomic_write(&json_dest, raw_artifact_json.as_bytes())?;
        Self::atomic_write(&md_dest, raw_markdown.as_bytes())?;

        self.conn.execute(
            "INSERT OR REPLACE INTO operations (
                operation_id, session_id, tool, title, created_at, sha256,
                json_path, md_path, markdown, artifact_json, candidate_json,
                input_json, provenance_json, quality_review_json, status
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                record.operation_id,
                record.session_id,
                record.tool,
                record.title,
                record.created_at,
                record.sha256,
                record.json_path,
                record.md_path,
                record.markdown,
                record.artifact_json,
                record.candidate_json,
                record.input_json,
                record.provenance_json,
                record.quality_review_json,
                record.status,
            ],
        )?;

        Ok(())
    }

    pub fn find_latest_artifact(
        &self,
        tools: &[&str],
        session_id: &str,
    ) -> Result<Option<OperationRecord>, StorageError> {
        if tools.is_empty() {
            return Ok(None);
        }

        let in_clause = tools.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT operation_id, session_id, tool, title, created_at, sha256,
                    json_path, md_path, markdown, artifact_json, candidate_json,
                    input_json, provenance_json, quality_review_json, status
             FROM operations
             WHERE session_id = ? AND tool IN ({}) AND status = 'completed'
             ORDER BY created_at DESC LIMIT 1",
            in_clause
        );

        let mut stmt = self.conn.prepare(&query)?;
        let mut param_values: Vec<&dyn rusqlite::ToSql> = vec![&session_id];
        for tool in tools {
            param_values.push(tool);
        }

        let result = stmt
            .query_row(rusqlite::params_from_iter(param_values), |row| {
                Ok(OperationRecord {
                    operation_id: row.get(0)?,
                    session_id: row.get(1)?,
                    tool: row.get(2)?,
                    title: row.get(3)?,
                    created_at: row.get(4)?,
                    sha256: row.get(5)?,
                    json_path: row.get(6)?,
                    md_path: row.get(7)?,
                    markdown: row.get(8)?,
                    artifact_json: row.get(9)?,
                    candidate_json: row.get(10)?,
                    input_json: row.get(11)?,
                    provenance_json: row.get(12)?,
                    quality_review_json: row.get(13)?,
                    status: row.get(14)?,
                })
            })
            .optional()?;

        Ok(result)
    }

    fn atomic_write(dest: &Path, content: &[u8]) -> Result<(), StorageError> {
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        let temp_path = dest.with_extension("tmp");
        {
            let mut file = File::create(&temp_path)?;
            file.write_all(content)?;
            file.flush()?;
        }
        fs::rename(temp_path, dest)?;
        Ok(())
    }
}
