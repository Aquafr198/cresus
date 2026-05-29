use tokio_rusqlite::Connection;
use crate::models::WalletProfile;
use crate::DbError;

pub struct ProfileRepo;

impl ProfileRepo {
    pub async fn upsert(conn: &Connection, profile: WalletProfile) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO wallet_profiles (id, wallet_id, display_name, avatar_url, bio, twitter, telegram, website, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(wallet_id) DO UPDATE SET
                    display_name = excluded.display_name,
                    avatar_url = excluded.avatar_url,
                    bio = excluded.bio,
                    twitter = excluded.twitter,
                    telegram = excluded.telegram,
                    website = excluded.website,
                    updated_at = excluded.updated_at",
                rusqlite::params![
                    profile.id, profile.wallet_id, profile.display_name, profile.avatar_url,
                    profile.bio, profile.twitter, profile.telegram, profile.website,
                    profile.created_at, profile.updated_at,
                ],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn get_by_wallet(conn: &Connection, wallet_id: String) -> Result<Option<WalletProfile>, DbError> {
        let result = conn.call(move |c| {
            let r = c.query_row(
                "SELECT id, wallet_id, display_name, avatar_url, bio, twitter, telegram, website, created_at, updated_at
                 FROM wallet_profiles WHERE wallet_id = ?1",
                rusqlite::params![wallet_id],
                |row| Ok(WalletProfile {
                    id: row.get(0)?,
                    wallet_id: row.get(1)?,
                    display_name: row.get(2)?,
                    avatar_url: row.get(3)?,
                    bio: row.get(4)?,
                    twitter: row.get(5)?,
                    telegram: row.get(6)?,
                    website: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                }),
            );
            match r {
                Ok(v) => Ok(Some(v)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(tokio_rusqlite::Error::Rusqlite(e)),
            }
        }).await?;
        Ok(result)
    }

    pub async fn list_all(conn: &Connection) -> Result<Vec<WalletProfile>, DbError> {
        let result = conn.call(|c| {
            let mut stmt = c.prepare(
                "SELECT id, wallet_id, display_name, avatar_url, bio, twitter, telegram, website, created_at, updated_at
                 FROM wallet_profiles ORDER BY created_at DESC"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(WalletProfile {
                    id: row.get(0)?,
                    wallet_id: row.get(1)?,
                    display_name: row.get(2)?,
                    avatar_url: row.get(3)?,
                    bio: row.get(4)?,
                    twitter: row.get(5)?,
                    telegram: row.get(6)?,
                    website: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })?.collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        }).await?;
        Ok(result)
    }

    pub async fn delete_by_wallet(conn: &Connection, wallet_id: String) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute("DELETE FROM wallet_profiles WHERE wallet_id = ?1", rusqlite::params![wallet_id])?;
            Ok(())
        }).await?;
        Ok(())
    }
}
