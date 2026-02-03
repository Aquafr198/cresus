use tokio_rusqlite::Connection;
use crate::models::Task;
use crate::DbError;

pub struct TaskRepo;

impl TaskRepo {
    pub async fn create(conn: &Connection, task: Task) -> Result<(), DbError> {
        conn.call(move |c| {
            c.execute(
                "INSERT INTO tasks (id, task_type, status, progress, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![task.id, task.task_type, task.status, task.progress, task.created_at, task.updated_at],
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
                "SELECT id, task_type, status, progress, result_json, error, created_at, updated_at FROM tasks WHERE id = ?1",
                rusqlite::params![id],
                |row| Ok(Task {
                    id: row.get(0)?, task_type: row.get(1)?, status: row.get(2)?,
                    progress: row.get(3)?, result_json: row.get(4)?, error: row.get(5)?,
                    created_at: row.get(6)?, updated_at: row.get(7)?,
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
}
