//! Apply request handler — public POST endpoint.
//!
//! Persists each submission to `apply_requests` and fires a non-blocking Telegram
//! notification (best-effort). Validation mirrors the legacy Next.js route handler
//! so the existing frontend form keeps working without changes.

use std::sync::Arc;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio_rusqlite::Connection;
use uuid::Uuid;

use crate::error::AppError;
use offivex_db::repo::apply_repo::ApplyRepo;
use offivex_db::repo::audit_repo::AuditRepo;

/// Optional Telegram bot config — None disables notifications.
#[derive(Clone, Debug)]
pub struct TelegramConfig {
    pub bot_token: Option<String>,
    pub chat_id: Option<String>,
}

impl TelegramConfig {
    pub fn is_enabled(&self) -> bool {
        self.bot_token.is_some() && self.chat_id.is_some()
    }
}

#[derive(Clone)]
pub struct ApplyHandlerState {
    pub db: Arc<Connection>,
    pub telegram: TelegramConfig,
}

#[derive(Debug, Deserialize)]
pub struct ApplyRequestBody {
    pub telegram: String,
    pub email: String,
    pub project: String,
    pub plan: Option<String>,
    /// Phase 6.5 — optional referral code (e.g. "OFX-A1B2C3") captured from the
    /// /apply?ref= query param at the frontend and forwarded here.
    #[serde(rename = "ref", alias = "referral_code")]
    pub referral_code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ApplyResponse {
    pub id: String,
}

pub async fn submit_apply(
    State(state): State<ApplyHandlerState>,
    headers: HeaderMap,
    Json(body): Json<ApplyRequestBody>,
) -> Result<Response, AppError> {
    // ── Validation (mirrors the legacy Next.js validators verbatim) ────
    let telegram = body.telegram.trim().to_string();
    let email = body.email.trim().to_string();
    let project = body.project.trim().to_string();
    let plan = body
        .plan
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if telegram.is_empty() || email.is_empty() || project.is_empty() {
        return Err(AppError::bad_request("Missing required fields"));
    }
    if !is_valid_telegram_handle(&telegram) {
        return Err(AppError::bad_request("Invalid Telegram handle format"));
    }
    if !is_valid_email(&email) {
        return Err(AppError::bad_request("Invalid email format"));
    }
    if project.chars().count() < 30 || project.chars().count() > 1500 {
        return Err(AppError::bad_request(
            "Project description must be 30-1500 characters",
        ));
    }
    if let Some(p) = &plan {
        if p != "monthly" && p != "yearly" {
            return Err(AppError::bad_request("Invalid plan"));
        }
    }

    // ── IP capture (header-only; behind reverse-proxy in prod) ─────────
    let ip = extract_client_ip(&headers);

    // ── Referral code validation (format-only; existence checked at approve) ──
    let referral_code = body
        .referral_code
        .as_ref()
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty() && is_valid_referral_code(s));

    // ── Persist ────────────────────────────────────────────────────────
    let id = Uuid::new_v4().to_string();
    let _row = ApplyRepo::insert(
        &state.db,
        &id,
        &telegram,
        &email,
        &project,
        plan.as_deref(),
        ip.as_deref(),
        referral_code.as_deref(),
    )
    .await?;

    // Audit
    let _ = AuditRepo::insert_full(
        &state.db,
        "apply_submitted",
        &format!("telegram={} plan={}", telegram, plan.as_deref().unwrap_or("-")),
        None,
        None,
        None,
        None,
        ip.as_deref(),
    )
    .await;

    // ── Fire-and-forget Telegram notify (best-effort) ──────────────────
    if state.telegram.is_enabled() {
        let cfg = state.telegram.clone();
        let db = state.db.clone();
        let id_clone = id.clone();
        let text = build_telegram_message(&telegram, &email, plan.as_deref(), &project, ip.as_deref());
        tokio::spawn(async move {
            if let Err(e) = send_telegram_message(&cfg, &text).await {
                tracing::warn!("Telegram notify failed for apply {}: {}", id_clone, e);
                // Log to audit so the admin can see delivery failures
                let _ = AuditRepo::insert_full(
                    &db,
                    "apply_telegram_failed",
                    &format!("apply_id={} err={}", id_clone, e),
                    None,
                    None,
                    None,
                    None,
                    None,
                )
                .await;
            }
        });
    } else {
        tracing::debug!("Telegram not configured; skipping notification for apply {}", id);
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": true,
            "data": ApplyResponse { id }
        })),
    )
        .into_response())
}

