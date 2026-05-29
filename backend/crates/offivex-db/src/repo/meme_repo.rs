use tokio_rusqlite::Connection;
use crate::models::{MemeAsset, MemeMetadata};
use crate::DbError;

pub struct MemeRepo;

impl MemeRepo {
    // ── Asset CRUD ──

    pub async fn create_asset(conn: &Connection, asset: MemeAsset) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO meme_assets (id, filename, mime_type, local_path, ipfs_cid, arweave_id, pinned_uri, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    asset.id, asset.filename, asset.mime_type, asset.local_path,
                    asset.ipfs_cid, asset.arweave_id, asset.pinned_uri, asset.created_at,
                ],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn get_asset(conn: &Connection, id: String) -> Result<Option<MemeAsset>, DbError> {
        let asset = conn.call(move |c| {
            let mut stmt = c.prepare(
                "SELECT id, filename, mime_type, local_path, ipfs_cid, arweave_id, pinned_uri, created_at
                 FROM meme_assets WHERE id = ?1"
            )?;
            let mut rows = stmt.query_map(rusqlite::params![id], |row| {
                Ok(MemeAsset {
                    id: row.get(0)?, filename: row.get(1)?, mime_type: row.get(2)?,
                    local_path: row.get(3)?, ipfs_cid: row.get(4)?, arweave_id: row.get(5)?,
                    pinned_uri: row.get(6)?, created_at: row.get(7)?,
                })
            })?;
            Ok(rows.next().transpose()?)
        }).await?;
        Ok(asset)
    }

    pub async fn list_assets(conn: &Connection) -> Result<Vec<MemeAsset>, DbError> {
        let assets = conn.call(|c| {
            let mut stmt = c.prepare(
                "SELECT id, filename, mime_type, local_path, ipfs_cid, arweave_id, pinned_uri, created_at
                 FROM meme_assets ORDER BY created_at DESC"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(MemeAsset {
                    id: row.get(0)?, filename: row.get(1)?, mime_type: row.get(2)?,
                    local_path: row.get(3)?, ipfs_cid: row.get(4)?, arweave_id: row.get(5)?,
                    pinned_uri: row.get(6)?, created_at: row.get(7)?,
                })
            })?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        }).await?;
        Ok(assets)
    }

    pub async fn delete_asset(conn: &Connection, id: String) -> Result<bool, DbError> {
        let rows = conn.call(move |c| {
            let count = c.execute("DELETE FROM meme_assets WHERE id = ?1", rusqlite::params![id])?;
            Ok(count)
        }).await?;
        Ok(rows > 0)
    }

    pub async fn update_pinning(
        conn: &Connection,
        id: String,
        ipfs_cid: Option<String>,
        arweave_id: Option<String>,
        pinned_uri: Option<String>,
    ) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "UPDATE meme_assets SET ipfs_cid = ?1, arweave_id = ?2, pinned_uri = ?3 WHERE id = ?4",
                rusqlite::params![ipfs_cid, arweave_id, pinned_uri, id],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    // ── Metadata CRUD ──

    pub async fn create_metadata(conn: &Connection, meta: MemeMetadata) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO meme_metadata (id, name, symbol, description, image_asset_id, extra_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    meta.id, meta.name, meta.symbol, meta.description,
                    meta.image_asset_id, meta.extra_json, meta.created_at,
                ],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn get_metadata(conn: &Connection, id: String) -> Result<Option<MemeMetadata>, DbError> {
        let meta = conn.call(move |c| {
            let mut stmt = c.prepare(
                "SELECT id, name, symbol, description, image_asset_id, extra_json, created_at
                 FROM meme_metadata WHERE id = ?1"
            )?;
            let mut rows = stmt.query_map(rusqlite::params![id], |row| {
                Ok(MemeMetadata {
                    id: row.get(0)?, name: row.get(1)?, symbol: row.get(2)?,
                    description: row.get(3)?, image_asset_id: row.get(4)?,
                    extra_json: row.get(5)?, created_at: row.get(6)?,
                })
            })?;
            Ok(rows.next().transpose()?)
        }).await?;
        Ok(meta)
    }

    pub async fn list_metadata(conn: &Connection) -> Result<Vec<MemeMetadata>, DbError> {
        let metas = conn.call(|c| {
            let mut stmt = c.prepare(
                "SELECT id, name, symbol, description, image_asset_id, extra_json, created_at
                 FROM meme_metadata ORDER BY created_at DESC"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(MemeMetadata {
                    id: row.get(0)?, name: row.get(1)?, symbol: row.get(2)?,
                    description: row.get(3)?, image_asset_id: row.get(4)?,
                    extra_json: row.get(5)?, created_at: row.get(6)?,
                })
            })?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        }).await?;
        Ok(metas)
    }

    pub async fn delete_metadata(conn: &Connection, id: String) -> Result<bool, DbError> {
        let rows = conn.call(move |c| {
            let count = c.execute("DELETE FROM meme_metadata WHERE id = ?1", rusqlite::params![id])?;
            Ok(count)
        }).await?;
        Ok(rows > 0)
    }
}
