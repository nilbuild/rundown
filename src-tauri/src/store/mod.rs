//! Local persistence: network cache, chat history, settings.

mod cache;
mod outputs;
mod chat;
mod library;
mod history;
mod synthesis;
mod reading;
mod settings;

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Store {
    conn: Mutex<Connection>,
}

pub fn data_dir() -> PathBuf {
    let root = dirs::data_dir().unwrap_or_else(std::env::temp_dir);
    let dir = root.join("rundown");
    if !dir.exists() {
        adopt_sift(&root, &dir);
    }
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// The app was called Sift until it was renamed. Everything the reader has —
/// cached threads, generated output, chats, presets, the library index — lives
/// in one directory beside one database, so the rename carries them across
/// instead of starting empty next to them.
///
/// The write-ahead log matters here: SQLite keeps uncheckpointed pages in the
/// `-wal` sidecar, and moving the database without it discards every write
/// since the last checkpoint. On a machine that has been reading all day that
/// is most of the session.
fn adopt_sift(root: &std::path::Path, dir: &PathBuf) {
    let old = root.join("sift");
    if !old.is_dir() {
        return;
    }
    if std::fs::rename(&old, dir).is_err() {
        return;
    }
    for suffix in ["", "-wal", "-shm"] {
        let from = dir.join(format!("sift.sqlite3{suffix}"));
        if from.exists() {
            let _ = std::fs::rename(from, dir.join(format!("rundown.sqlite3{suffix}")));
        }
    }
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
        let path = data_dir().join("rundown.sqlite3");
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
