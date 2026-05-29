use reqwest::multipart;

#[derive(Debug, thiserror::Error)]
pub enum PinningError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Pinata API error: {0}")]
    Pinata(String),
    #[error("No Pinata API key configured")]
    NoPinataKey,
}

/// Service for pinning files to IPFS via Pinata.
#[derive(Clone)]
pub struct PinningService {
    pinata_jwt: Option<String>,
}

impl PinningService {
    pub fn new(pinata_jwt: Option<String>) -> Self {
        Self { pinata_jwt }
    }

    /// Lazily reach the process-wide shared HTTP client (with timeouts +
    /// connection pooling). Replaces the per-instance `reqwest::Client`
    /// that used to be created via `::new()` without any timeout.
    fn http(&self) -> &'static reqwest::Client {
        crate::http::shared()
    }

    /// Pin a file to IPFS via Pinata. Returns (CID, gateway_url).
    pub async fn pin_to_ipfs(
        &self,
        filename: &str,
        data: &[u8],
    ) -> Result<(String, String), PinningError> {
        // Pinata free-tier hard cap is 100 MB and most token logos sit
        // under 1 MB. Reject anything beyond 10 MB client-side so a bad
        // upload fails fast instead of streaming for minutes then 413.
        const MAX_PIN_BYTES: usize = 10 * 1024 * 1024;
        if data.len() > MAX_PIN_BYTES {
            return Err(PinningError::Pinata(format!(
                "file {} too large: {} bytes (max {} = 10 MB)",
                filename,
                data.len(),
                MAX_PIN_BYTES
            )));
        }

        let jwt = self.pinata_jwt.as_deref().ok_or(PinningError::NoPinataKey)?;

        let part = multipart::Part::bytes(data.to_vec())
            .file_name(filename.to_string())
            .mime_str("application/octet-stream")
            .unwrap();

        let form = multipart::Form::new().part("file", part);

        let resp = self
            .http()
            .post("https://api.pinata.cloud/pinning/pinFileToIPFS")
            .bearer_auth(jwt)
            .multipart(form)
            .send()
            .await?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(PinningError::Pinata(text));
        }

        let body: serde_json::Value = resp.json().await?;
        let cid = body["IpfsHash"]
            .as_str()
            .ok_or_else(|| PinningError::Pinata("No IpfsHash in response".into()))?
            .to_string();

        let gateway_url = format!("https://gateway.pinata.cloud/ipfs/{}", cid);
        Ok((cid, gateway_url))
    }

    /// Pin a JSON metadata blob to IPFS via Pinata. Returns (CID, gateway_url).
    pub async fn pin_json_to_ipfs(
        &self,
        name: &str,
        json: &serde_json::Value,
    ) -> Result<(String, String), PinningError> {
        let jwt = self.pinata_jwt.as_deref().ok_or(PinningError::NoPinataKey)?;

        let payload = serde_json::json!({
            "pinataContent": json,
            "pinataMetadata": {
                "name": name
            }
        });

        let resp = self
            .http()
            .post("https://api.pinata.cloud/pinning/pinJSONToIPFS")
            .bearer_auth(jwt)
            .json(&payload)
            .send()
            .await?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(PinningError::Pinata(text));
        }

        let body: serde_json::Value = resp.json().await?;
        let cid = body["IpfsHash"]
            .as_str()
            .ok_or_else(|| PinningError::Pinata("No IpfsHash in response".into()))?
            .to_string();

        let gateway_url = format!("https://gateway.pinata.cloud/ipfs/{}", cid);
        Ok((cid, gateway_url))
    }
}
