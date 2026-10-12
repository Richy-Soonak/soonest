// Soonest — The Meme Coin Ministry Desk. Tauri entry.
mod secrets;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_posts",
            sql: "CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pillar TEXT NOT NULL,
                scheduled_at TEXT NOT NULL,
                content TEXT NOT NULL,
                status TEXT DEFAULT 'draft',
                posted_at TEXT,
                platform TEXT DEFAULT 'x',
                media_url TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_templates",
            sql: "CREATE TABLE IF NOT EXISTS templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                pillar TEXT NOT NULL,
                default_time TEXT NOT NULL,
                default_days TEXT,
                default_content TEXT,
                enabled INTEGER DEFAULT 1
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_settings",
            sql: "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_metrics_cache",
            sql: "CREATE TABLE IF NOT EXISTS metrics_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                price REAL,
                volume_24h REAL,
                holders INTEGER,
                lp_locked_pct REAL,
                fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
            );",
            kind: MigrationKind::Up,
        },
        // --- scheduler data model (issue #3) ---
        // one statement per migration: sqlx prepares strings as a single
        // statement, so multi-statement SQL is not safe here
        Migration {
            version: 5,
            description: "posts_add_next_attempt_at",
            sql: "ALTER TABLE posts ADD COLUMN next_attempt_at TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "posts_add_last_error",
            sql: "ALTER TABLE posts ADD COLUMN last_error TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "posts_add_attempt_count",
            sql: "ALTER TABLE posts ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_publish_attempts",
            sql: "CREATE TABLE IF NOT EXISTS publish_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                post_id INTEGER NOT NULL,
                channel TEXT NOT NULL,
                ok INTEGER NOT NULL,
                error TEXT,
                provider_message_id INTEGER,
                attempted_at TEXT DEFAULT CURRENT_TIMESTAMP
            );",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(
            // SQLite at the app-data dir; calendar/posts/templates/settings live here.
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:soonest.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            secrets::creds_load,
            secrets::creds_save
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
