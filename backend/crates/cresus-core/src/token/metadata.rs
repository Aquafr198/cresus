use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    system_program,
    sysvar,
};

/// Build a CreateMetadataAccountV3 instruction for Metaplex Token Metadata.
pub fn create_metadata_instruction(
    payer: &Pubkey,
    mint: &Pubkey,
    mint_authority: &Pubkey,
    name: &str,
    symbol: &str,
    uri: &str,
) -> Instruction {
    let metadata_program_id: Pubkey = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        .parse()
        .unwrap();

    let metadata_account = find_metadata_pda(mint);

    // Serialize the CreateMetadataAccountV3 instruction data
    let data = serialize_create_metadata_v3(name, symbol, uri);

    Instruction {
        program_id: metadata_program_id,
        accounts: vec![
            AccountMeta::new(metadata_account, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(*mint_authority, true),
            AccountMeta::new(*payer, true),
            AccountMeta::new_readonly(*mint_authority, false),
            AccountMeta::new_readonly(system_program::id(), false),
            AccountMeta::new_readonly(sysvar::rent::id(), false),
        ],
        data,
    }
}

/// Derive the metadata PDA for a mint.
pub fn find_metadata_pda(mint: &Pubkey) -> Pubkey {
    let metadata_program_id: Pubkey = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        .parse()
        .unwrap();
    let seeds = &[
        b"metadata".as_ref(),
        metadata_program_id.as_ref(),
        mint.as_ref(),
    ];
    Pubkey::find_program_address(seeds, &metadata_program_id).0
}

/// Serialize CreateMetadataAccountV3 instruction data.
/// Format: discriminator(1) + DataV2(borsh) + is_mutable(bool) + collection_details(option)
fn serialize_create_metadata_v3(name: &str, symbol: &str, uri: &str) -> Vec<u8> {
    let mut data = Vec::new();

    // Discriminator for CreateMetadataAccountV3 = 33
    data.push(33);

    // DataV2 struct (borsh serialized):
    // name: String
    borsh_write_string(&mut data, name);
    // symbol: String
    borsh_write_string(&mut data, symbol);
    // uri: String
    borsh_write_string(&mut data, uri);
    // seller_fee_basis_points: u16
    data.extend_from_slice(&0u16.to_le_bytes());
    // creators: Option<Vec<Creator>> = None
    data.push(0);
    // collection: Option<Collection> = None
    data.push(0);
    // uses: Option<Uses> = None
    data.push(0);

    // is_mutable: bool = true
    data.push(1);

    // collection_details: Option<CollectionDetails> = None
    data.push(0);

    data
}

fn borsh_write_string(buf: &mut Vec<u8>, s: &str) {
    let bytes = s.as_bytes();
    buf.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    buf.extend_from_slice(bytes);
}
