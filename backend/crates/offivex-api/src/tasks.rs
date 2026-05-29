//! Launch task templates — Mint Task / Bundle Task / Pump-Fun Task.
//!
//! Closes the Kinesis "Mint Task / Pump Task préparables" gap: the user
//! configures a launch (image + name + symbol + snipe set + slippage…)
//! at one moment, saves it as a Task, then re-executes the saved config
//! later with a single click (typically right at the announcement time).
//!
//! Storage model: re-uses the existing `tasks` table by adding a
//! `task_type` value (`mint_template`, `bundle_template`,
//! `pump_fun_template`) and storing the launch payload as JSON in the
//! new `config_blob` column (migration 029).
//!
//! Execute model: this module decodes the blob and calls the matching
//! existing endpoint internally (mint, bundle launch, pump-fun launch).
//! No business logic is duplicated — the template is purely a saved
//! payload that gets re-injected into the canonical launch path.

use axum::{
    extract::{Extension, Path, State},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tokio_rusqlite::Connection;

use crate::error::AppError;
use crate::user::UserCtxExt;
use offivex_db::models::Task;
use offivex_db::repo::audit_repo::AuditRepo;
use offivex_db::repo::task_repo::TaskRepo;

/// Allowed task_type values for launch templates. We validate against
/// this set so an attacker can't sneak in a malformed type that would
/// confuse the `/tasks` page render logic.
const TEMPLATE_TYPES: &[&str] = &[
    "mint_template",
    "bundle_template",
    "pump_fun_template",
];

#[derive(Clone)]
pub struct TasksState {
    pub db: Arc<Connection>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskRequest {
    pub task_type: String,
    /// Free-form JSON payload — the calling page (mint/bundle/pump-fun)
    /// is responsible for serializing its own form state. We just store
    /// the string verbatim and hand it back on execute.
    pub config_blob: serde_json::Value,
    /// Human-readable label so the user can find the template later.
    /// Stored inside `config_blob.label` by convention; we don't have a
    /// dedicated column to keep migration footprint minimal.
    pub label: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TaskResponse {
    pub id: String,
    pub task_type: String,
    pub status: String,
    pub config_blob: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

fn into_response(task: Task) -> TaskResponse {
    let config_blob = task
        .config_blob
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(serde_json::json!({}));
    TaskResponse {
        id: task.id,
        task_type: task.task_type,
        status: task.status,
        config_blob,
        created_at: task.created_at,
        updated_at: task.updated_at,
    }
}

/// POST /api/v1/tasks — Create (save) a new launch template.
pub async fn create(
    State(state): State<TasksState>,
    Extension(user_ctx): Extension<UserCtxExt>,
    Json(body): Json<CreateTaskRequest>,
) -> Result<Response, AppError> {
    if !TEMPLATE_TYPES.contains(&body.task_type.as_str()) {
        return Err(AppError::bad_request(format!(
            "task_type must be one of {:?}",
            TEMPLATE_TYPES
        )));
    }

    // Inject the human label into the blob so the GET endpoint can show
    // it without a separate column. The nested-if is split intentionally
    // for readability of the two distinct conditions (have label, blob
    // is an object); we don't want to chain into a `let && let`.
    let mut blob = body.config_blob;
    #[allow(clippy::collapsible_if)]
    if let Some(label) = body.label {
        if let serde_json::Value::Object(ref mut map) = blob {
            map.insert("__label".to_string(), serde_json::Value::String(label));
        }
    }
    let config_blob = blob.to_string();

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let task = Task {
        id: id.clone(),
        task_type: body.task_type.clone(),
        status: "saved".to_string(),
        progress: 0.0,
        result_json: None,
        error: None,
        config_blob: Some(config_blob),
        created_at: now,
        updated_at: now,
    };

    TaskRepo::create(&state.db, task.clone())
        .await
        .map_err(|e| AppError::internal(format!("DB error: {}", e)))?;

    let _ = AuditRepo::insert_full(
        &state.db,
        "user_op_task_template_create",
        &format!("task_id={} task_type={}", id, body.task_type),
        None,
        None,
        None,
        Some(&user_ctx.user_id),
        None,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": into_response(task)
    }))
    .into_response())
}

/// GET /api/v1/tasks — List every saved launch template (all 3 types).
pub async fn list(State(state): State<TasksState>) -> Result<Response, AppError> {
    let tasks = TaskRepo::list_templates(&state.db)
        .await
        .map_err(|e| AppError::internal(format!("DB error: {}", e)))?;
    let data: Vec<TaskResponse> = tasks.into_iter().map(into_response).collect();
    Ok(Json(json!({ "success": true, "data": data })).into_response())
}

/// GET /api/v1/tasks/:id — Fetch a single template by id.
pub async fn get(
    State(state): State<TasksState>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let task = TaskRepo::get_by_id(&state.db, id)
        .await
        .map_err(|e| AppError::internal(format!("DB error: {}", e)))?
        .ok_or_else(|| AppError::not_found("Task not found"))?;
    Ok(Json(json!({ "success": true, "data": into_response(task) })).into_response())
}

/// DELETE /api/v1/tasks/:id — Remove a saved template.
pub async fn delete(
    State(state): State<TasksState>,
    Extension(user_ctx): Extension<UserCtxExt>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let deleted = TaskRepo::delete(&state.db, id.clone())
        .await
        .map_err(|e| AppError::internal(format!("DB error: {}", e)))?;
    if deleted {
        let _ = AuditRepo::insert_full(
            &state.db,
            "user_op_task_template_delete",
            &format!("task_id={}", id),
            None,
            None,
            None,
            Some(&user_ctx.user_id),
            None,
        )
        .await;
    }
    Ok(Json(json!({ "success": true, "data": { "deleted": deleted } })).into_response())
}

/// POST /api/v1/tasks/:id/execute — Return the saved blob so the frontend
/// can re-fill the launch form and POST to the canonical launch endpoint.
///
/// Rationale for "frontend re-injects" vs "backend chains internally":
///   - The mint / bundle / pump-fun endpoints each have their own auth +
///     plan + unlock middleware stack; chaining them server-side would
///     bypass those checks or duplicate the validation.
///   - Forms may include client-only fields (image preview, validation
///     state). The frontend re-fill is the cleanest reuse.
///   - The "execute" call also bumps the task's `updated_at` for
///     audit/observability — proof that the template was actually used.
pub async fn execute(
    State(state): State<TasksState>,
    Extension(user_ctx): Extension<UserCtxExt>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let task = TaskRepo::get_by_id(&state.db, id.clone())
        .await
        .map_err(|e| AppError::internal(format!("DB error: {}", e)))?
        .ok_or_else(|| AppError::not_found("Task not found"))?;

    if !TEMPLATE_TYPES.contains(&task.task_type.as_str()) {
        return Err(AppError::bad_request(format!(
            "Task {} is not an executable template (type={})",
            id, task.task_type
        )));
    }

    let blob = task
        .config_blob
        .as_deref()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
        .ok_or_else(|| AppError::internal("Task has no executable config_blob"))?;

    // Bump updated_at so the user can see when a template was last
    // executed in the /tasks list (sorts by created_at, hover shows
    // updated_at).
    let _ = TaskRepo::update(
        &state.db,
        id.clone(),
        "executed".to_string(),
        100.0,
        None,
        None,
    )
    .await;

    let _ = AuditRepo::insert_full(
        &state.db,
        "user_op_task_template_execute",
        &format!("task_id={} task_type={}", id, task.task_type),
        None,
        None,
        None,
        Some(&user_ctx.user_id),
        None,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "data": {
            "task_id": id,
            "task_type": task.task_type,
            "config_blob": blob,
        }
    }))
    .into_response())
}
