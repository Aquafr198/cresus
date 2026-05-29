use tokio_rusqlite::Connection;
use crate::models::Task;
use crate::DbError;

pub struct TaskRepo;

impl TaskRepo {
    /// Insert a new task. Used both for vanity grinds (no `config_blob`)
    /// and for launch templates (Mint/Bundle/Pump-Fun) which set
    /// `config_blob` to the serialized launch payload.
    pub async fn create(conn: &Connection, task: Task) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO tasks (id, task_type, status, progress, result_json, error, config_blob, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    task.id, task.task_type, task.status, task.progress,
                    task.result_json, task.error, task.config_blob,
                    task.created_at, task.updated_at,
                ],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn update(
        conn: &Connection,
        id: String,
        status: String,
        progress: f64,
        result_json: Option<String>,
        error: Option<String>,
    ) -> Result<(), DbError> {
        let now = chrono::Utc::now().timestamp();
        conn.call(move |c| {
            c.execute(
                "UPDATE tasks SET status = ?1, progress = ?2, result_json = ?3, error = ?4, updated_at = ?5 WHERE id = ?6",
                rusqlite::params![status, progress, result_json, error, now, id],
            )?;
            Ok(())
        }).await?;
        Ok(())
    }

    pub async fn get_by_id(conn: &Connection, id: String) -> Result<Option<Task>, DbError> {
        let result = conn.call(move |c| {
            let r = c.query_row(
                "SELECT id, task_type, status, progress, result_json, error, config_blob, created_at, updated_at FROM tasks WHERE id = ?1",
                rusqlite::params![id],
                |row| Ok(Task {
                    id: row.get(0)?, task_type: row.get(1)?, status: row.get(2)?,
                    progress: row.get(3)?, result_json: row.get(4)?, error: row.get(5)?,
                    config_blob: row.get(6)?,
                    created_at: row.get(7)?, updated_at: row.get(8)?,
                }),
            );
            match r {
                Ok(v) => Ok(Some(v)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(tokio_rusqlite::Error::Rusqlite(e)),
            }
        }).await?;
        Ok(result)
    }

    /// List tasks filtered by `task_type`. Used by `/tasks` page (which
    /// only wants template rows, not vanity grind runtime state) and by
    /// the admin observability tools.
    pub async fn list_by_type(conn: &Connection, task_type: String) -> Result<Vec<Task>, DbError> {
        let result = conn.call(move |c| {
            let mut stmt = c.prepare(
                "SELECT id, task_type, status, progress, result_json, error, config_blob, created_at, updated_at
                 FROM tasks WHERE task_type = ?1 ORDER BY created_at DESC"
            )?;
            let rows = stmt.query_map(rusqlite::params![task_type], |row| Ok(Task {
                id: row.get(0)?, task_type: row.get(1)?, status: row.get(2)?,
                progress: row.get(3)?, result_json: row.get(4)?, error: row.get(5)?,
                config_blob: row.get(6)?,
                created_at: row.get(7)?, updated_at: row.get(8)?,
            }))?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        }).await?;
        Ok(result)
    }

    /// List all launch templates (the three template task_types) in a
    /// single query. Used by the `/tasks` page index.
    pub async fn list_templates(conn: &Connection) -> Result<Vec<Task>, DbError> {
        let result = conn.call(|c| {
            let mut stmt = c.prepare(
                "SELECT id, task_type, status, progress, result_json, error, config_blob, created_at, updated_at
                 FROM tasks
                 WHERE task_type IN ('mint_template', 'bundle_template', 'pump_fun_template')
                 ORDER BY created_at DESC"
            )?;
            let rows = stmt.query_map([], |row| Ok(Task {
                id: row.get(0)?, task_type: row.get(1)?, status: row.get(2)?,
                progress: row.get(3)?, result_json: row.get(4)?, error: row.get(5)?,
                config_blob: row.get(6)?,
                created_at: row.get(7)?, updated_at: row.get(8)?,
            }))?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        }).await?;
        Ok(result)
    }

    /// Delete a task by id. Used by the user "delete template" action.
    pub async fn delete(conn: &Connection, id: String) -> Result<bool, DbError> {
        let deleted = conn.call(move |c| {
            let count = c.execute("DELETE FROM tasks WHERE id = ?1", rusqlite::params![id])?;
            Ok(count > 0)
        }).await?;
        Ok(deleted)
    }
}
