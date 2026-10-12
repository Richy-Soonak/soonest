// Secrets at rest — OS keychain (issue #1).
//
// Design (per the review's suggested fix):
//   - SECRET_KEYS (TG token, 4 X secrets, OpenRouter key) live as macOS
//     Keychain items (libsecret on Linux, Credential Manager on Windows)
//     under service "com.richysoonak.soonest", one item per key.
//   - Non-secret config (chat ID, model name, RPC URL) stays in a small JSON
//     file next to where credentials.json used to be.
//   - Migration is automatic: if the legacy plaintext store file exists on
//     first load, its values are moved to the keychain/config, the file is
//     overwritten with zeros, then deleted (plaintext deletion leaves
//     residual bytes on APFS — zeroing first, per the issue).
//   - An in-memory cache means the keychain is hit once per launch per secret,
//     minimizing access prompts while the dev binary's ad-hoc signature
//     changes between rebuilds.

use keyring::Entry;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

const SERVICE: &str = "com.richysoonak.soonest";
const LEGACY_FILE: &str = "credentials.json";
const CONFIG_FILE: &str = "credentials.config.json";

const SECRET_KEYS: [&str; 6] = [
    "tg_token",
    "or_key",
    "x_consumer_key",
    "x_consumer_secret",
    "x_access_token",
    "x_access_secret",
];

fn is_secret(key: &str) -> bool {
    SECRET_KEYS.contains(&key)
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app data dir unavailable: {e}"))
}

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| format!("keyring entry for \"{key}\": {e}"))
}

fn cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn secret_get(key: &str) -> Result<Option<String>, String> {
    if let Some(hit) = cache().lock().expect("secrets cache").get(key) {
        return Ok(Some(hit.clone()));
    }
    match entry(key)?.get_password() {
        Ok(v) => {
            cache()
                .lock()
                .expect("secrets cache")
                .insert(key.to_string(), v.clone());
            Ok(Some(v))
        }
        // absent item is not an error — the credential simply isn't set
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain read for \"{key}\": {e}")),
    }
}

fn secret_set(key: &str, value: &str) -> Result<(), String> {
    let e = entry(key)?;
    // upsert: set_password replaces an existing item's data on macOS
    if let Err(keyring::Error::NoEntry) = e.get_password() {
        e.set_password(value)
            .map_err(|err| format!("keychain create for \"{key}\": {err}"))?;
    } else {
        e.set_password(value)
            .map_err(|err| format!("keychain update for \"{key}\": {err}"))?;
    }
    cache()
        .lock()
        .expect("secrets cache")
        .insert(key.to_string(), value.to_string());
    Ok(())
}

fn secret_delete(key: &str) -> Result<(), String> {
    cache().lock().expect("secrets cache").remove(key);
    match entry(key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("keychain delete for \"{key}\": {e}")),
    }
}

fn read_config(app: &tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    let path = data_dir(app)?.join(CONFIG_FILE);
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let txt = fs::read_to_string(&path).map_err(|e| format!("read config: {e}"))?;
    serde_json::from_str(&txt).map_err(|e| format!("parse config: {e}"))
}

fn write_config(app: &tauri::AppHandle, config: &HashMap<String, String>) -> Result<(), String> {
    let dir = data_dir(app)?;
    let path = dir.join(CONFIG_FILE);
    let txt = serde_json::to_string_pretty(config).map_err(|e| format!("encode config: {e}"))?;
    fs::write(&path, txt).map_err(|e| format!("write config: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Migrate the legacy plaintext store file: secrets → keychain, config →
/// config file, then zero the file's bytes and delete it. Idempotent —
/// a no-op when the file is gone (i.e. after the first successful run).
fn migrate_legacy(app: &tauri::AppHandle) -> Result<(), String> {
    let legacy = data_dir(app)?.join(LEGACY_FILE);
    if !legacy.exists() {
        return Ok(());
    }
    let txt = fs::read_to_string(&legacy).unwrap_or_default();
    let mut config = read_config(app)?;
    if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&txt) {
        for (k, v) in map {
            if v.is_empty() {
                continue;
            }
            if is_secret(&k) {
                secret_set(&k, &v)?;
            } else {
                config.insert(k, v);
            }
        }
    }
    write_config(app, &config)?;
    // zero the bytes before unlinking — the file held plaintext secrets
    let len = fs::metadata(&legacy).map(|m| m.len()).unwrap_or(0);
    let _ = fs::write(&legacy, vec![0u8; len as usize]);
    fs::remove_file(&legacy).map_err(|e| format!("remove legacy credentials: {e}"))?;
    Ok(())
}

/// Full credential map: config file values + keychain secrets, merged.
/// The frontend merges this over its EMPTY defaults, so absent keys
/// behave exactly like the old empty-string values.
#[tauri::command]
pub fn creds_load(app: tauri::AppHandle) -> Result<HashMap<String, String>, String> {
    // migration failure is fatal for this call: better a visible error in
    // Settings than silently continuing with secrets still on disk
    migrate_legacy(&app)?;
    let mut out = read_config(&app)?;
    for k in SECRET_KEYS {
        if let Some(v) = secret_get(k)? {
            if !v.is_empty() {
                out.insert(k.to_string(), v);
            }
        }
    }
    Ok(out)
}

/// Merge-save: only the provided keys are touched. Secrets go to the
/// keychain (empty string deletes the item), the rest to the config file.
#[tauri::command]
pub fn creds_save(app: tauri::AppHandle, values: HashMap<String, String>) -> Result<(), String> {
    let mut config = read_config(&app)?;
    for (k, v) in values {
        let v = v.trim().to_string();
        if is_secret(&k) {
            if v.is_empty() {
                secret_delete(&k)?;
            } else {
                secret_set(&k, &v)?;
            }
        } else {
            config.insert(k, v);
        }
    }
    write_config(&app, &config)
}
