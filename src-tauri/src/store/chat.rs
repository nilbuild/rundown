use super::*;

impl Store {
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
}
