use super::*;

impl Store {
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
