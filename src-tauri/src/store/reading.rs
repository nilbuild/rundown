use super::*;

impl Store {
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
}
