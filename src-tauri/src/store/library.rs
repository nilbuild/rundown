use super::*;

impl Store {
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
}
