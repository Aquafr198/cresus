use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

use cresus_core::meme::manager::MemeManager;

#[derive(Debug, Deserialize)]
pub struct CreateMetadataRequest {
    pub name: String,
    pub symbol: String,
    pub description: Option<String>,
    pub image_asset_id: Option<String>,
    pub extra_json: Option<String>,
}

/// POST /api/v1/meme-library/assets — Upload an image asset via multipart.
pub async fn upload_asset(
    State(mgr): State<MemeManager>,
    mut multipart: Multipart,
) -> Response {
    let mut filename = String::new();
    let mut mime_type = String::from("application/octet-stream");
    let mut data: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() == Some("file") {
            filename = field
                .file_name()
                .unwrap_or("upload")
                .to_string();
            if let Some(ct) = field.content_type() {
                mime_type = ct.to_string();
            }
            match field.bytes().await {
                Ok(bytes) => data = Some(bytes.to_vec()),
                Err(e) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({ "success": false, "error": e.to_string() })),
                    )
                        .into_response();
                }
            }
        }
    }

    let Some(data) = data else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": "No file field in multipart" })),
        )
            .into_response();
    };

    if data.len() > crate::validation::MAX_UPLOAD_SIZE {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({ "success": false, "error": format!("File exceeds maximum size of {} MB", crate::validation::MAX_UPLOAD_SIZE / 1024 / 1024) })),
        )
            .into_response();
    }

    match mgr.upload_asset(&filename, &mime_type, &data).await {
        Ok(asset) => Json(json!({ "success": true, "data": {
            "id": asset.id,
            "filename": asset.filename,
            "mime_type": asset.mime_type,
            "created_at": asset.created_at,
        }}))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// GET /api/v1/meme-library/assets — List all assets.
pub async fn list_assets(State(mgr): State<MemeManager>) -> Response {
    match mgr.list_assets().await {
        Ok(assets) => {
            let data: Vec<_> = assets
                .iter()
                .map(|a| {
                    json!({
                        "id": a.id,
                        "filename": a.filename,
                        "mime_type": a.mime_type,
                        "ipfs_cid": a.ipfs_cid,
                        "pinned_uri": a.pinned_uri,
                        "created_at": a.created_at,
                    })
                })
                .collect();
            Json(json!({ "success": true, "data": data })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// DELETE /api/v1/meme-library/assets/:id — Delete an asset.
pub async fn delete_asset(
    State(mgr): State<MemeManager>,
    Path(id): Path<String>,
) -> Response {
    match mgr.delete_asset(&id).await {
        Ok(deleted) => Json(json!({ "success": true, "data": deleted })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// POST /api/v1/meme-library/assets/:id/pin — Pin asset to IPFS.
pub async fn pin_asset(
    State(mgr): State<MemeManager>,
    Path(id): Path<String>,
) -> Response {
    match mgr.pin_to_ipfs(&id).await {
        Ok(asset) => Json(json!({ "success": true, "data": {
            "id": asset.id,
            "ipfs_cid": asset.ipfs_cid,
            "pinned_uri": asset.pinned_uri,
        }}))
        .into_response(),
        Err(e) => {
            let status = match &e {
                cresus_core::meme::manager::MemeError::AssetNotFound => StatusCode::NOT_FOUND,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            };
            (status, Json(json!({ "success": false, "error": e.to_string() }))).into_response()
        }
    }
}

/// GET /api/v1/meme-library/assets/:id/serve — Serve the raw asset file.
pub async fn serve_asset(
    State(mgr): State<MemeManager>,
    Path(id): Path<String>,
) -> Response {
    match mgr.read_asset_bytes(&id).await {
        Ok((data, mime)) => {
            let headers = [(axum::http::header::CONTENT_TYPE, mime)];
            (headers, data).into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

/// POST /api/v1/meme-library/metadata — Create a metadata template.
pub async fn create_metadata(
    State(mgr): State<MemeManager>,
    Json(body): Json<CreateMetadataRequest>,
) -> Response {
    match mgr
        .create_metadata(
            &body.name,
            &body.symbol,
            body.description.as_deref(),
            body.image_asset_id.as_deref(),
            body.extra_json.as_deref(),
        )
        .await
    {
        Ok(meta) => Json(json!({ "success": true, "data": {
            "id": meta.id,
            "name": meta.name,
            "symbol": meta.symbol,
            "description": meta.description,
            "image_asset_id": meta.image_asset_id,
            "created_at": meta.created_at,
        }}))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// GET /api/v1/meme-library/metadata — List all metadata templates.
pub async fn list_metadata(State(mgr): State<MemeManager>) -> Response {
    match mgr.list_metadata().await {
        Ok(metas) => {
            let data: Vec<_> = metas
                .iter()
                .map(|m| {
                    json!({
                        "id": m.id,
                        "name": m.name,
                        "symbol": m.symbol,
                        "description": m.description,
                        "image_asset_id": m.image_asset_id,
                        "extra_json": m.extra_json,
                        "created_at": m.created_at,
                    })
                })
                .collect();
            Json(json!({ "success": true, "data": data })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// DELETE /api/v1/meme-library/metadata/:id — Delete a metadata template.
pub async fn delete_metadata(
    State(mgr): State<MemeManager>,
    Path(id): Path<String>,
) -> Response {
    match mgr.delete_metadata(&id).await {
        Ok(deleted) => Json(json!({ "success": true, "data": deleted })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// GET /api/v1/meme-library/metadata/:id/json — Generate Metaplex-compatible JSON.
pub async fn generate_metadata_json(
    State(mgr): State<MemeManager>,
    Path(id): Path<String>,
) -> Response {
    match mgr.generate_token_metadata_json(&id).await {
        Ok(json_val) => Json(json!({ "success": true, "data": json_val })).into_response(),
        Err(e) => {
            let status = match &e {
                cresus_core::meme::manager::MemeError::MetadataNotFound => StatusCode::NOT_FOUND,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            };
            (status, Json(json!({ "success": false, "error": e.to_string() }))).into_response()
        }
    }
}

/// POST /api/v1/meme-library/metadata/:id/pin — Pin metadata JSON to IPFS.
pub async fn pin_metadata_json(
    State(mgr): State<MemeManager>,
    Path(id): Path<String>,
) -> Response {
    let json_val = match mgr.generate_token_metadata_json(&id).await {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "success": false, "error": e.to_string() })),
            )
                .into_response();
        }
    };

    let meta = match mgr.get_metadata(&id).await {
        Ok(m) => m,
        Err(e) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "success": false, "error": e.to_string() })),
            )
                .into_response();
        }
    };

    match mgr.pinning().pin_json_to_ipfs(&meta.name, &json_val).await {
        Ok((cid, uri)) => Json(json!({ "success": true, "data": {
            "cid": cid,
            "uri": uri,
        }}))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}
