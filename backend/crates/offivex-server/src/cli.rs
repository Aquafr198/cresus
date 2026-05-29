//! CLI subcommands for the Offivex binary.
//!
//! Today: admin user management (create/list).
//! Future: password reset, plan import, etc.

use std::io::{BufRead, Read, Write};

use clap::{Args, Subcommand};

use crate::config::Config;

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Start the HTTP server (default when no subcommand is given)
    Serve,
    /// Manage admin accounts
    #[command(subcommand)]
    Admin(AdminCommand),
    /// Manage user accounts (dev shortcut — provisions user + subscription + API key)
    #[command(subcommand)]
    User(UserCommand),
}

#[derive(Subcommand, Debug)]
pub enum AdminCommand {
    /// Create a new admin account
    Create(CreateAdminArgs),
    /// List existing admin accounts
    List,
}

#[derive(Subcommand, Debug)]
pub enum UserCommand {
    /// Create a user account, attach an active subscription, and issue an
    /// API key. Mirrors the `/admin/applies/:id/approve` + `/admin/users/:id/grant`
    /// flow in one shot — handy for dev / local testing. The plaintext API
    /// key is printed once and cannot be retrieved later.
    Create(CreateUserArgs),
}

#[derive(Args, Debug)]
pub struct CreateUserArgs {
    /// Unique email for the user. Used as the login identifier.
    #[arg(long)]
    pub email: String,

    /// Plan slug to grant. Must match a row in `plans` (seeded: "monthly", "yearly").
    #[arg(long, default_value = "monthly")]
    pub plan: String,

    /// Optional Telegram handle.
    #[arg(long)]
    pub telegram: Option<String>,
}

#[derive(Args, Debug)]
pub struct CreateAdminArgs {
    /// Admin username (must be unique). Required.
    #[arg(long)]
    pub username: String,

    /// Read the password from stdin (recommended). Mutually exclusive with --password.
    #[arg(long, conflicts_with = "password")]
    pub password_stdin: bool,

    /// Pass the password inline (DO NOT use in shared shells — appears in history).
    #[arg(long)]
    pub password: Option<String>,
}

pub async fn run_admin(cmd: AdminCommand) -> anyhow::Result<()> {
    let config = Config::from_env();
    let db = offivex_db::init_db(&config.database_path).await?;

    match cmd {
        AdminCommand::Create(args) => cmd_create(&db, args).await,
        AdminCommand::List => cmd_list(&db).await,
    }
}

pub async fn run_user(cmd: UserCommand) -> anyhow::Result<()> {
    let config = Config::from_env();
    let db = offivex_db::init_db(&config.database_path).await?;

    match cmd {
        UserCommand::Create(args) => cmd_create_user(&db, args).await,
    }
}

async fn cmd_create(db: &tokio_rusqlite::Connection, args: CreateAdminArgs) -> anyhow::Result<()> {
    let username = args.username.trim().to_string();
    if username.is_empty() {
        anyhow::bail!("--username must not be empty");
    }

    if offivex_db::repo::admin_repo::AdminRepo::find_by_username(db, &username)
        .await?
        .is_some()
    {
        anyhow::bail!("admin '{}' already exists", username);
    }

    let password = match (args.password, args.password_stdin) {
        (Some(p), false) => p,
        (None, true) => read_password_from_stdin()?,
        (None, false) => {
            anyhow::bail!("provide either --password or --password-stdin");
        }
        (Some(_), true) => unreachable!("clap conflicts_with prevents this"),
    };

    validate_password(&password)?;

    let password_hash = offivex_crypto::hash_password_phc(&password)
        .map_err(|e| anyhow::anyhow!("failed to hash password: {e}"))?;

    let id = uuid::Uuid::new_v4().to_string();
    offivex_db::repo::admin_repo::AdminRepo::create(db, &id, &username, &password_hash).await?;

    println!("Admin '{}' created (id: {}).", username, id);
    Ok(())
}

