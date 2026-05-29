use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tokio_rusqlite::Connection;

use offivex_core::profile::randomizer;
use offivex_db::models::WalletProfile;
use offivex_db::repo::profile_repo::ProfileRepo;

/// Shared state for profile handlers.
#[derive(Clone)]
pub struct ProfileState {
    pub db: Arc<Connection>,
}

#[derive(Debug, Deserialize)]
pub struct AssignProfileRequest {
    pub wallet_id: String,
}

#[derive(Debug, Deserialize)]
pub struct BatchAssignRequest {
    pub wallet_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub twitter: Option<String>,
    pub telegram: Option<String>,
    pub website: Option<String>,
}

fn profile_to_json(p: &WalletProfile) -> serde_json::Value {
    json!({
        "id": p.id,
        "wallet_id": p.wallet_id,
        "display_name": p.display_name,
        "avatar_url": p.avatar_url,
        "bio": p.bio,
        "twitter": p.twitter,
        "telegram": p.telegram,
        "website": p.website,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    })
}

/// GET /api/v1/profiles — List all wallet profiles.
pub async fn list_profiles(State(state): State<ProfileState>) -> Response {
    match ProfileRepo::list_all(&state.db).await {
        Ok(profiles) => {
            let data: Vec<_> = profiles.iter().map(profile_to_json).collect();
            Json(json!({ "success": true, "data": data })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        ).into_response(),
    }
}

/// GET /api/v1/profiles/:wallet_id — Get profile for a wallet.
pub async fn get_profile(
    State(state): State<ProfileState>,
    Path(wallet_id): Path<String>,
) -> Response {
    match ProfileRepo::get_by_wallet(&state.db, wallet_id.clone()).await {
        Ok(Some(p)) => Json(json!({ "success": true, "data": profile_to_json(&p) })).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "success": false, "error": "No profile for this wallet" })),
        ).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        ).into_response(),
    }
}

/// POST /api/v1/profiles/randomize — Assign a random profile to a wallet.
pub async fn randomize_profile(
    State(state): State<ProfileState>,
    Json(body): Json<AssignProfileRequest>,
) -> Response {
    match randomizer::assign_random_profile(&state.db, &body.wallet_id).await {
        Ok(p) => Json(json!({ "success": true, "data": profile_to_json(&p) })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        ).into_response(),
    }
}

/// POST /api/v1/profiles/randomize-batch — Assign random profiles to multiple wallets.
pub async fn randomize_batch(
    State(state): State<ProfileState>,
    Json(body): Json<BatchAssignRequest>,
) -> Response {
    match randomizer::assign_batch_profiles(&state.db, &body.wallet_ids).await {
        Ok(profiles) => {
            let data: Vec<_> = profiles.iter().map(profile_to_json).collect();
            Json(json!({ "success": true, "data": data })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        ).into_response(),
    }
}

/// PUT /api/v1/profiles/:wallet_id — Manually update a wallet profile.
pub async fn update_profile(
    State(state): State<ProfileState>,
    Path(wallet_id): Path<String>,
    Json(body): Json<UpdateProfileRequest>,
) -> Response {
    // Get existing profile or create new
    let existing = ProfileRepo::get_by_wallet(&state.db, wallet_id.clone()).await;
    let now = chrono::Utc::now().timestamp();

    let profile = match existing {
        Ok(Some(mut p)) => {
            if let Some(name) = body.display_name { p.display_name = Some(name); }
            if let Some(url) = body.avatar_url { p.avatar_url = Some(url); }
            if let Some(bio) = body.bio { p.bio = Some(bio); }
            if let Some(twitter) = body.twitter { p.twitter = Some(twitter); }
            if let Some(telegram) = body.telegram { p.telegram = Some(telegram); }
            if let Some(website) = body.website { p.website = Some(website); }
            p.updated_at = now;
            p
        }
        _ => WalletProfile {
            id: uuid::Uuid::new_v4().to_string(),
            wallet_id: wallet_id.clone(),
            display_name: body.display_name,
            avatar_url: body.avatar_url,
            bio: body.bio,
            twitter: body.twitter,
            telegram: body.telegram,
            website: body.website,
            created_at: now,
            updated_at: now,
        },
    };

    match ProfileRepo::upsert(&state.db, profile.clone()).await {
        Ok(()) => Json(json!({ "success": true, "data": profile_to_json(&profile) })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        ).into_response(),
    }
}

/// DELETE /api/v1/profiles/:wallet_id — Delete a wallet profile.
pub async fn delete_profile(
    State(state): State<ProfileState>,
    Path(wallet_id): Path<String>,
) -> Response {
    match ProfileRepo::delete_by_wallet(&state.db, wallet_id).await {
        Ok(()) => Json(json!({ "success": true, "data": true })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "success": false, "error": e.to_string() })),
        ).into_response(),
    }
}

/// GET /api/v1/profiles/preview — Generate a preview random profile (not saved).
pub async fn preview_random() -> Response {
    let generated = randomizer::generate_random_profile();
    Json(json!({
        "success": true,
        "data": generated,
    }))
    .into_response()
}
