use tokio_rusqlite::Connection;
use crate::models::Token;
use crate::DbError;

pub struct TokenRepo;

impl TokenRepo {
    pub async fn create(conn: &Connection, token: Token) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO tokens (id, mint_address, name, symbol, decimals, supply, metadata_uri, creator_wallet_id, tx_signature, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![
                    token.id, token.mint_address, token.name, token.symbol,
                    token.decimals, token.supply, token.metadata_uri,
                    token.creator_wallet_id, token.tx_signature, token.created_at,
                ],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    /// Lookup by on-chain mint address. Returns `None` if no row matches.
    pub async fn get_by_mint(
        conn: &Connection,
        mint_address: String,
    ) -> Result<Option<Token>, DbError> {
        let token = conn
            .call(move |c| {
                let mut stmt = c.prepare(
                    "SELECT id, mint_address, name, symbol, decimals, supply, metadata_uri, creator_wallet_id, tx_signature, created_at
                     FROM tokens WHERE mint_address = ?1",
                )?;
                Ok(stmt
                    .query_row(rusqlite::params![mint_address], |row| {
                        Ok(Token {
                            id: row.get(0)?,
                            mint_address: row.get(1)?,
                            name: row.get(2)?,
                            symbol: row.get(3)?,
                            decimals: row.get(4)?,
                            supply: row.get(5)?,
                            metadata_uri: row.get(6)?,
                            creator_wallet_id: row.get(7)?,
                            tx_signature: row.get(8)?,
                            created_at: row.get(9)?,
                        })
                    })
                    .ok())
            })
            .await?;
        Ok(token)
    }

    pub async fn list_all(conn: &Connection) -> Result<Vec<Token>, DbError> {
        let tokens = conn.call(|c| {
            let mut stmt = c.prepare(
                "SELECT id, mint_address, name, symbol, decimals, supply, metadata_uri, creator_wallet_id, tx_signature, created_at
                 FROM tokens ORDER BY created_at DESC"
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(Token {
                    id: row.get(0)?, mint_address: row.get(1)?, name: row.get(2)?,
                    symbol: row.get(3)?, decimals: row.get(4)?, supply: row.get(5)?,
                    metadata_uri: row.get(6)?, creator_wallet_id: row.get(7)?,
                    tx_signature: row.get(8)?, created_at: row.get(9)?,
                })
            })?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        }).await?;
        Ok(tokens)
    }
}
