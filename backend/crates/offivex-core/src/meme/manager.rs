use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio_rusqlite::Connection;

use offivex_db::models::{MemeAsset, MemeMetadata};
use offivex_db::repo::meme_repo::MemeRepo;
use offivex_db::DbError;

use super::pinning::{PinningService, PinningError};

#[derive(Debug, thiserror::Error)]
pub enum MemeError {
    #[error("Database error: {0}")]
    Db(#[from] DbError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Pinning error: {0}")]
    Pinning(#[from] PinningError),
    #[error("Asset not found")]
    AssetNotFound,
    #[error("Metadata not found")]
    MetadataNotFound,
    #[error("{0}")]
    Other(String),
}

/// Manages meme assets (images) and metadata templates.
#[derive(Clone)]
pub struct MemeManager {
    db: Arc<Connection>,
    assets_dir: PathBuf,
    pinning: PinningService,
}

impl MemeManager {
    pub fn new(db: Arc<Connection>, assets_dir: PathBuf, pinning: PinningService) -> Self {
        Self { db, assets_dir, pinning }
    }

    pub fn pinning(&self) -> &PinningService {
        &self.pinning
    }

    /// Ensure the assets directory exists.
    pub async fn init(&self) -> Result<(), MemeError> {
        tokio::fs::create_dir_all(&self.assets_dir).await?;
        Ok(())
    }

    /// Save an uploaded file to local storage and record it in the DB.
    pub async fn upload_asset(
        &self,
        filename: &str,
        mime_type: &str,
        data: &[u8],
    ) -> Result<MemeAsset, MemeError> {
        let id = uuid::Uuid::new_v4().to_string();
        let safe_name = format!("{}_{}", &id[..8], sanitize_filename(filename));
        let local_path = self.assets_dir.join(&safe_name);

        tokio::fs::write(&local_path, data).await?;

        let asset = MemeAsset {
            id,
            filename: filename.to_string(),
            mime_type: mime_type.to_string(),
            local_path: local_path.to_string_lossy().to_string(),
            ipfs_cid: None,
            arweave_id: None,
            pinned_uri: None,
            created_at: chrono::Utc::now().timestamp(),
        };

        MemeRepo::create_asset(&self.db, asset.clone()).await?;
        Ok(asset)
    }

    /// Pin an asset to IPFS via Pinata.
    pub async fn pin_to_ipfs(&self, asset_id: &str) -> Result<MemeAsset, MemeError> {
        let asset = MemeRepo::get_asset(&self.db, asset_id.to_string())
            .await?
            .ok_or(MemeError::AssetNotFound)?;

        let file_data = tokio::fs::read(&asset.local_path).await?;
        let (cid, uri) = self.pinning.pin_to_ipfs(&asset.filename, &file_data).await?;

        MemeRepo::update_pinning(
            &self.db,
            asset_id.to_string(),
            Some(cid.clone()),
            asset.arweave_id.clone(),
            Some(uri.clone()),
        ).await?;

        Ok(MemeAsset {
            ipfs_cid: Some(cid),
            pinned_uri: Some(uri),
            ..asset
        })
    }

    /// Get a single asset by ID.
    pub async fn get_asset(&self, id: &str) -> Result<MemeAsset, MemeError> {
        MemeRepo::get_asset(&self.db, id.to_string())
            .await?
            .ok_or(MemeError::AssetNotFound)
    }

    /// List all assets.
    pub async fn list_assets(&self) -> Result<Vec<MemeAsset>, MemeError> {
        Ok(MemeRepo::list_assets(&self.db).await?)
    }

    /// Delete an asset (removes file + DB record).
    pub async fn delete_asset(&self, id: &str) -> Result<bool, MemeError> {
        if let Some(asset) = MemeRepo::get_asset(&self.db, id.to_string()).await? {
            let path = Path::new(&asset.local_path);
            if path.exists() {
                tokio::fs::remove_file(path).await.ok();
            }
        }
        Ok(MemeRepo::delete_asset(&self.db, id.to_string()).await?)
    }

    /// Read the raw bytes of an asset (for serving).
    pub async fn read_asset_bytes(&self, id: &str) -> Result<(Vec<u8>, String), MemeError> {
        let asset = self.get_asset(id).await?;
        let data = tokio::fs::read(&asset.local_path).await?;
        Ok((data, asset.mime_type))
    }

    // ── Metadata templates ──

    /// Create a metadata template.
    pub async fn create_metadata(
        &self,
        name: &str,
        symbol: &str,
        description: Option<&str>,
        image_asset_id: Option<&str>,
        extra_json: Option<&str>,
    ) -> Result<MemeMetadata, MemeError> {
        let meta = MemeMetadata {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.to_string(),
            symbol: symbol.to_string(),
            description: description.map(|s| s.to_string()),
            image_asset_id: image_asset_id.map(|s| s.to_string()),
            extra_json: extra_json.map(|s| s.to_string()),
            created_at: chrono::Utc::now().timestamp(),
        };
        MemeRepo::create_metadata(&self.db, meta.clone()).await?;
        Ok(meta)
    }

    /// List all metadata templates.
    pub async fn list_metadata(&self) -> Result<Vec<MemeMetadata>, MemeError> {
        Ok(MemeRepo::list_metadata(&self.db).await?)
    }

    /// Get a single metadata template.
    pub async fn get_metadata(&self, id: &str) -> Result<MemeMetadata, MemeError> {
        MemeRepo::get_metadata(&self.db, id.to_string())
            .await?
            .ok_or(MemeError::MetadataNotFound)
    }

    /// Delete a metadata template.
    pub async fn delete_metadata(&self, id: &str) -> Result<bool, MemeError> {
        Ok(MemeRepo::delete_metadata(&self.db, id.to_string()).await?)
    }

    /// Generate a Metaplex-compatible JSON metadata object from a template.
    pub async fn generate_token_metadata_json(&self, metadata_id: &str) -> Result<serde_json::Value, MemeError> {
        let meta = self.get_metadata(metadata_id).await?;

        let image_uri = if let Some(ref asset_id) = meta.image_asset_id {
            let asset = self.get_asset(asset_id).await?;
            asset.pinned_uri.unwrap_or_default()
        } else {
            String::new()
        };

        let mut json = serde_json::json!({
            "name": meta.name,
            "symbol": meta.symbol,
            "description": meta.description.unwrap_or_default(),
            "image": image_uri,
            "properties": {
                "files": [{
                    "uri": image_uri,
                    "type": "image/png"
                }],
                "category": "image"
            }
        });

        // Merge extra_json if present
        if let Some(extra) = &meta.extra_json {
            if let Ok(extra_val) = serde_json::from_str::<serde_json::Value>(extra) {
                if let Some(obj) = extra_val.as_object() {
                    for (k, v) in obj {
                        json[k] = v.clone();
                    }
                }
            }
        }

        Ok(json)
    }
}

/// Sanitize a filename to remove path separators and other unsafe chars.
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect()
}
