use tokio_rusqlite::Connection;
use crate::models::Admin;
use crate::DbError;

pub struct AdminRepo;

impl AdminRepo {
    pub async fn create(
        conn: &Connection,
        id: &str,
        username: &str,
        password_hash: &str,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        let username = username.to_string();
        let password_hash = password_hash.to_string();
        conn.call(move |c| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            c.execute(
                "INSERT INTO admins (id, username, password_hash, created_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![id, username, password_hash, now],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn find_by_username(
        conn: &Connection,
        username: &str,
    ) -> Result<Option<Admin>, DbError> {
        let username = username.to_string();
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(
                        "SELECT id, username, password_hash, created_at, last_login_at
                         FROM admins WHERE username = ?1",
                        rusqlite::params![username],
                        |r| {
                            Ok(Admin {
                                id: r.get(0)?,
                                username: r.get(1)?,
                                password_hash: r.get(2)?,
                                created_at: r.get(3)?,
                                last_login_at: r.get(4)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    pub async fn find_by_id(
        conn: &Connection,
        id: &str,
    ) -> Result<Option<Admin>, DbError> {
        let id = id.to_string();
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(
                        "SELECT id, username, password_hash, created_at, last_login_at
                         FROM admins WHERE id = ?1",
                        rusqlite::params![id],
                        |r| {
                            Ok(Admin {
                                id: r.get(0)?,
                                username: r.get(1)?,
                                password_hash: r.get(2)?,
                                created_at: r.get(3)?,
                                last_login_at: r.get(4)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    pub async fn update_last_login(conn: &Connection, id: &str) -> Result<(), DbError> {
        let id = id.to_string();
        conn.call(move |c| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64;
            c.execute(
                "UPDATE admins SET last_login_at = ?1 WHERE id = ?2",
                rusqlite::params![now, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn count(conn: &Connection) -> Result<i64, DbError> {
        let result = conn
            .call(|c| {
                let n: i64 =
                    c.query_row("SELECT COUNT(*) FROM admins", [], |r| r.get(0))?;
                Ok(n)
            })
            .await?;
        Ok(result)
    }

    pub async fn list(conn: &Connection) -> Result<Vec<Admin>, DbError> {
        let result = conn
            .call(|c| {
                let mut stmt = c.prepare(
                    "SELECT id, username, password_hash, created_at, last_login_at
                     FROM admins ORDER BY created_at ASC",
                )?;
                let rows = stmt
                    .query_map([], |r| {
                        Ok(Admin {
                            id: r.get(0)?,
                            username: r.get(1)?,
                            password_hash: r.get(2)?,
                            created_at: r.get(3)?,
                            last_login_at: r.get(4)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }
}
