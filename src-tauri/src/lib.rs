// Soonest — The Meme Coin Ministry Desk. Tauri entry.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            // SQLite at the app-data dir; calendar/posts/templates/settings live here.
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:soonest.db",
                    vec![],
                )
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
