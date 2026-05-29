use super::manager::{RpcError, RpcManager};

// NOTE — earlier versions exported `send_transaction_with_retry(tx, n)`. It
// is intentionally removed: a `Transaction` carries an immutable blockhash,
// which Solana invalidates after ~60 s. Retrying with the same `tx` was
// silently broken — the second attempt re-signed nothing and was rejected
// by the validator as "blockhash not found".
//
// The correct pattern is `crate::rpc::retry::with_retry(n, base_ms, ||
// async { let bh = client.get_latest_blockhash().await?; let tx =
// Transaction::new_signed_with_payer(&ixs, …, bh); client
// .send_and_confirm_transaction(&tx).await })`. Each closure invocation
// refetches a fresh blockhash, so retries are durable. See
// `crates/offivex-core/src/token/mint.rs::create_token` for the canonical
// usage.

/// Get the SOL balance for a public key.
pub async fn get_balance(
    mgr: &RpcManager,
    pubkey: &solana_sdk::pubkey::Pubkey,
) -> Result<u64, RpcError> {
    let (client, _) = mgr.get_client().await?;
    client
        .get_balance(pubkey)
        .await
        .map_err(|e| RpcError::Rpc(e.to_string()))
}

/// Fetch the latest blockhash.
pub async fn get_latest_blockhash(
    mgr: &RpcManager,
) -> Result<solana_sdk::hash::Hash, RpcError> {
    let (client, _) = mgr.get_client().await?;
    client
        .get_latest_blockhash()
        .await
        .map_err(|e| RpcError::Rpc(e.to_string()))
}
