use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;

use super::metadata::find_metadata_pda;

#[derive(Debug, Clone, serde::Serialize)]
pub struct TokenInfo {
    pub mint_address: String,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub supply: u64,
    pub uri: String,
}

/// Fetch on-chain token info (mint data + metadata) for cloning.
pub fn fetch_token_info(client: &RpcClient, mint_address: &str) -> Result<TokenInfo, String> {
    let mint_pubkey: Pubkey = mint_address
        .parse()
        .map_err(|e| format!("Invalid mint address: {}", e))?;

    // Fetch mint account to get decimals and supply
    let mint_data = client
        .get_account(&mint_pubkey)
        .map_err(|e| format!("Failed to fetch mint account: {}", e))?;

    if mint_data.data.len() < 82 {
        return Err("Mint account data too small".into());
    }

    // SPL Token Mint layout: 36 bytes mint_authority, 8 bytes supply, 1 byte decimals
    let decimals = mint_data.data[44];
    let supply = u64::from_le_bytes(
        mint_data.data[36..44]
            .try_into()
            .map_err(|_| "Failed to parse supply")?,
    );

    // Fetch metadata PDA
    let metadata_pda = find_metadata_pda(&mint_pubkey);
    let metadata_account = client
        .get_account(&metadata_pda)
        .map_err(|e| format!("Failed to fetch metadata: {}", e))?;

    // Parse metadata account data (simplified — extract name, symbol, uri)
    let (name, symbol, uri) = parse_metadata_data(&metadata_account.data)?;

    Ok(TokenInfo {
        mint_address: mint_address.to_string(),
        name,
        symbol,
        decimals,
        supply,
        uri,
    })
}

/// Parse the Metaplex metadata account data to extract name, symbol, and URI.
fn parse_metadata_data(data: &[u8]) -> Result<(String, String, String), String> {
    if data.len() < 10 {
        return Err("Metadata account too small".into());
    }

    // Metadata account layout:
    // 1 byte key, 32 bytes update_authority, 32 bytes mint
    // then Data: name(4+len), symbol(4+len), uri(4+len), ...
    let mut offset = 1 + 32 + 32;

    let name = read_borsh_string(data, &mut offset)?;
    let symbol = read_borsh_string(data, &mut offset)?;
    let uri = read_borsh_string(data, &mut offset)?;

    // Trim null bytes (Metaplex pads with nulls)
    Ok((
        name.trim_end_matches('\0').to_string(),
        symbol.trim_end_matches('\0').to_string(),
        uri.trim_end_matches('\0').to_string(),
    ))
}

fn read_borsh_string(data: &[u8], offset: &mut usize) -> Result<String, String> {
    if *offset + 4 > data.len() {
        return Err("Unexpected end of metadata".into());
    }
    let len = u32::from_le_bytes(
        data[*offset..*offset + 4]
            .try_into()
            .map_err(|_| "Bad string length")?,
    ) as usize;
    *offset += 4;

    if *offset + len > data.len() {
        return Err("String length exceeds data".into());
    }
    let s = String::from_utf8_lossy(&data[*offset..*offset + len]).to_string();
    *offset += len;
    Ok(s)
}
