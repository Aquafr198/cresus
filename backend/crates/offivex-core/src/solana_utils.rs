//! Shared Solana utility functions and program ID constants.

use std::sync::LazyLock;

use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
};

/// Associated Token Account program ID.
pub static ATA_PROGRAM_ID: LazyLock<Pubkey> = LazyLock::new(|| {
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        .parse()
        .unwrap()
});

/// Raydium AMM v4 program ID (mainnet).
pub static RAYDIUM_AMM_PROGRAM: LazyLock<Pubkey> = LazyLock::new(|| {
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
        .parse()
        .unwrap()
});

/// OpenBook DEX v1 program ID (mainnet).
pub static OPENBOOK_DEX_PROGRAM: LazyLock<Pubkey> = LazyLock::new(|| {
    "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
        .parse()
        .unwrap()
});

/// Wrapped SOL mint address.
pub static WSOL_MINT_PUBKEY: LazyLock<Pubkey> = LazyLock::new(|| {
    "So11111111111111111111111111111111111111112"
        .parse()
        .unwrap()
});

/// Compute the Associated Token Account address for a wallet + mint.
pub fn compute_ata(wallet: &Pubkey, mint: &Pubkey) -> Pubkey {
    let token_program_id = spl_token::id();
    Pubkey::find_program_address(
        &[wallet.as_ref(), token_program_id.as_ref(), mint.as_ref()],
        &ATA_PROGRAM_ID,
    )
    .0
}

/// Build an idempotent create-ATA instruction (won't fail if ATA already exists).
///
/// Uses the `CreateIdempotent` discriminant (byte `1`).
pub fn build_create_ata_idempotent(
    payer: &Pubkey,
    owner: &Pubkey,
    mint: &Pubkey,
) -> Instruction {
    let ata = compute_ata(owner, mint);
    Instruction {
        program_id: *ATA_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(ata, false),
            AccountMeta::new_readonly(*owner, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(solana_sdk::system_program::id(), false),
            AccountMeta::new_readonly(spl_token::id(), false),
        ],
        data: vec![1], // CreateIdempotent
    }
}
