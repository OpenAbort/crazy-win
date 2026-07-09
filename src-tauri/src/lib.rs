mod libs;

use libs::io::env_vars::EnvVars;
use libs::io::hosts_file::HostsFile;

/// Read the raw contents of the system hosts file.
#[tauri::command]
fn read_hosts() -> Result<String, String> {
    HostsFile::new().read().map_err(|e| e.to_string())
}

/// Overwrite the system hosts file with `content`.
#[tauri::command]
fn write_hosts(content: String) -> Result<(), String> {
    HostsFile::new().write(&content).map_err(|e| match e.kind() {
        std::io::ErrorKind::PermissionDenied => {
            "Permission denied. Run the app as administrator to edit the hosts file.".to_string()
        }
        _ => e.to_string(),
    })
}

/// Write `content` to an arbitrary backup path chosen by the user.
/// Content-agnostic (plain `fs::write`), shared by the hosts and env editors.
#[tauri::command]
fn export_text_backup(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

/// Read all env vars for `scope` ("user" | "system"), serialized as sorted
/// `NAME=VALUE` lines for stable diffing/rendering.
#[tauri::command]
fn read_env_vars(scope: String) -> Result<String, String> {
    let vars = EnvVars::read(&scope)?;
    Ok(vars
        .into_iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("\n"))
}

/// Parse `content` (NAME=VALUE lines) and write the diff to the registry for `scope`.
#[tauri::command]
fn write_env_vars(scope: String, content: String) -> Result<(), String> {
    let desired: Vec<(String, String)> = content
        .lines()
        .filter_map(|line| {
            if line.trim().is_empty() {
                return None;
            }
            let (name, value) = line.split_once('=')?;
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            Some((name.to_string(), value.to_string()))
        })
        .collect();

    EnvVars::write(&scope, &desired)?;
    broadcast_env_change();
    Ok(())
}

/// Notify other processes that the environment changed, so newly-launched
/// processes (not already-running ones) pick up the new values without a logoff.
fn broadcast_env_change() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };
    let param: Vec<u16> = "Environment\0".encode_utf16().collect();
    unsafe {
        let mut result: usize = 0;
        SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0,
            param.as_ptr() as isize,
            SMTO_ABORTIFHUNG,
            5000,
            &mut result,
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_hosts,
            write_hosts,
            export_text_backup,
            read_env_vars,
            write_env_vars
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
