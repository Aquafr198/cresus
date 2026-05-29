use tokio_rusqlite::Connection;
use offivex_db::models::*;
use offivex_db::repo::wallet_repo::WalletRepo;
use offivex_db::repo::distribution_repo::DistributionRepo;
use offivex_db::repo::bundle_repo::BundleRepo;
use offivex_db::repo::rpc_repo::RpcRepo;

/// Create an in-memory database with all migrations applied.
async fn test_db() -> Connection {
    let conn = Connection::open_in_memory().await.unwrap();
    conn.call(|c| {
        c.execute_batch("PRAGMA foreign_keys=ON;")?;
        c.execute_batch(include_str!("../migrations/001_create_wallets.sql"))?;
        c.execute_batch(include_str!("../migrations/002_create_tokens.sql"))?;
        c.execute_batch(include_str!("../migrations/003_create_bundles.sql"))?;
        c.execute_batch(include_str!("../migrations/004_create_meme_library.sql"))?;
        c.execute_batch(include_str!("../migrations/005_create_tasks.sql"))?;
        c.execute_batch(include_str!("../migrations/006_create_distributions.sql"))?;
        c.execute_batch(include_str!("../migrations/007_create_profiles.sql"))?;
        c.execute_batch(include_str!("../migrations/008_add_indexes.sql"))?;
        Ok(())
    })
    .await
    .unwrap();
    conn
}

fn make_wallet(id: &str) -> Wallet {
    Wallet {
        id: id.to_string(),
        name: Some(format!("Test Wallet {}", id)),
        public_key: format!("pubkey_{}", id),
        encrypted_secret: vec![1, 2, 3],
        nonce: vec![4, 5, 6],
        group_id: None,
        parent_id: None,
        derivation_index: None,
        created_at: 1700000000,
    }
}

#[tokio::test]
async fn wallet_crud() {
    let db = test_db().await;

    // Create
    WalletRepo::create(&db, make_wallet("w1")).await.unwrap();

    // Read
    let w = WalletRepo::get_by_id(&db, "w1".to_string()).await.unwrap();
    assert!(w.is_some());
    let w = w.unwrap();
    assert_eq!(w.public_key, "pubkey_w1");

    // List
    let all = WalletRepo::list_all(&db).await.unwrap();
    assert_eq!(all.len(), 1);

    // Delete
    let deleted = WalletRepo::delete(&db, "w1".to_string()).await.unwrap();
    assert!(deleted);
    let w = WalletRepo::get_by_id(&db, "w1".to_string()).await.unwrap();
    assert!(w.is_none());
}

#[tokio::test]
async fn wallet_not_found() {
    let db = test_db().await;
    let w = WalletRepo::get_by_id(&db, "nonexistent".to_string()).await.unwrap();
    assert!(w.is_none());
}

#[tokio::test]
async fn distribution_lifecycle() {
    let db = test_db().await;

    // Create source wallet (required by FK constraint)
    WalletRepo::create(&db, make_wallet("src_wallet")).await.unwrap();

    // Create distribution
    let dist = Distribution {
        id: "dist1".to_string(),
        source_wallet_id: "src_wallet".to_string(),
        strategy: "direct".to_string(),
        status: "planned".to_string(),
        total_sol: 1_000_000_000,
        config_json: "{}".to_string(),
        result_json: None,
        error_message: None,
        created_at: 1700000000,
        executed_at: None,
    };
    DistributionRepo::create(&db, dist).await.unwrap();

    // Create transfers
    for i in 0..3 {
        let t = DistributionTransfer {
            id: format!("t{}", i),
            distribution_id: "dist1".to_string(),
            from_wallet_id: "src_wallet".to_string(),
            to_wallet_id: format!("target_{}", i),
            amount_lamports: 333_333_333,
            hop_index: 0,
            delay_ms: 0,
            status: "pending".to_string(),
            tx_signature: None,
            error_message: None,
            executed_at: None,
        };
        DistributionRepo::create_transfer(&db, t).await.unwrap();
    }

    // List transfers
    let transfers = DistributionRepo::list_transfers(&db, "dist1".to_string()).await.unwrap();
    assert_eq!(transfers.len(), 3);

    // Update status
    DistributionRepo::update_status(
        &db, "dist1".to_string(), "executing".to_string(), None, None, None,
    ).await.unwrap();

    let dist = DistributionRepo::get_by_id(&db, "dist1".to_string()).await.unwrap().unwrap();
    assert_eq!(dist.status, "executing");

    // Update transfer status
    DistributionRepo::update_transfer_status(
        &db, "t0".to_string(), "completed".to_string(), Some("sig123".to_string()), None, Some(1700000100),
    ).await.unwrap();

    DistributionRepo::update_transfer_status(
        &db, "t1".to_string(), "failed".to_string(), None, Some("timeout".to_string()), Some(1700000200),
    ).await.unwrap();

    // Reset failed transfers
    let reset = DistributionRepo::reset_failed_transfers(&db, "dist1".to_string()).await.unwrap();
    assert_eq!(reset, 1);

    let transfers = DistributionRepo::list_transfers(&db, "dist1".to_string()).await.unwrap();
    let t1 = transfers.iter().find(|t| t.id == "t1").unwrap();
    assert_eq!(t1.status, "pending");
    assert!(t1.error_message.is_none());
}

