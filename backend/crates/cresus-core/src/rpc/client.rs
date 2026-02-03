use solana_sdk::{
    signature::Signature,
    transaction::Transaction,
};

use super::manager::{RpcError, RpcManager};

/// Send a transaction with retry across multiple RPC endpoints.
///
/// Each attempt runs the blocking RPC call on a dedicated thread via
/// `spawn_blocking` to avoid starving the tokio runtime.
pub async fn send_transaction_with_retry(
    mgr: &RpcManager,
    tx: &Transaction,
    max_retries: usize,
) -> Result<Signature, RpcError> {
    let mut last_err = RpcError::NoEndpoints;
    let tx = tx.clone();

    for attempt in 0..max_retries {
        let (client, ep) = if attempt == 0 {
            mgr.get_client_fast().await?
        } else {
            mgr.get_client().await?
        };

        let tx_clone = tx.clone();
        let result = tokio::task::spawn_blocking(move || {
            client.send_and_confirm_transaction(&tx_clone)
        })
        .await
        .map_err(|e| RpcError::Rpc(format!("spawn_blocking join: {}", e)))?;

        match result {
            Ok(sig) => {
                tracing::info!("Transaction {} confirmed via {}", sig, ep.name);
                return Ok(sig);
            }
            Err(e) => {
                tracing::warn!(
                    "Transaction failed on {} (attempt {}): {}",
                    ep.name,
                    attempt + 1,
                    e
                );
                last_err = RpcError::Rpc(e.to_string());
            }
        }
    }

    Err(last_err)
}

/// Get the SOL balance for a public key.
pub async fn get_balance(
    mgr: &RpcManager,
    pubkey: &solana_sdk::pubkey::Pubkey,
) -> Result<u64, RpcError> {
    let (client, _) = mgr.get_client().await?;
    let pubkey = *pubkey;
    tokio::task::spawn_blocking(move || {
        client.get_balance(&pubkey)
    })
    .await
    .map_err(|e| RpcError::Rpc(format!("spawn_blocking join: {}", e)))?
    .map_err(|e| RpcError::Rpc(e.to_string()))
}

/// Fetch the latest blockhash.
pub async fn get_latest_blockhash(
    mgr: &RpcManager,
) -> Result<solana_sdk::hash::Hash, RpcError> {
    let (client, _) = mgr.get_client().await?;
    tokio::task::spawn_blocking(move || {
        client.get_latest_blockhash()
    })
    .await
    .map_err(|e| RpcError::Rpc(format!("spawn_blocking join: {}", e)))?
    .map_err(|e| RpcError::Rpc(e.to_string()))
}
