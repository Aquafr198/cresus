use serde_json::{json, Value};

/// Send a Markdown V2-formatted message via the Telegram Bot API with
/// retry. Validates the JSON body for `{"ok": true}` — Telegram returns
/// HTTP 200 with `ok: false` on app-level errors (markdown parse failure,
/// banned chat, etc.) which the previous version silently swallowed.
///
/// Retries up to 3 attempts with exponential backoff (1 s, 4 s) on:
///   - any transient network error (connect/read timeout, DNS, reset)
///   - HTTP 5xx
///   - HTTP 429 (rate-limit)
///
/// Does NOT retry on:
///   - HTTP 4xx other than 429 (bad request — retry won't help)
///   - `ok: false` from Telegram (semantic failure — retry won't help)
///
/// Callers usually fire this from `tokio::spawn` and ignore the result —
/// notifications must never block a critical path like a token launch.
pub async fn send_message(bot_token: &str, chat_id: &str, text: &str) -> Result<(), String> {
    const MAX_ATTEMPTS: u32 = 3;
    let url = format!("https://api.telegram.org/bot{bot_token}/sendMessage");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let body = json!({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "MarkdownV2",
        "disable_web_page_preview": true,
    });

    let mut last_err = String::new();
    for attempt in 0..MAX_ATTEMPTS {
        match client.post(&url).json(&body).send().await {
            Ok(res) => {
                let status = res.status();
                let resp_text = res.text().await.unwrap_or_default();

                // 4xx other than 429 — permanent client error, don't retry.
                if status.is_client_error() && status.as_u16() != 429 {
                    return Err(format!("telegram api {}: {}", status, resp_text));
                }

                if status.is_success() {
                    // Parse body and confirm `ok: true`. Telegram answers
                    // {"ok": false, "description": "..."} on app errors
                    // while still returning HTTP 200.
                    match serde_json::from_str::<Value>(&resp_text) {
                        Ok(v) if v.get("ok") == Some(&Value::Bool(true)) => return Ok(()),
                        Ok(v) => {
                            let desc = v
                                .get("description")
                                .and_then(|d| d.as_str())
                                .unwrap_or("unknown");
                            return Err(format!("telegram api ok=false: {desc}"));
                        }
                        Err(e) => {
                            last_err = format!("telegram api response not JSON: {e}");
                        }
                    }
                } else {
                    // 5xx or 429 — retryable.
                    last_err = format!("telegram api {}: {}", status, resp_text);
                }
            }
            Err(e) => last_err = e.to_string(),
        }

        if attempt + 1 < MAX_ATTEMPTS {
            // 1 s then 4 s (2^attempt * 1000 ms with base 1s).
            let delay_ms = 1000u64.saturating_mul(1u64 << (2 * attempt));
            tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
        }
    }
    Err(last_err)
}

/// Escape every reserved MarkdownV2 character per
/// <https://core.telegram.org/bots/api#markdownv2-style>. Apply this to any
/// user- or chain-derived value spliced into a Markdown template.
pub fn escape_markdown_v2(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '_' | '*' | '[' | ']' | '(' | ')' | '~' | '`' | '>' | '#' | '+' | '-' | '='
            | '|' | '{' | '}' | '.' | '!' | '\\' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_reserved_chars() {
        assert_eq!(escape_markdown_v2("a.b"), "a\\.b");
        assert_eq!(escape_markdown_v2("foo_bar"), "foo\\_bar");
        assert_eq!(escape_markdown_v2("(hi)"), "\\(hi\\)");
        assert_eq!(escape_markdown_v2("plain text"), "plain text");
        assert_eq!(escape_markdown_v2("backslash\\here"), "backslash\\\\here");
    }
}
