mod libs;

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
#[tauri::command]
fn export_hosts_backup(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_hosts,
            write_hosts,
            export_hosts_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
