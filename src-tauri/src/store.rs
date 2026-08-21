//! Local persistence: network cache, chat history, settings.

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Store {
    conn: Mutex<Connection>,
}

pub fn data_dir() -> PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("sift");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    #[serde(default)]
    pub id: i64,
    pub chat_id: String,
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LibraryHit {
    pub story_id: u64,
    pub title: String,
    /// "thread" | "article" | "rundown" | "digest" | "brief" | "chat"
    pub kind: String,
    /// The matched text with the query terms marked by <b> tags.
    pub snippet: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub story_id: u64,
    pub title: String,
    pub read_at: i64,
    pub comment_count: u32,
    /// Which outputs already exist for this story.
    pub kinds: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Synthesis {
    pub id: i64,
    pub title: String,
    pub story_ids: Vec<u64>,
    pub markdown: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CachedOutput {
    pub markdown: String,
    pub provider: String,
    pub model: Option<String>,
    pub created_at: i64,
    #[serde(default)]
    pub report: Option<serde_json::Value>,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

impl Store {
    pub fn open() -> Result<Self> {
        let path = data_dir().join("sift.sqlite3");
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.execute_batch(SCHEMA)?;
        // Databases created before comment tracking existed lack this column.
        let _ = conn.execute(
            "ALTER TABLE read_state ADD COLUMN comment_count INTEGER NOT NULL DEFAULT 0",
            [],
        );
        Ok(Store {
            conn: Mutex::new(conn),
        })
    }

    fn with<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let guard = self
            .conn
            .lock()
            .map_err(|_| anyhow::anyhow!("store lock poisoned"))?;
        f(&guard)
    }

    // -- cache ---------------------------------------------------------------

    pub fn cache_get(&self, bucket: &str, key: &str, max_age: i64) -> Result<Option<String>> {
        self.with(|conn| {
            let row: Option<(String, i64)> = conn
                .query_row(
                    "SELECT value, fetched_at FROM cache WHERE bucket = ?1 AND key = ?2",
                    params![bucket, key],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?;

            Ok(row.and_then(|(value, fetched_at)| {
                if max_age > 0 && now() - fetched_at > max_age {
                    return None;
                }
                Some(value)
            }))
        })
    }

    pub fn cache_put(&self, bucket: &str, key: &str, value: &str) -> Result<()> {
        self.with(|conn| {
            conn.execute(
                "INSERT INTO cache (bucket, key, value, fetched_at) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(bucket, key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at",
                params![bucket, key, value, now()],
            )?;
            Ok(())
        })
    }

    // -- generated output ----------------------------------------------------

    pub fn output_get(&self, story_id: u64, kind: &str) -> Result<Option<CachedOutput>> {
        self.with(|conn| {
            let row = conn
                .query_row(
                    "SELECT markdown, provider, model, created_at, report
                     FROM outputs WHERE story_id = ?1 AND kind = ?2",
                    params![story_id as i64, kind],
                    |row| {
                        Ok(CachedOutput {
                            markdown: row.get(0)?,
                            provider: row.get(1)?,
                            model: row.get(2)?,
                            created_at: row.get(3)?,
                            report: row
                                .get::<_, Option<String>>(4)?
                                .and_then(|raw| serde_json::from_str(&raw).ok()),
                        })
                    },
                )
                .optional()?;
            Ok(row)
        })
    }

    pub fn output_put(
        &self,
        story_id: u64,
        kind: &str,
        markdown: &str,
        provider: &str,
        model: Option<&str>,
        report: Option<&serde_json::Value>,
    ) -> Result<()> {
        let report = report.map(|value| value.to_string());
        self.with(|conn| {
            conn.execute(
                "INSERT INTO outputs (story_id, kind, markdown, provider, model, created_at, report)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(story_id, kind) DO UPDATE SET
                   markdown = excluded.markdown, provider = excluded.provider,
                   model = excluded.model, created_at = excluded.created_at,
                   report = excluded.report",
                params![story_id as i64, kind, markdown, provider, model, now(), report],
            )?;
            Ok(())
        })
    }

    pub fn output_kinds(&self, story_id: u64) -> Result<Vec<String>> {
        self.with(|conn| {
            let mut stmt = conn.prepare("SELECT kind FROM outputs WHERE story_id = ?1")?;
            let rows = stmt.query_map(params![story_id as i64], |row| row.get(0))?;
            Ok(rows.filter_map(|row| row.ok()).collect())
        })
    }

    // -- chat ----------------------------------------------------------------

    pub fn chat_session(&self, chat_id: &str) -> Result<Option<String>> {
        self.with(|conn| {
            Ok(conn
                .query_row(
                    "SELECT session_id FROM chats WHERE id = ?1",
                    params![chat_id],
                    |row| row.get(0),
                )
                .optional()?)
        })
    }

    pub fn chat_set_session(&self, chat_id: &str, story_id: u64, session_id: &str) -> Result<()> {
        self.with(|conn| {
            conn.execute(
                "INSERT INTO chats (id, story_id, session_id, created_at) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id",
                params![chat_id, story_id as i64, session_id, now()],
            )?;
            Ok(())
        })
    }

    pub fn chat_append(&self, chat_id: &str, role: &str, content: &str) -> Result<i64> {
        self.with(|conn| {
            conn.execute(
                "INSERT INTO messages (chat_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4)",
                params![chat_id, role, content, now()],
            )?;
            Ok(conn.last_insert_rowid())
        })
    }

    pub fn chat_history(&self, chat_id: &str) -> Result<Vec<ChatMessage>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, chat_id, role, content, created_at FROM messages
                 WHERE chat_id = ?1 ORDER BY id ASC",
            )?;
            let rows = stmt.query_map(params![chat_id], |row| {
                Ok(ChatMessage {
                    id: row.get(0)?,
                    chat_id: row.get(1)?,
                    role: row.get(2)?,
                    content: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?;
            Ok(rows.filter_map(|row| row.ok()).collect())
        })
    }

    pub fn chat_clear(&self, chat_id: &str) -> Result<()> {
        self.with(|conn| {
            conn.execute("DELETE FROM messages WHERE chat_id = ?1", params![chat_id])?;
            conn.execute("DELETE FROM chats WHERE id = ?1", params![chat_id])?;
            Ok(())
        })
    }

    // -- library ---------------------------------------------------------------

    /// Index one piece of text for later recall. Called wherever something is
    /// cached, so the corpus builds itself as you read rather than needing you
    /// to file anything.
    pub fn library_put(
        &self,
        story_id: u64,
        title: &str,
        kind: &str,
        body: &str,
    ) -> Result<()> {
        if body.trim().is_empty() {
            return Ok(());
        }
        self.with(|conn| {
            // One row per story per kind, replaced on each write.
            conn.execute(
                "DELETE FROM library WHERE story_id = ?1 AND kind = ?2",
                params![story_id as i64, kind],
            )?;
            conn.execute(
                "INSERT INTO library (story_id, title, kind, body, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![story_id as i64, title, kind, body, now()],
            )?;
            Ok(())
        })
    }

    pub fn cache_rows(&self, bucket: &str) -> Result<Vec<(String, String)>> {
        self.with(|conn| {
            let mut stmt = conn.prepare("SELECT key, value FROM cache WHERE bucket = ?1")?;
            let rows = stmt.query_map(params![bucket], |row| Ok((row.get(0)?, row.get(1)?)))?;
            Ok(rows.filter_map(|row| row.ok()).collect())
        })
    }

    pub fn output_rows(&self) -> Result<Vec<(u64, String, String)>> {
        self.with(|conn| {
            let mut stmt = conn.prepare("SELECT story_id, kind, markdown FROM outputs")?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, i64>(0)? as u64, row.get(1)?, row.get(2)?))
            })?;
            Ok(rows.filter_map(|row| row.ok()).collect())
        })
    }

    /// Each conversation flattened into one searchable body.
    pub fn chat_rows(&self) -> Result<Vec<(String, String)>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT chat_id, group_concat(role || ': ' || content, char(10) || char(10))
                 FROM (SELECT chat_id, role, content FROM messages ORDER BY id ASC)
                 GROUP BY chat_id",
            )?;
            let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
            Ok(rows.filter_map(|row| row.ok()).collect())
        })
    }

    pub fn library_search(&self, query: &str, limit: usize) -> Result<Vec<LibraryHit>> {
        let trimmed = query.trim();
        if trimmed.len() < 2 {
            return Ok(Vec::new());
        }
        // FTS5 treats plenty of punctuation as syntax, so the query is quoted
        // and used as a phrase with a trailing prefix match on the last word.
        let escaped = trimmed.replace('"', "\"\"");
        let expression = format!("\"{escaped}\"*");

        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT story_id, title, kind, snippet(library, 3, '<b>', '</b>', '…', 18), created_at
                 FROM library
                 WHERE library MATCH ?1
                 ORDER BY bm25(library), created_at DESC
                 LIMIT ?2",
            )?;
            let rows = stmt.query_map(params![expression, limit as i64], |row| {
                Ok(LibraryHit {
                    story_id: row.get::<_, i64>(0)? as u64,
                    title: row.get(1)?,
                    kind: row.get(2)?,
                    snippet: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?;
            Ok(rows.filter_map(|row| row.ok()).collect())
        })
    }

    pub fn library_size(&self) -> Result<(usize, usize)> {
        self.with(|conn| {
            let entries: i64 = conn.query_row("SELECT count(*) FROM library", [], |r| r.get(0))?;
            let stories: i64 =
                conn.query_row("SELECT count(DISTINCT story_id) FROM library", [], |r| r.get(0))?;
            Ok((entries.max(0) as usize, stories.max(0) as usize))
        })
    }

    // -- reading history -------------------------------------------------------

    /// What you have opened, newest first, with the titles and generated output
    /// already on hand. The Library can only answer "find X" without this; this
    /// is what answers "what did I read this week".
    pub fn reading_history(&self, limit: usize) -> Result<Vec<HistoryEntry>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT r.story_id,
                        COALESCE((SELECT l.title FROM library l
                                  WHERE l.story_id = r.story_id AND l.kind = 'thread'), ''),
                        r.read_at,
                        r.comment_count,
                        COALESCE((SELECT group_concat(o.kind) FROM outputs o
                                  WHERE o.story_id = r.story_id), '')
                 FROM read_state r
                 ORDER BY r.read_at DESC
                 LIMIT ?1",
            )?;
            let rows = stmt.query_map(params![limit as i64], |row| {
                let kinds: String = row.get(4)?;
                Ok(HistoryEntry {
                    story_id: row.get::<_, i64>(0)? as u64,
                    title: row.get(1)?,
                    read_at: row.get(2)?,
                    comment_count: row.get::<_, i64>(3)?.max(0) as u32,
                    kinds: kinds
                        .split(',')
                        .filter(|k| !k.is_empty())
                        .map(str::to_string)
                        .collect(),
                })
            })?;
            Ok(rows.filter_map(|row| row.ok()).collect())
        })
    }

    // -- synthesis -------------------------------------------------------------

    pub fn synthesis_put(&self, title: &str, story_ids: &[u64], markdown: &str) -> Result<i64> {
        let ids = story_ids
            .iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        self.with(|conn| {
            conn.execute(
                "INSERT INTO syntheses (title, story_ids, markdown, created_at)
                 VALUES (?1, ?2, ?3, ?4)",
                params![title, ids, markdown, now()],
            )?;
            Ok(conn.last_insert_rowid())
        })
    }

    pub fn synthesis_list(&self) -> Result<Vec<Synthesis>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, title, story_ids, markdown, created_at
                 FROM syntheses ORDER BY created_at DESC LIMIT 50",
            )?;
            let rows = stmt.query_map([], |row| {
                let ids: String = row.get(2)?;
                Ok(Synthesis {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    story_ids: ids.split(',').filter_map(|i| i.parse().ok()).collect(),
                    markdown: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?;
            Ok(rows.filter_map(|row| row.ok()).collect())
        })
    }

    pub fn synthesis_delete(&self, id: i64) -> Result<()> {
        self.with(|conn| {
            conn.execute("DELETE FROM syntheses WHERE id = ?1", params![id])?;
            Ok(())
        })
    }

    // -- read state ----------------------------------------------------------

    /// Record a visit and report how many comments the thread had last time,
    /// so the reader can be told what arrived since. Returns `None` for a
    /// thread never opened before, which is different from "nothing new".
    pub fn visit(&self, story_id: u64, comment_count: u32) -> Result<Option<(u32, i64)>> {
        self.with(|conn| {
            let previous: Option<(i64, i64)> = conn
                .query_row(
                    "SELECT comment_count, read_at FROM read_state WHERE story_id = ?1",
                    params![story_id as i64],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()?;

            conn.execute(
                "INSERT INTO read_state (story_id, read_at, comment_count) VALUES (?1, ?2, ?3)
                 ON CONFLICT(story_id) DO UPDATE SET
                   read_at = excluded.read_at, comment_count = excluded.comment_count",
                params![story_id as i64, now(), comment_count as i64],
            )?;

            Ok(previous.map(|(count, read_at)| (count.max(0) as u32, read_at)))
        })
    }

    /// The most recently opened stories, with the comment count they had at the
    /// time, newest first.
    pub fn recent_reads(&self, limit: usize) -> Result<Vec<(u64, u32, i64)>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT story_id, comment_count, read_at FROM read_state
                 ORDER BY read_at DESC LIMIT ?1",
            )?;
            let rows = stmt.query_map(params![limit as i64], |row| {
                Ok((
                    row.get::<_, i64>(0)? as u64,
                    row.get::<_, i64>(1)?.max(0) as u32,
                    row.get::<_, i64>(2)?,
                ))
            })?;
            Ok(rows.filter_map(|row| row.ok()).collect())
        })
    }

    pub fn read_ids(&self) -> Result<Vec<u64>> {
        self.with(|conn| {
            let mut stmt = conn.prepare("SELECT story_id FROM read_state")?;
            let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
            Ok(rows.filter_map(|row| row.ok()).map(|id| id as u64).collect())
        })
    }

    // -- settings ------------------------------------------------------------

    pub fn setting_get(&self, key: &str) -> Result<Option<String>> {
        self.with(|conn| {
            Ok(conn
                .query_row(
                    "SELECT value FROM settings WHERE key = ?1",
                    params![key],
                    |row| row.get(0),
                )
                .optional()?)
        })
    }

    pub fn setting_set(&self, key: &str, value: &str) -> Result<()> {
        self.with(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )?;
            Ok(())
        })
    }

    pub fn settings_all(&self) -> Result<serde_json::Map<String, serde_json::Value>> {
        self.with(|conn| {
            let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
            let rows = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?;
            let mut map = serde_json::Map::new();
            for row in rows.flatten() {
                let value = serde_json::from_str(&row.1)
                    .unwrap_or_else(|_| serde_json::Value::String(row.1.clone()));
                map.insert(row.0, value);
            }
            Ok(map)
        })
    }
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS cache (
  bucket     TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (bucket, key)
);

CREATE TABLE IF NOT EXISTS outputs (
  story_id   INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  markdown   TEXT NOT NULL,
  provider   TEXT NOT NULL,
  model      TEXT,
  created_at INTEGER NOT NULL,
  report     TEXT,
  PRIMARY KEY (story_id, kind)
);

CREATE TABLE IF NOT EXISTS chats (
  id         TEXT PRIMARY KEY,
  story_id   INTEGER NOT NULL,
  session_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    TEXT NOT NULL,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_chat ON messages (chat_id, id);

CREATE TABLE IF NOT EXISTS read_state (
  story_id      INTEGER PRIMARY KEY,
  read_at       INTEGER NOT NULL,
  comment_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Everything you have read, searchable. `title` and `body` are indexed;
-- `story_id`, `kind` and `created_at` are carried along unindexed.
CREATE TABLE IF NOT EXISTS syntheses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  story_ids  TEXT NOT NULL,
  markdown   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS library USING fts5(
  story_id UNINDEXED,
  title,
  kind UNINDEXED,
  body,
  created_at UNINDEXED
);
"#;