#[tokio::test]
async fn bundle_persistence() {
    let db = test_db().await;

    let bundle = Bundle {
        id: "b1".to_string(),
        token_id: None,
        config_json: r#"{"test": true}"#.to_string(),
        status: "submitted".to_string(),
        jito_bundle_id: Some("jito_123".to_string()),
        market_address: Some("market_abc".to_string()),
        pool_address: Some("pool_xyz".to_string()),
        tx_signatures: None,
        error_message: None,
        created_at: 1700000000,
        executed_at: Some(1700000100),
    };
    BundleRepo::create(&db, bundle).await.unwrap();

    let retrieved = BundleRepo::get_by_id(&db, "b1".to_string()).await.unwrap();
    assert!(retrieved.is_some());
    let b = retrieved.unwrap();
    assert_eq!(b.status, "submitted");
    assert_eq!(b.jito_bundle_id, Some("jito_123".to_string()));

    let all = BundleRepo::list_all(&db).await.unwrap();
    assert_eq!(all.len(), 1);
}

#[tokio::test]
async fn rpc_endpoint_management() {
    let db = test_db().await;

    let ep = RpcEndpoint {
        id: "rpc1".to_string(),
        name: "Helius".to_string(),
        url: "https://rpc.helius.xyz".to_string(),
        ws_url: Some("wss://rpc.helius.xyz".to_string()),
        weight: 10,
        is_active: 1,
        last_latency_ms: None,
        created_at: 1700000000,
    };
    RpcRepo::create(&db, ep).await.unwrap();

    // List active
    let active = RpcRepo::list_active(&db).await.unwrap();
    assert_eq!(active.len(), 1);

    // Toggle inactive
    RpcRepo::set_active(&db, "rpc1".to_string(), false).await.unwrap();
    let active = RpcRepo::list_active(&db).await.unwrap();
    assert_eq!(active.len(), 0);

    // List all still shows it
    let all = RpcRepo::list_all(&db).await.unwrap();
    assert_eq!(all.len(), 1);

    // Update latency
    RpcRepo::update_latency(&db, "rpc1".to_string(), 42).await.unwrap();

    // Delete
    let deleted = RpcRepo::delete(&db, "rpc1".to_string()).await.unwrap();
    assert!(deleted);
    let all = RpcRepo::list_all(&db).await.unwrap();
    assert_eq!(all.len(), 0);
}

#[tokio::test]
async fn migrations_are_idempotent() {
    let db = test_db().await;
    // Running migrations again should not fail (CREATE TABLE IF NOT EXISTS)
    db.call(|c| {
        c.execute_batch(include_str!("../migrations/001_create_wallets.sql"))?;
        c.execute_batch(include_str!("../migrations/002_create_tokens.sql"))?;
        c.execute_batch(include_str!("../migrations/003_create_bundles.sql"))?;
        Ok(())
    })
    .await
    .unwrap();
}
