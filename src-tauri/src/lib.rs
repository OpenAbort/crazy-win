mod libs;

use libs::api::docker_api::DockerApi;
use libs::api::k8s_api::K8sApi;
use libs::cli::docker::Docker;
use libs::cli::helm::Helm;
use libs::cli::kubectl::Kubectl;
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

/// Runs a blocking closure on the async runtime's blocking thread pool, so slow
/// subprocess calls (docker/kubectl/helm can take many seconds, e.g. against an
/// unreachable host) never block the thread that pumps the webview's event loop
/// and freeze the whole window.
async fn off_main_thread<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

// --- Docker ---
// `mode` is "cli" (shell out to docker.exe) or "api" (direct Engine API over
// reqwest, no docker.exe required). The API path is already async/non-blocking,
// so it isn't routed through `off_main_thread`.

#[tauri::command]
async fn docker_list_containers(host: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => DockerApi::list_containers(&host).await,
        _ => off_main_thread(move || Docker::list_containers(&host)).await,
    }
}

#[tauri::command]
async fn docker_inspect_container(host: String, id: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => DockerApi::inspect_container(&host, &id).await,
        _ => off_main_thread(move || Docker::inspect_container(&host, &id)).await,
    }
}

#[tauri::command]
async fn docker_container_logs(host: String, id: String, tail: Option<u32>, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => DockerApi::container_logs(&host, &id, tail).await,
        _ => off_main_thread(move || Docker::container_logs(&host, &id, tail)).await,
    }
}

#[tauri::command]
async fn docker_remove_container(host: String, id: String, force: bool, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "api" => DockerApi::remove_container(&host, &id, force).await,
        _ => off_main_thread(move || Docker::remove_container(&host, &id, force)).await,
    }
}

#[tauri::command]
async fn docker_info(host: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => DockerApi::info(&host).await,
        _ => off_main_thread(move || Docker::info(&host)).await,
    }
}

// --- Kubernetes ---
// Same `mode` convention. "api" mode reads the local kubeconfig directly and
// talks to the API server via reqwest; it only supports client-cert/bearer-token
// auth (not exec-based cloud CLI plugins) — see kubeconfig::resolve_context.

#[tauri::command]
async fn kube_list_contexts(mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => off_main_thread(K8sApi::list_contexts).await,
        _ => off_main_thread(Kubectl::list_contexts).await,
    }
}

#[tauri::command]
async fn kube_current_context(mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => off_main_thread(K8sApi::current_context).await,
        _ => off_main_thread(Kubectl::current_context).await,
    }
}

#[tauri::command]
async fn kube_list_namespaces(context: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => K8sApi::list_namespaces(&context).await,
        _ => off_main_thread(move || Kubectl::list_namespaces(&context)).await,
    }
}

#[tauri::command]
async fn kube_list_resources(context: String, namespace: Option<String>, kind: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => K8sApi::list_resources(&context, namespace.as_deref(), &kind).await,
        _ => off_main_thread(move || Kubectl::list_resources(&context, namespace.as_deref(), &kind)).await,
    }
}

#[tauri::command]
async fn kube_describe_resource(context: String, namespace: String, kind: String, name: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => K8sApi::describe_resource(&context, &namespace, &kind, &name).await,
        _ => off_main_thread(move || Kubectl::describe_resource(&context, &namespace, &kind, &name)).await,
    }
}

#[tauri::command]
async fn kube_delete_resource(context: String, namespace: String, kind: String, name: String, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "api" => K8sApi::delete_resource(&context, &namespace, &kind, &name).await,
        _ => off_main_thread(move || Kubectl::delete_resource(&context, &namespace, &kind, &name)).await,
    }
}

#[tauri::command]
async fn kube_scale_deployment(context: String, namespace: String, name: String, replicas: u32, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "api" => K8sApi::scale_deployment(&context, &namespace, &name, replicas).await,
        _ => off_main_thread(move || Kubectl::scale_deployment(&context, &namespace, &name, replicas)).await,
    }
}

// --- Helm ---

#[tauri::command]
async fn helm_list_releases(context: String, namespace: Option<String>) -> Result<String, String> {
    off_main_thread(move || Helm::list_releases(&context, namespace.as_deref())).await
}

#[tauri::command]
async fn helm_get_values(context: String, namespace: String, release: String) -> Result<String, String> {
    off_main_thread(move || Helm::get_values(&context, &namespace, &release)).await
}

#[tauri::command]
async fn helm_status(context: String, namespace: String, release: String) -> Result<String, String> {
    off_main_thread(move || Helm::status(&context, &namespace, &release)).await
}

#[tauri::command]
async fn helm_uninstall(context: String, namespace: String, release: String) -> Result<(), String> {
    off_main_thread(move || Helm::uninstall(&context, &namespace, &release)).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            read_hosts,
            write_hosts,
            export_text_backup,
            read_env_vars,
            write_env_vars,
            docker_list_containers,
            docker_inspect_container,
            docker_container_logs,
            docker_remove_container,
            docker_info,
            kube_list_contexts,
            kube_current_context,
            kube_list_namespaces,
            kube_list_resources,
            kube_describe_resource,
            kube_delete_resource,
            kube_scale_deployment,
            helm_list_releases,
            helm_get_values,
            helm_status,
            helm_uninstall
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
