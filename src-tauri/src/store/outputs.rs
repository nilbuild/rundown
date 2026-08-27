use super::*;

impl Store {
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
}
