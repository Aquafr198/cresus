use serde_json::{json, Value};

/// Input for building a Metaplex Token Standard v1.1-compliant JSON.
///
/// Used when a creator doesn't supply a pre-pinned `metadata_uri` and instead
/// provides the individual social fields. The builder produces JSON conforming
/// to https://docs.metaplex.com/programs/token-metadata/token-standard so that
/// Solscan / Phantom / Birdeye render the token correctly with image + socials.
#[derive(Debug, Clone)]
pub struct MetaplexJsonInput<'a> {
    pub name: &'a str,
    pub symbol: &'a str,
    pub description: Option<&'a str>,
    pub image_uri: Option<&'a str>,
    pub twitter: Option<&'a str>,
    pub telegram: Option<&'a str>,
    pub website: Option<&'a str>,
}

#[derive(Debug, thiserror::Error)]
pub enum BuildError {
    #[error("name is required and cannot be blank")]
    BlankName,
    #[error("symbol is required and cannot be blank")]
    BlankSymbol,
    #[error("name exceeds Metaplex 32-byte limit (got {0} bytes)")]
    NameTooLong(usize),
    #[error("symbol exceeds Metaplex 10-byte limit (got {0} bytes)")]
    SymbolTooLong(usize),
    #[error("description exceeds 1000 chars (got {0})")]
    DescriptionTooLong(usize),
    #[error("invalid url for field `{0}`: must start with http:// or https:// or ipfs://")]
    InvalidUrl(&'static str),
}

/// Build the Metaplex Token Standard JSON for a token mint, ready to pin.
///
/// Spec: https://docs.metaplex.com/programs/token-metadata/token-standard
/// We follow v1.1 (the dominant version on mainnet) and include socials in
/// the `extensions` block — the convention adopted by Pump.fun, Bonk, Phantom
/// wallet, and Solscan.
pub fn build_metaplex_json(input: &MetaplexJsonInput) -> Result<Value, BuildError> {
    if input.name.trim().is_empty() {
        return Err(BuildError::BlankName);
    }
    if input.symbol.trim().is_empty() {
        return Err(BuildError::BlankSymbol);
    }
    if input.name.len() > 32 {
        return Err(BuildError::NameTooLong(input.name.len()));
    }
    if input.symbol.len() > 10 {
        return Err(BuildError::SymbolTooLong(input.symbol.len()));
    }
    if let Some(desc) = input.description {
        if desc.chars().count() > 1000 {
            return Err(BuildError::DescriptionTooLong(desc.chars().count()));
        }
    }
    validate_url(input.image_uri, "image_uri")?;
    validate_url(input.twitter, "twitter")?;
    validate_url(input.telegram, "telegram")?;
    validate_url(input.website, "website")?;

    let image = input.image_uri.unwrap_or("");
    let mime = guess_image_mime(image);

    let mut root = json!({
        "name": input.name,
        "symbol": input.symbol,
        "description": input.description.unwrap_or(""),
        "image": image,
    });

    // `external_url` is the Metaplex-standard pointer to the project site.
    if let Some(w) = input.website {
        root["external_url"] = json!(w);
    }

    // Properties.files — required by Phantom for image rendering.
    if !image.is_empty() {
        root["properties"] = json!({
            "files": [{ "uri": image, "type": mime }],
            "category": "image",
        });
    }

    // `extensions` is the convention adopted by Pump.fun / Bonk / Birdeye for
    // social handles. Only emit if at least one social is set, otherwise leave
    // the JSON minimal.
    let mut ext = serde_json::Map::new();
    if let Some(t) = input.twitter {
        ext.insert("twitter".into(), json!(t));
    }
    if let Some(t) = input.telegram {
        ext.insert("telegram".into(), json!(t));
    }
    if let Some(w) = input.website {
        ext.insert("website".into(), json!(w));
    }
    if !ext.is_empty() {
        root["extensions"] = Value::Object(ext);
    }

    Ok(root)
}

fn validate_url(url: Option<&str>, field: &'static str) -> Result<(), BuildError> {
    let Some(u) = url else { return Ok(()) };
    let u = u.trim();
    if u.is_empty() {
        return Ok(());
    }
    if u.starts_with("http://") || u.starts_with("https://") || u.starts_with("ipfs://") {
        return Ok(());
    }
    Err(BuildError::InvalidUrl(field))
}

fn guess_image_mime(uri: &str) -> &'static str {
    let lower = uri.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else {
        // Phantom accepts image/png as the default fallback for IPFS hashes
        // without an extension (which is the Pinata default).
        "image/png"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_full_metadata_with_all_socials() {
        let input = MetaplexJsonInput {
            name: "Doge2",
            symbol: "DOGE2",
            description: Some("A new chapter for Doge."),
            image_uri: Some("https://gateway.pinata.cloud/ipfs/Qm.../doge.png"),
            twitter: Some("https://x.com/doge2"),
            telegram: Some("https://t.me/doge2"),
            website: Some("https://doge2.io"),
        };
        let json = build_metaplex_json(&input).unwrap();
        assert_eq!(json["name"], "Doge2");
        assert_eq!(json["symbol"], "DOGE2");
        assert_eq!(json["description"], "A new chapter for Doge.");
        assert_eq!(json["external_url"], "https://doge2.io");
        assert_eq!(json["image"], "https://gateway.pinata.cloud/ipfs/Qm.../doge.png");
        assert_eq!(json["properties"]["files"][0]["type"], "image/png");
        assert_eq!(json["extensions"]["twitter"], "https://x.com/doge2");
        assert_eq!(json["extensions"]["telegram"], "https://t.me/doge2");
    }

    #[test]
    fn rejects_blank_name() {
        let input = MetaplexJsonInput {
            name: "",
            symbol: "X",
            description: None,
            image_uri: None,
            twitter: None,
            telegram: None,
            website: None,
        };
        assert!(matches!(
            build_metaplex_json(&input),
            Err(BuildError::BlankName)
        ));
    }

    #[test]
    fn rejects_oversized_symbol() {
        let input = MetaplexJsonInput {
            name: "Name",
            symbol: "VERY_LONG_SYMBOL_X",
            description: None,
            image_uri: None,
            twitter: None,
            telegram: None,
            website: None,
        };
        assert!(matches!(
            build_metaplex_json(&input),
            Err(BuildError::SymbolTooLong(_))
        ));
    }

    #[test]
    fn rejects_non_http_url() {
        let input = MetaplexJsonInput {
            name: "Name",
            symbol: "X",
            description: None,
            image_uri: None,
            twitter: Some("doge2 on twitter please"),
            telegram: None,
            website: None,
        };
        assert!(matches!(
            build_metaplex_json(&input),
            Err(BuildError::InvalidUrl("twitter"))
        ));
    }

    #[test]
    fn accepts_minimal_input() {
        let input = MetaplexJsonInput {
            name: "Name",
            symbol: "X",
            description: None,
            image_uri: None,
            twitter: None,
            telegram: None,
            website: None,
        };
        let json = build_metaplex_json(&input).unwrap();
        assert_eq!(json["name"], "Name");
        assert!(json.get("extensions").is_none());
        assert!(json.get("properties").is_none());
    }

    #[test]
    fn guesses_jpeg_mime() {
        assert_eq!(guess_image_mime("https://x.com/img.JPG"), "image/jpeg");
        assert_eq!(guess_image_mime("https://x.com/img.png"), "image/png");
        assert_eq!(guess_image_mime("https://x.com/no-ext"), "image/png");
    }
}
