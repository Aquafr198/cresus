//! Profile randomization — generate realistic-looking display names,
//! bios, and social handles for sub-wallets.
//!
//! Uses built-in word lists to create profiles without external API calls.

use std::sync::Arc;
use tokio_rusqlite::Connection;
use rand::seq::SliceRandom;
use rand::Rng;

use cresus_db::models::WalletProfile;
use cresus_db::repo::profile_repo::ProfileRepo;

#[derive(Debug, thiserror::Error)]
pub enum ProfileError {
    #[error("Database error: {0}")]
    Db(#[from] cresus_db::DbError),
}

// ═══════════════════════════════════════════════════════════════
// Word lists for name generation
// ═══════════════════════════════════════════════════════════════

const ADJECTIVES: &[&str] = &[
    "swift", "lazy", "cosmic", "mighty", "silent", "golden", "dark", "bright",
    "wild", "frozen", "electric", "ancient", "sacred", "hidden", "crypto",
    "lunar", "solar", "stellar", "neon", "alpha", "omega", "turbo", "hyper",
    "mega", "ultra", "micro", "nano", "zen", "pixel", "based", "degen",
    "chad", "rare", "epic", "sigma", "giga", "diamond", "paper", "iron",
    "steel", "ruby", "jade", "onyx", "amber", "coral", "ivory", "opal",
];

const NOUNS: &[&str] = &[
    "wolf", "eagle", "dragon", "phoenix", "tiger", "lion", "hawk", "bear",
    "shark", "whale", "ape", "fox", "panther", "cobra", "raven", "owl",
    "bull", "stag", "falcon", "viper", "knight", "wizard", "sage", "ninja",
    "samurai", "pirate", "viking", "trader", "builder", "hunter", "runner",
    "rider", "surfer", "drifter", "nomad", "rebel", "ghost", "phantom",
    "shadow", "storm", "thunder", "blaze", "frost", "spark", "pulse",
    "cipher", "nexus", "vertex", "zenith", "orbit", "void", "flux",
];

const BIO_TEMPLATES: &[&str] = &[
    "Just vibing on Solana.",
    "Building the future, one block at a time.",
    "NFT collector | DeFi enthusiast",
    "In it for the tech.",
    "Solana maxi. Not financial advice.",
    "GM. GN. WAGMI.",
    "Diamond hands since day one.",
    "Exploring the decentralized frontier.",
    "Code is law.",
    "Apeing into everything.",
    "On-chain since before it was cool.",
    "Making it or faking it.",
    "Sol summer never ends.",
    "Speed > Everything.",
    "Web3 native.",
    "Probably nothing.",
    "DYOR. NFA. LFG.",
    "Not your keys, not your coins.",
    "Building in stealth mode.",
    "Full send only.",
    "Fueled by coffee and conviction.",
    "Trust the process.",
    "Here for the long run.",
    "Innovation is my middle name.",
    "Art | Crypto | Vibes",
    "Living on the blockchain.",
];

const AVATAR_STYLES: &[&str] = &[
    "adventurer", "avataaars", "big-ears", "bottts", "croodles",
    "fun-emoji", "identicon", "lorelei", "micah", "miniavs",
    "notionists", "open-peeps", "personas", "pixel-art", "thumbs",
];

/// A generated profile.
#[derive(Debug, Clone, serde::Serialize)]
pub struct GeneratedProfile {
    pub display_name: String,
    pub avatar_url: String,
    pub bio: String,
    pub twitter: Option<String>,
    pub telegram: Option<String>,
    pub website: Option<String>,
}

/// Generate a single random profile.
pub fn generate_random_profile() -> GeneratedProfile {
    let mut rng = rand::thread_rng();

    let display_name = generate_display_name(&mut rng);
    let avatar_url = generate_avatar_url(&mut rng, &display_name);
    let bio = BIO_TEMPLATES.choose(&mut rng).unwrap_or(&"").to_string();

    // Randomly decide whether to include socials (30% chance each)
    let twitter = if rng.gen_bool(0.3) {
        Some(generate_handle(&mut rng))
    } else {
        None
    };
    let telegram = if rng.gen_bool(0.2) {
        Some(generate_handle(&mut rng))
    } else {
        None
    };
    let website = None; // Leave blank for realism

    GeneratedProfile {
        display_name,
        avatar_url,
        bio,
        twitter,
        telegram,
        website,
    }
}

/// Generate a batch of random profiles.
pub fn generate_batch(count: usize) -> Vec<GeneratedProfile> {
    (0..count).map(|_| generate_random_profile()).collect()
}

fn generate_display_name(rng: &mut impl Rng) -> String {
    let adj = ADJECTIVES.choose(rng).unwrap();
    let noun = NOUNS.choose(rng).unwrap();
    let num: u32 = rng.gen_range(1..9999);

    // Vary the format
    match rng.gen_range(0..5) {
        0 => format!("{}{}{}", capitalize(adj), capitalize(noun), num),
        1 => format!("{}_{}", adj, noun),
        2 => format!("{}{}", capitalize(adj), capitalize(noun)),
        3 => format!("{}.{}.{}", adj, noun, rng.gen_range(0..100)),
        _ => format!("{}_{}{}", adj, noun, num),
    }
}

fn generate_handle(rng: &mut impl Rng) -> String {
    let adj = ADJECTIVES.choose(rng).unwrap();
    let noun = NOUNS.choose(rng).unwrap();
    let num: u32 = rng.gen_range(1..999);
    format!("{}_{}{}", adj, noun, num)
}

fn generate_avatar_url(rng: &mut impl Rng, seed: &str) -> String {
    let style = AVATAR_STYLES.choose(rng).unwrap();
    format!("https://api.dicebear.com/7.x/{}/svg?seed={}", style, seed)
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) => c.to_uppercase().to_string() + chars.as_str(),
        None => String::new(),
    }
}

/// Assign a randomly generated profile to a wallet and save to DB.
pub async fn assign_random_profile(
    db: &Arc<Connection>,
    wallet_id: &str,
) -> Result<WalletProfile, ProfileError> {
    let generated = generate_random_profile();
    let now = chrono::Utc::now().timestamp();

    let profile = WalletProfile {
        id: uuid::Uuid::new_v4().to_string(),
        wallet_id: wallet_id.to_string(),
        display_name: Some(generated.display_name),
        avatar_url: Some(generated.avatar_url),
        bio: Some(generated.bio),
        twitter: generated.twitter,
        telegram: generated.telegram,
        website: generated.website,
        created_at: now,
        updated_at: now,
    };

    ProfileRepo::upsert(db, profile.clone()).await?;
    Ok(profile)
}

/// Batch-assign random profiles to multiple wallets.
pub async fn assign_batch_profiles(
    db: &Arc<Connection>,
    wallet_ids: &[String],
) -> Result<Vec<WalletProfile>, ProfileError> {
    let mut profiles = Vec::new();
    for wallet_id in wallet_ids {
        let profile = assign_random_profile(db, wallet_id).await?;
        profiles.push(profile);
    }
    Ok(profiles)
}