// ── Validators ──────────────────────────────────────────────────────────

fn is_valid_telegram_handle(s: &str) -> bool {
    // @<3-32 chars: alphanumeric or underscore>
    let bytes = s.as_bytes();
    if bytes.first() != Some(&b'@') {
        return false;
    }
    let rest = &bytes[1..];
    if rest.len() < 3 || rest.len() > 32 {
        return false;
    }
    rest.iter()
        .all(|b| b.is_ascii_alphanumeric() || *b == b'_')
}

/// Referral code format: `OFX-` prefix + 6 uppercase alphanumeric chars.
/// Matches `generate_referral_code()` in user.rs.
fn is_valid_referral_code(s: &str) -> bool {
    if !s.starts_with("OFX-") || s.len() != 10 {
        return false;
    }
    s[4..].chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
}

fn is_valid_email(s: &str) -> bool {
    // Audit P4 SEC-11 — stricter format check to deter spam-applies.
    // Rules (RFC 5321 spirit, not byte-exact — that requires a full lexer):
    //   - total length 6..=254 chars
    //   - exactly one '@'
    //   - local-part: 1..=64 chars, only [a-zA-Z0-9._%+-], no leading/trailing dot,
    //     no consecutive dots
    //   - domain: 4..=253 chars, only [a-zA-Z0-9.-], must contain a dot,
    //     each label non-empty + not starting/ending with hyphen
    //   - TLD: ≥ 2 chars, all alphabetic
    if s.len() < 6 || s.len() > 254 {
        return false;
    }
    let at = match s.find('@') {
        Some(i) => i,
        None => return false,
    };
    if s.matches('@').count() != 1 {
        return false;
    }
    let local = &s[..at];
    let domain = &s[at + 1..];

    // Local-part
    if local.is_empty() || local.len() > 64 {
        return false;
    }
    if local.starts_with('.') || local.ends_with('.') || local.contains("..") {
        return false;
    }
    if !local
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'%' | b'+' | b'-'))
    {
        return false;
    }

    // Domain
    if domain.is_empty() || domain.len() > 253 || !domain.contains('.') {
        return false;
    }
    if !domain
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
    {
        return false;
    }
    let labels: Vec<&str> = domain.split('.').collect();
    if labels.iter().any(|l| {
        l.is_empty() || l.starts_with('-') || l.ends_with('-')
    }) {
        return false;
    }
    // TLD = last label, must be alphabetic and ≥ 2 chars (rejects "a@b.c").
    let tld = labels.last().copied().unwrap_or("");
    if tld.len() < 2 || !tld.bytes().all(|b| b.is_ascii_alphabetic()) {
        return false;
    }
    true
}

// ── IP extraction ───────────────────────────────────────────────────────