async fn cmd_create_user(
    db: &tokio_rusqlite::Connection,
    args: CreateUserArgs,
) -> anyhow::Result<()> {
    use offivex_core::payment::api_key_format;
    use offivex_db::repo::{
        api_key_repo::ApiKeyRepo, plan_repo::PlanRepo, subscription_repo::SubscriptionRepo,
        user_repo::UserRepo,
    };

    let email = args.email.trim().to_string();
    if email.is_empty() {
        anyhow::bail!("--email must not be empty");
    }

    // 1. Reject duplicate email — a unique user per email is enforced by the
    //    same /apply approval flow we're shortcutting here.
    if UserRepo::find_by_email(db, &email).await?.is_some() {
        anyhow::bail!("a user with email '{email}' already exists");
    }

    // 2. Validate plan
    let plan_slug = args.plan.trim();
    let plan = PlanRepo::get_by_slug(db, plan_slug)
        .await?
        .ok_or_else(|| anyhow::anyhow!("unknown plan slug: '{plan_slug}'"))?;
    if plan.is_active != 1 {
        anyhow::bail!("plan '{plan_slug}' is not active");
    }

    // 3. Create user row
    let user_id = uuid::Uuid::new_v4().to_string();
    let telegram = args.telegram.as_deref();
    let user = UserRepo::create(db, &user_id, &email, telegram, None).await?;

    // 4. Subscription (active, paid via the synthetic "cli_grant" payment id —
    //    mirrors what /admin/users/:id/grant uses for manual grants).
    let sub_id = uuid::Uuid::new_v4().to_string();
    let duration_secs = plan.duration_days * 86_400;
    let sub = SubscriptionRepo::upsert_active(
        db,
        &sub_id,
        &user.id,
        &plan.id,
        duration_secs,
        "cli_grant",
    )
    .await?;

    // 5. API key — generate, hash, store. The plaintext is shown ONCE here.
    let plaintext = api_key_format::generate();
    let key_hash = offivex_crypto::hash_password_phc(&plaintext)
        .map_err(|e| anyhow::anyhow!("failed to hash api key: {e}"))?;
    let key_prefix = api_key_format::parse_prefix(&plaintext)
        .ok_or_else(|| anyhow::anyhow!("generated api key has no valid prefix"))?
        .to_string();
    let key_id = uuid::Uuid::new_v4().to_string();
    ApiKeyRepo::insert(db, &key_id, &user.id, &key_hash, &key_prefix).await?;

    // 6. Print one-shot summary. The expires_at field on a fresh active
    //    subscription is always Some, but we degrade gracefully if it isn't.
    let expires_human = sub
        .expires_at
        .map(format_ts)
        .unwrap_or_else(|| "(never)".to_string());
    println!("User '{email}' created.");
    println!("  user_id:        {}", user.id);
    println!("  plan:           {} ({}d)", plan.slug, plan.duration_days);
    println!("  subscription:   active until {expires_human}");
    println!("  api_key:        {plaintext}");
    println!();
    println!("⚠  This is the ONLY time the API key will be shown. Save it now.");
    println!("   To revoke or rotate later, use the admin UI (/admin/users).");
    Ok(())
}

async fn cmd_list(db: &tokio_rusqlite::Connection) -> anyhow::Result<()> {
    let admins = offivex_db::repo::admin_repo::AdminRepo::list(db).await?;
    if admins.is_empty() {
        println!("No admins found. Create one with: Offivex admin create --username <u> --password-stdin");
        return Ok(());
    }
    println!("{:<36}  {:<20}  {:<19}  {:<19}", "ID", "USERNAME", "CREATED", "LAST LOGIN");
    println!("{}", "-".repeat(100));
    for a in admins {
        let created = format_ts(a.created_at);
        let last = a
            .last_login_at
            .map(format_ts)
            .unwrap_or_else(|| "(never)".to_string());
        println!("{:<36}  {:<20}  {:<19}  {:<19}", a.id, a.username, created, last);
    }
    Ok(())
}

fn validate_password(password: &str) -> anyhow::Result<()> {
    if password.len() < 12 {
        anyhow::bail!("password must be at least 12 characters");
    }
    let has_letter = password.chars().any(|c| c.is_alphabetic());
    let has_digit = password.chars().any(|c| c.is_ascii_digit());
    if !has_letter || !has_digit {
        anyhow::bail!("password must contain at least one letter and one digit");
    }
    Ok(())
}

fn read_password_from_stdin() -> anyhow::Result<String> {
    let stdin = std::io::stdin();
    let mut handle = stdin.lock();
    // Detect TTY: if interactive, prompt; otherwise read piped input.
    if atty_is_terminal() {
        eprint!("Password: ");
        std::io::stderr().flush().ok();
        let mut line = String::new();
        handle.read_line(&mut line)?;
        Ok(line.trim_end_matches(&['\n', '\r'][..]).to_string())
    } else {
        let mut buf = String::new();
        handle.read_to_string(&mut buf)?;
        Ok(buf.trim_end_matches(&['\n', '\r'][..]).to_string())
    }
}

fn atty_is_terminal() -> bool {
    // Avoid the `atty` crate. On Windows, we treat input as a terminal when we cannot
    // confirm it's a pipe. Best-effort: use std::io::IsTerminal (stable 1.70+).
    use std::io::IsTerminal;
    std::io::stdin().is_terminal()
}

/// Format Unix timestamp as YYYY-MM-DD HH:MM:SS UTC. Manual conversion to avoid
/// pulling chrono into Offivex-server just for one display helper.
fn format_ts(ts: i64) -> String {
    // Civil date from days since 1970-01-01. Howard Hinnant's algorithm.
    let secs = ts.rem_euclid(86_400);
    let days = ts.div_euclid(86_400);

    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };

    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", year, month, day, h, m, s)
}
