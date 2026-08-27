use super::*;

impl Store {
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
}
