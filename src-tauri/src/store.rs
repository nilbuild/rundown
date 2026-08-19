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
"#;
