use tokio_rusqlite::Connection;
use crate::models::{Wallet, WalletGroup};
use crate::DbError;

pub struct WalletRepo;

trait OptionalRow<T> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error>;
}

impl<T> OptionalRow<T> for Result<T, rusqlite::Error> {
    fn optional(self) -> Result<Option<T>, rusqlite::Error> {
        match self {
            Ok(v) => Ok(Some(v)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}

impl WalletRepo {
    pub async fn create(conn: &Connection, wallet: Wallet) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO wallets (id, name, public_key, encrypted_secret, nonce, group_id, parent_id, derivation_index, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    wallet.id, wallet.name, wallet.public_key,
                    wallet.encrypted_secret, wallet.nonce,
                    wallet.group_id, wallet.parent_id,
                    wallet.derivation_index, wallet.created_at,
                ],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    /// Hard cap on the number of wallet rows returned per request. The
    /// vault is single-tenant per install and most users will have at
    /// most a few hundred wallets, so 10_000 is well above realistic
    /// limits but bounds the worst-case memory + network for any list
    /// endpoint. If a future deployment hits this ceiling, refactor the
    /// caller to use pagination (`list_paginated`).
    const LIST_ALL_LIMIT: i64 = 10_000;

    pub async fn list_all(conn: &Connection) -> Result<Vec<Wallet>, DbError> {
        let wallets = conn.call(|c| {
            let mut stmt = c.prepare(
                "SELECT id, name, public_key, encrypted_secret, nonce, group_id, parent_id, derivation_index, created_at
                 FROM wallets ORDER BY created_at DESC LIMIT ?1"
            )?;
            let rows = stmt.query_map(rusqlite::params![Self::LIST_ALL_LIMIT], |row| {
                Ok(Wallet {
                    id: row.get(0)?, name: row.get(1)?, public_key: row.get(2)?,
                    encrypted_secret: row.get(3)?, nonce: row.get(4)?,
                    group_id: row.get(5)?, parent_id: row.get(6)?,
                    derivation_index: row.get(7)?, created_at: row.get(8)?,
                })
            })?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        }).await?;
        if wallets.len() as i64 >= Self::LIST_ALL_LIMIT {
            tracing::warn!(
                limit = Self::LIST_ALL_LIMIT,
                "WalletRepo::list_all saturated the row cap — consider paginating callers"
            );
        }
        Ok(wallets)
    }

    /// Wallets associated with a specific launch: the creator wallet itself
    /// plus every sub-wallet derived from it (parent_id = creator). Used by
    /// the launch dashboard endpoint to bound the per-poll RPC budget — on
    /// a vault with 100 wallets but only 5 in this launch's set, this trims
    /// the parallel `getBalance` fan-out by 20×.
    pub async fn list_by_creator(
        conn: &Connection,
        creator_id: String,
    ) -> Result<Vec<Wallet>, DbError> {
        let wallets = conn.call(move |c| {
            let mut stmt = c.prepare(
                "SELECT id, name, public_key, encrypted_secret, nonce, group_id, parent_id, derivation_index, created_at
                 FROM wallets WHERE id = ?1 OR parent_id = ?1
                 ORDER BY created_at DESC"
            )?;
            let rows = stmt.query_map([&creator_id], |row| {
                Ok(Wallet {
                    id: row.get(0)?, name: row.get(1)?, public_key: row.get(2)?,
                    encrypted_secret: row.get(3)?, nonce: row.get(4)?,
                    group_id: row.get(5)?, parent_id: row.get(6)?,
                    derivation_index: row.get(7)?, created_at: row.get(8)?,
                })
            })?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        }).await?;
        Ok(wallets)
    }

    pub async fn get_by_id(conn: &Connection, id: String) -> Result<Option<Wallet>, DbError> {
        let result = conn.call(move |c| {
            let r = c.query_row(
                "SELECT id, name, public_key, encrypted_secret, nonce, group_id, parent_id, derivation_index, created_at
                 FROM wallets WHERE id = ?1",
                rusqlite::params![id],
                |row| Ok(Wallet {
                    id: row.get(0)?, name: row.get(1)?, public_key: row.get(2)?,
                    encrypted_secret: row.get(3)?, nonce: row.get(4)?,
                    group_id: row.get(5)?, parent_id: row.get(6)?,
                    derivation_index: row.get(7)?, created_at: row.get(8)?,
                }),
            ).optional()?;
            Ok(r)
        }).await?;
        Ok(result)
    }

    pub async fn delete(conn: &Connection, id: String) -> Result<bool, DbError> {
        let n = conn.call(move |c| {
            Ok(c.execute("DELETE FROM wallets WHERE id = ?1", rusqlite::params![id])?)
        }).await?;
        Ok(n > 0)
    }

    pub async fn create_group(conn: &Connection, group: WalletGroup) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO wallet_groups (id, name, created_at) VALUES (?1, ?2, ?3)",
                rusqlite::params![group.id, group.name, group.created_at],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn list_groups(conn: &Connection) -> Result<Vec<WalletGroup>, DbError> {
        let groups = conn.call(|c| {
            let mut stmt = c.prepare("SELECT id, name, created_at FROM wallet_groups ORDER BY created_at DESC")?;
            let rows = stmt.query_map([], |row| {
                Ok(WalletGroup { id: row.get(0)?, name: row.get(1)?, created_at: row.get(2)? })
            })?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        }).await?;
        Ok(groups)
    }
}
