use super::*;

impl Store {
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
}
