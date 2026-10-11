// Soonest — The Meme Coin Ministry Desk. Tauri entry.
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
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            // SQLite at the app-data dir; calendar/posts/templates/settings live here.
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:soonest.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
