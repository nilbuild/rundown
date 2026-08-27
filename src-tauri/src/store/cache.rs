use super::*;

impl Store {
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
}