fn extract_client_ip(headers: &HeaderMap) -> Option<String> {
    if let Some(v) = headers
        .get("x-forwarded-for")
        .and_then(|h| h.to_str().ok())
    {
        if let Some(first) = v.split(',').next() {
            let trimmed = first.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    if let Some(v) = headers.get("x-real-ip").and_then(|h| h.to_str().ok()) {
        if !v.is_empty() {
            return Some(v.to_string());
        }
    }
    None
}

// ── Telegram ────────────────────────────────────────────────────────────

fn escape_markdown_v2(s: &str) -> String {
    // MarkdownV2 reserves: _*[]()~`>#+-=|{}.!\
    const RESERVED: &[char] = &[
        '_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!',
        '\\',
    ];
    let mut out = String::with_capacity(s.len() + 8);
    for ch in s.chars() {
        if RESERVED.contains(&ch) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn build_telegram_message(
    telegram: &str,
    email: &str,
    plan: Option<&str>,
    project: &str,
    ip: Option<&str>,
) -> String {
    let now = chrono::Utc::now().to_rfc3339();
    let plan_line = plan
        .map(|p| format!("*Plan:* {}\n", escape_markdown_v2(p)))
        .unwrap_or_default();
    let ip_line = ip
        .map(|i| format!("_IP: {}_", escape_markdown_v2(i)))
        .unwrap_or_default();

    format!(
        "🆕 *New Offivex application*\n\n*Telegram:* {}\n*Email:* {}\n{}\n*Project:*\n{}\n\n_Received: {}_\n{}",
        escape_markdown_v2(telegram),
        escape_markdown_v2(email),
        plan_line,
        escape_markdown_v2(project),
        escape_markdown_v2(&now),
        ip_line,
    )
}

/// Forwarder to the shared `telegram::send_message` helper. Keeps the
/// `TelegramConfig`-aware call sites in this module unchanged while routing
/// through the version with retry + `ok: true` validation.
async fn send_telegram_message(cfg: &TelegramConfig, text: &str) -> Result<(), String> {
    let token = cfg.bot_token.as_deref().ok_or("missing bot token")?;
    let chat_id = cfg.chat_id.as_deref().ok_or("missing chat id")?;
    crate::telegram::send_message(token, chat_id, text).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telegram_handle_valid() {
        assert!(is_valid_telegram_handle("@abc"));
        assert!(is_valid_telegram_handle("@user_name_123"));
        assert!(is_valid_telegram_handle("@a_b_c"));
    }

    #[test]
    fn telegram_handle_invalid() {
        assert!(!is_valid_telegram_handle("abc"));    // no @
        assert!(!is_valid_telegram_handle("@ab"));    // too short
        assert!(!is_valid_telegram_handle("@a"));     // too short
        assert!(!is_valid_telegram_handle("@"));      // empty
        assert!(!is_valid_telegram_handle(&format!("@{}", "a".repeat(33)))); // too long
        assert!(!is_valid_telegram_handle("@foo-bar")); // hyphen
        assert!(!is_valid_telegram_handle("@foo.bar")); // dot
        assert!(!is_valid_telegram_handle("@foo bar")); // space
    }

    #[test]
    fn email_valid() {
        assert!(is_valid_email("hello@example.com"));
        assert!(is_valid_email("first.last@sub.domain.io"));
        assert!(is_valid_email("a+tag@gmail.com"));
        assert!(is_valid_email("user_name@my-domain.co.uk"));
    }

    #[test]
    fn email_invalid() {
        // Audit SEC-11 — stricter rules: TLD must be ≥ 2 letters, no leading
        // dots in local-part, no consecutive dots, total length 6..=254.
        assert!(!is_valid_email("a@b.c")); // TLD too short — previously accepted
        assert!(!is_valid_email("no-at"));
        assert!(!is_valid_email("@nolocal.com"));
        assert!(!is_valid_email("noat@"));
        assert!(!is_valid_email("two@@signs.com"));
        assert!(!is_valid_email("nodot@nodot"));
        assert!(!is_valid_email("trailing@dot."));
        assert!(!is_valid_email(".lead@dot.com"));
        assert!(!is_valid_email("trail.@dot.com"));
        assert!(!is_valid_email("two..dots@dot.com"));
        assert!(!is_valid_email("space @x.com"));
        assert!(!is_valid_email("x@-bad.com"));
        assert!(!is_valid_email("x@bad-.com"));
        assert!(!is_valid_email("x@dom.123")); // numeric TLD
        assert!(!is_valid_email("hi@example")); // no dot in domain
        assert!(!is_valid_email("short"));
    }

    #[test]
    fn markdown_v2_escapes_reserved() {
        assert_eq!(escape_markdown_v2("a.b"), "a\\.b");
        assert_eq!(escape_markdown_v2("foo_bar"), "foo\\_bar");
        assert_eq!(escape_markdown_v2("(hi)"), "\\(hi\\)");
        assert_eq!(escape_markdown_v2("plain text"), "plain text");
    }
}
