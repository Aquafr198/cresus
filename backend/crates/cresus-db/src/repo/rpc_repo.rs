use tokio_rusqlite::Connection;
use crate::models::RpcEndpoint;
use crate::DbError;

pub struct RpcRepo;

impl RpcRepo {
    pub async fn create(conn: &Connection, ep: RpcEndpoint) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO rpc_endpoints (id, name, url, ws_url, weight, is_active, last_latency_ms, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    ep.id, ep.name, ep.url, ep.ws_url,
                    ep.weight, ep.is_active, ep.last_latency_ms, ep.created_at,
                ],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn list_all(conn: &Connection) -> Result<Vec<RpcEndpoint>, DbError> {
        let endpoints = conn
            .call(|c| {
                let mut stmt = c.prepare(
                    "SELECT id, name, url, ws_url, weight, is_active, last_latency_ms, created_at
                     FROM rpc_endpoints ORDER BY weight DESC",
                )?;
                let rows = stmt.query_map([], |row| {
                    Ok(RpcEndpoint {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        url: row.get(2)?,
                        ws_url: row.get(3)?,
                        weight: row.get(4)?,
                        is_active: row.get(5)?,
                        last_latency_ms: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                })?;
                Ok(rows.collect::<Result<Vec<_>, _>>()?)
            })
            .await?;
        Ok(endpoints)
    }

    pub async fn list_active(conn: &Connection) -> Result<Vec<RpcEndpoint>, DbError> {
        let endpoints = conn
            .call(|c| {
                let mut stmt = c.prepare(
                    "SELECT id, name, url, ws_url, weight, is_active, last_latency_ms, created_at
                     FROM rpc_endpoints WHERE is_active = 1 ORDER BY weight DESC",
                )?;
                let rows = stmt.query_map([], |row| {
                    Ok(RpcEndpoint {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        url: row.get(2)?,
                        ws_url: row.get(3)?,
                        weight: row.get(4)?,
                        is_active: row.get(5)?,
                        last_latency_ms: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                })?;
                Ok(rows.collect::<Result<Vec<_>, _>>()?)
            })
            .await?;
        Ok(endpoints)
    }

    pub async fn delete(conn: &Connection, id: String) -> Result<bool, DbError> {
        let n = conn
            .call(move |c| {
                Ok(c.execute(
                    "DELETE FROM rpc_endpoints WHERE id = ?1",
                    rusqlite::params![id],
                )?)
            })
            .await?;
        Ok(n > 0)
    }

    pub async fn update_latency(
        conn: &Connection,
        id: String,
        latency_ms: i64,
    ) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "UPDATE rpc_endpoints SET last_latency_ms = ?1 WHERE id = ?2",
                rusqlite::params![latency_ms, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn set_active(
        conn: &Connection,
        id: String,
        active: bool,
    ) -> Result<(), DbError> {
        let val: i64 = if active { 1 } else { 0 };
        conn.call(move |c| {
            c.execute(
                "UPDATE rpc_endpoints SET is_active = ?1 WHERE id = ?2",
                rusqlite::params![val, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }
}
