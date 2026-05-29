use tokio_rusqlite::Connection;
use crate::models::Plan;
use crate::DbError;

pub struct PlanRepo;

impl PlanRepo {
    pub async fn list_active(conn: &Connection) -> Result<Vec<Plan>, DbError> {
        let result = conn
            .call(|c| {
                let mut stmt = c.prepare(
                    "SELECT id, slug, name, price_usd_cents, duration_days, features_json, is_active, created_at
                     FROM plans WHERE is_active = 1 ORDER BY price_usd_cents ASC",
                )?;
                let rows = stmt
                    .query_map([], |r| {
                        Ok(Plan {
                            id: r.get(0)?,
                            slug: r.get(1)?,
                            name: r.get(2)?,
                            price_usd_cents: r.get(3)?,
                            duration_days: r.get(4)?,
                            features_json: r.get(5)?,
                            is_active: r.get(6)?,
                            created_at: r.get(7)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    /// List ALL plans (active + inactive). Used by billing/history views that
    /// must resolve plan names for historical payments on now-deactivated plans.
    pub async fn list_all(conn: &Connection) -> Result<Vec<Plan>, DbError> {
        let result = conn
            .call(|c| {
                let mut stmt = c.prepare(
                    "SELECT id, slug, name, price_usd_cents, duration_days, features_json, is_active, created_at
                     FROM plans ORDER BY price_usd_cents ASC",
                )?;
                let rows = stmt
                    .query_map([], |r| {
                        Ok(Plan {
                            id: r.get(0)?,
                            slug: r.get(1)?,
                            name: r.get(2)?,
                            price_usd_cents: r.get(3)?,
                            duration_days: r.get(4)?,
                            features_json: r.get(5)?,
                            is_active: r.get(6)?,
                            created_at: r.get(7)?,
                        })
                    })?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await?;
        Ok(result)
    }

    pub async fn get_by_slug(conn: &Connection, slug: &str) -> Result<Option<Plan>, DbError> {
        let slug = slug.to_string();
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(
                        "SELECT id, slug, name, price_usd_cents, duration_days, features_json, is_active, created_at
                         FROM plans WHERE slug = ?1",
                        rusqlite::params![slug],
                        |r| {
                            Ok(Plan {
                                id: r.get(0)?,
                                slug: r.get(1)?,
                                name: r.get(2)?,
                                price_usd_cents: r.get(3)?,
                                duration_days: r.get(4)?,
                                features_json: r.get(5)?,
                                is_active: r.get(6)?,
                                created_at: r.get(7)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    pub async fn get_by_id(conn: &Connection, id: &str) -> Result<Option<Plan>, DbError> {
        let id = id.to_string();
        let result = conn
            .call(move |c| {
                let row = c
                    .query_row(
                        "SELECT id, slug, name, price_usd_cents, duration_days, features_json, is_active, created_at
                         FROM plans WHERE id = ?1",
                        rusqlite::params![id],
                        |r| {
                            Ok(Plan {
                                id: r.get(0)?,
                                slug: r.get(1)?,
                                name: r.get(2)?,
                                price_usd_cents: r.get(3)?,
                                duration_days: r.get(4)?,
                                features_json: r.get(5)?,
                                is_active: r.get(6)?,
                                created_at: r.get(7)?,
                            })
                        },
                    )
                    .ok();
                Ok(row)
            })
            .await?;
        Ok(result)
    }

    pub async fn update(
        conn: &Connection,
        id: &str,
        name: &str,
        price_usd_cents: i64,
        duration_days: i64,
        is_active: bool,
    ) -> Result<(), DbError> {
        let id = id.to_string();
        let name = name.to_string();
        let is_active_i = if is_active { 1 } else { 0 };
        conn.call(move |c| {
            c.execute(
                "UPDATE plans SET name = ?1, price_usd_cents = ?2, duration_days = ?3, is_active = ?4
                 WHERE id = ?5",
                rusqlite::params![name, price_usd_cents, duration_days, is_active_i, id],
            )?;
            Ok(())
        })
        .await?;
        Ok(())
    }
}
