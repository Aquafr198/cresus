use tokio_rusqlite::Connection;
use crate::DbError;

pub struct ConfigRepo;

impl ConfigRepo {
    pub async fn get(conn: &Connection, key: &str) -> Result<Option<String>, DbError> {
        let key = key.to_string();
        let result = conn
            .call(move |c| {
                let r = c.query_row(
                    "SELECT value FROM app_config WHERE key = ?1",
                    rusqlite::params![key],
                    |row| row.get::<_, String>(0),
                );
                match r {
                    Ok(v) => Ok(Some(v)),
                    Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                    Err(e) => Err(tokio_rusqlite::Error::Rusqlite(e)),
                }
            })
            .await?;
        Ok(result)
    }

    pub async fn set(conn: &Connection, key: &str, value: &str) -> Result<(), DbError> {
        let key = key.to_string();
        let value = value.to_string();
        conn.call(move |c| {
            c.execute(
                "INSERT INTO app_config (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                rusqlite::params![key, value],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }
}
