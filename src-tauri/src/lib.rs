mod libs;

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use libs::api::docker_api::DockerApi;
use libs::api::k8s_api::K8sApi;
use libs::api::kubeconfig::ManualK8sConnection;
use libs::cli::docker::Docker;
use libs::cli::helm::Helm;
use libs::cli::kubectl::Kubectl;
#[cfg(windows)]
use libs::io::env_vars::EnvVars;
use libs::io::hosts_file::HostsFile;
use libs::kafka::admin::KafkaAdmin;
use libs::kafka::consumer::{self, KafkaConsumeStreams};
use libs::kafka::lifecycle::KafkaLifecycle;
use libs::kafka::produce::KafkaProducer;
use libs::kafka::types::brokers_to_summaries;
use libs::terminal::TerminalSessions;
#[cfg(windows)]
use libs::wsl::WslSessions;
use tauri::Emitter;

/// Tracks in-flight `docker logs -f` child processes so a stream can be
/// stopped (killed) later by id, keyed by an id handed back to the frontend.
#[derive(Default)]
struct LogStreams {
    next_id: AtomicU64,
    children: Mutex<HashMap<u64, std::process::Child>>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LogLine {
    stream_id: u64,
    line: String,
}

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

/// Reports the host OS ("windows" | "linux" | "macos"), so the frontend can
/// hide tools with no Linux/macOS equivalent (e.g. WSL Terminal, Env Editor).
#[tauri::command]
fn app_platform() -> &'static str {
    std::env::consts::OS
}

/// Read all env vars for `scope` ("user" | "system"), serialized as sorted
/// `NAME=VALUE` lines for stable diffing/rendering.
#[cfg(windows)]
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
#[cfg(windows)]
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
#[cfg(windows)]
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
async fn docker_start_container(host: String, id: String, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "api" => DockerApi::start_container(&host, &id).await,
        _ => off_main_thread(move || Docker::start_container(&host, &id)).await,
    }
}

#[tauri::command]
async fn docker_stop_container(host: String, id: String, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "api" => DockerApi::stop_container(&host, &id).await,
        _ => off_main_thread(move || Docker::stop_container(&host, &id)).await,
    }
}

#[tauri::command]
async fn docker_restart_container(host: String, id: String, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "api" => DockerApi::restart_container(&host, &id).await,
        _ => off_main_thread(move || Docker::restart_container(&host, &id)).await,
    }
}

#[tauri::command]
async fn docker_info(host: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => DockerApi::info(&host).await,
        _ => off_main_thread(move || Docker::info(&host)).await,
    }
}

#[tauri::command]
async fn docker_list_images(host: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => DockerApi::list_images(&host).await,
        _ => off_main_thread(move || Docker::list_images(&host)).await,
    }
}

#[tauri::command]
async fn docker_inspect_image(host: String, id: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => DockerApi::inspect_image(&host, &id).await,
        _ => off_main_thread(move || Docker::inspect_image(&host, &id)).await,
    }
}

#[tauri::command]
async fn docker_remove_image(host: String, id: String, force: bool, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "api" => DockerApi::remove_image(&host, &id, force).await,
        _ => off_main_thread(move || Docker::remove_image(&host, &id, force)).await,
    }
}

#[tauri::command]
async fn docker_list_volumes(host: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => DockerApi::list_volumes(&host).await,
        _ => off_main_thread(move || Docker::list_volumes(&host)).await,
    }
}

#[tauri::command]
async fn docker_inspect_volume(host: String, name: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => DockerApi::inspect_volume(&host, &name).await,
        _ => off_main_thread(move || Docker::inspect_volume(&host, &name)).await,
    }
}

#[tauri::command]
async fn docker_remove_volume(host: String, name: String, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "api" => DockerApi::remove_volume_checked(&host, &name).await,
        _ => off_main_thread(move || Docker::remove_volume_checked(&host, &name)).await,
    }
}

#[tauri::command]
async fn docker_list_networks(host: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => DockerApi::list_networks(&host).await,
        _ => off_main_thread(move || Docker::list_networks(&host)).await,
    }
}

#[tauri::command]
async fn docker_inspect_network(host: String, id: String, mode: String) -> Result<String, String> {
    match mode.as_str() {
        "api" => DockerApi::inspect_network(&host, &id).await,
        _ => off_main_thread(move || Docker::inspect_network(&host, &id)).await,
    }
}

#[tauri::command]
async fn docker_remove_network(host: String, id: String, mode: String) -> Result<(), String> {
    match mode.as_str() {
        "api" => DockerApi::remove_network(&host, &id).await,
        _ => off_main_thread(move || Docker::remove_network(&host, &id)).await,
    }
}

/// Starts a `docker logs -f` tail (CLI mode only — API mode live-tails via
/// polling from the frontend instead) and streams lines back as
/// `docker-log-line` events, tagged with the returned stream id.
#[tauri::command]
async fn docker_start_log_stream(
    host: String,
    id: String,
    tail: Option<u32>,
    mode: String,
    app: tauri::AppHandle,
    streams: tauri::State<'_, LogStreams>,
) -> Result<u64, String> {
    if mode != "cli" {
        return Err("Live tailing is only supported in CLI mode.".to_string());
    }

    let mut child = off_main_thread(move || Docker::stream_logs(&host, &id, tail)).await?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture log stream output.".to_string())?;

    let stream_id = streams.next_id.fetch_add(1, Ordering::SeqCst);
    streams.children.lock().unwrap().insert(stream_id, child);

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    let _ = app.emit("docker-log-line", LogLine { stream_id, line });
                }
                Err(_) => break,
            }
        }
        let _ = app.emit("docker-log-closed", stream_id);
    });

    Ok(stream_id)
}

/// Kills the child process backing `stream_id`, if still running. Safe to
/// call on an already-finished stream (or an unknown id) — both are no-ops.
#[tauri::command]
fn docker_stop_log_stream(stream_id: u64, streams: tauri::State<'_, LogStreams>) -> Result<(), String> {
    if let Some(mut child) = streams.children.lock().unwrap().remove(&stream_id) {
        let _ = child.kill();
    }
    Ok(())
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
async fn kube_list_namespaces(context: String, mode: String, manual: Option<ManualK8sConnection>) -> Result<String, String> {
    match mode.as_str() {
        "api" => K8sApi::list_namespaces(&context, manual.as_ref()).await,
        _ => off_main_thread(move || Kubectl::list_namespaces(&context, manual.as_ref())).await,
    }
}

#[tauri::command]
async fn kube_list_resources(
    context: String,
    namespace: Option<String>,
    kind: String,
    mode: String,
    manual: Option<ManualK8sConnection>,
) -> Result<String, String> {
    match mode.as_str() {
        "api" => K8sApi::list_resources(&context, namespace.as_deref(), &kind, manual.as_ref()).await,
        _ => off_main_thread(move || Kubectl::list_resources(&context, namespace.as_deref(), &kind, manual.as_ref())).await,
    }
}

#[tauri::command]
async fn kube_describe_resource(
    context: String,
    namespace: String,
    kind: String,
    name: String,
    mode: String,
    manual: Option<ManualK8sConnection>,
) -> Result<String, String> {
    match mode.as_str() {
        "api" => K8sApi::describe_resource(&context, &namespace, &kind, &name, manual.as_ref()).await,
        _ => off_main_thread(move || Kubectl::describe_resource(&context, &namespace, &kind, &name, manual.as_ref())).await,
    }
}

#[tauri::command]
async fn kube_delete_resource(
    context: String,
    namespace: String,
    kind: String,
    name: String,
    mode: String,
    manual: Option<ManualK8sConnection>,
) -> Result<(), String> {
    match mode.as_str() {
        "api" => K8sApi::delete_resource(&context, &namespace, &kind, &name, manual.as_ref()).await,
        _ => off_main_thread(move || Kubectl::delete_resource(&context, &namespace, &kind, &name, manual.as_ref())).await,
    }
}

#[tauri::command]
async fn kube_scale_deployment(
    context: String,
    namespace: String,
    name: String,
    replicas: u32,
    mode: String,
    manual: Option<ManualK8sConnection>,
) -> Result<(), String> {
    match mode.as_str() {
        "api" => K8sApi::scale_deployment(&context, &namespace, &name, replicas, manual.as_ref()).await,
        _ => off_main_thread(move || Kubectl::scale_deployment(&context, &namespace, &name, replicas, manual.as_ref())).await,
    }
}

// --- Helm ---

#[tauri::command]
async fn helm_list_releases(context: String, namespace: Option<String>, manual: Option<ManualK8sConnection>) -> Result<String, String> {
    off_main_thread(move || Helm::list_releases(&context, namespace.as_deref(), manual.as_ref())).await
}

#[tauri::command]
async fn helm_get_values(
    context: String,
    namespace: String,
    release: String,
    manual: Option<ManualK8sConnection>,
) -> Result<String, String> {
    off_main_thread(move || Helm::get_values(&context, &namespace, &release, manual.as_ref())).await
}

#[tauri::command]
async fn helm_status(
    context: String,
    namespace: String,
    release: String,
    manual: Option<ManualK8sConnection>,
) -> Result<String, String> {
    off_main_thread(move || Helm::status(&context, &namespace, &release, manual.as_ref())).await
}

#[tauri::command]
async fn helm_uninstall(
    context: String,
    namespace: String,
    release: String,
    manual: Option<ManualK8sConnection>,
) -> Result<(), String> {
    off_main_thread(move || Helm::uninstall(&context, &namespace, &release, manual.as_ref())).await
}

// --- Kafka lifecycle ---
// Both start targets (Docker / Helm-k8s) compose the existing Docker/Helm/Kubectl
// CLI wrappers rather than shelling out directly; see libs::kafka::lifecycle.

// `mode` follows the same "cli" (shell out to docker.exe) / "api" (Docker
// Engine API over reqwest, no docker.exe required) convention as the rest of
// Docker Manager's commands.

#[tauri::command]
async fn kafka_docker_start(
    host: String,
    container_name: String,
    image: String,
    port: u16,
    extra_env: Vec<(String, String)>,
    mode: String,
) -> Result<(), String> {
    match mode.as_str() {
        "api" => DockerApi::run_kafka_container(&host, &container_name, &image, port, &extra_env).await,
        _ => {
            off_main_thread(move || KafkaLifecycle::docker_start(&host, &container_name, &image, port, &extra_env))
                .await
        }
    }
}

#[tauri::command]
async fn kafka_docker_stop(host: String, container_name: String, mode: String, brokers: String) -> Result<(), String> {
    KafkaAdmin::invalidate_client(&brokers);
    match mode.as_str() {
        "api" => DockerApi::stop_container(&host, &container_name).await,
        _ => off_main_thread(move || KafkaLifecycle::docker_stop(&host, &container_name)).await,
    }
}

#[tauri::command]
async fn kafka_docker_reset(
    host: String,
    container_name: String,
    image: String,
    port: u16,
    extra_env: Vec<(String, String)>,
    mode: String,
    brokers: String,
) -> Result<(), String> {
    KafkaAdmin::invalidate_client(&brokers);
    match mode.as_str() {
        "api" => {
            let _ = DockerApi::remove_container(&host, &container_name, true).await;
            let _ = DockerApi::remove_volume(&host, &format!("{container_name}-data")).await;
            DockerApi::run_kafka_container(&host, &container_name, &image, port, &extra_env).await
        }
        _ => {
            off_main_thread(move || KafkaLifecycle::docker_reset(&host, &container_name, &image, port, &extra_env))
                .await
        }
    }
}

#[tauri::command]
async fn kafka_helm_start(
    context: String,
    namespace: String,
    release: String,
    chart: String,
    values: Vec<(String, String)>,
) -> Result<(), String> {
    off_main_thread(move || KafkaLifecycle::helm_start(&context, &namespace, &release, &chart, &values)).await
}

#[tauri::command]
async fn kafka_helm_stop(context: String, namespace: String, release: String, brokers: String) -> Result<(), String> {
    KafkaAdmin::invalidate_client(&brokers);
    off_main_thread(move || KafkaLifecycle::helm_stop(&context, &namespace, &release)).await
}

#[tauri::command]
async fn kafka_helm_reset(
    context: String,
    namespace: String,
    release: String,
    chart: String,
    values: Vec<(String, String)>,
    brokers: String,
) -> Result<(), String> {
    KafkaAdmin::invalidate_client(&brokers);
    off_main_thread(move || KafkaLifecycle::helm_reset(&context, &namespace, &release, &chart, &values)).await
}

// --- Kafka: topics/brokers (rskafka, no CLI fallback) ---

#[tauri::command]
async fn kafka_list_topics(brokers: String) -> Result<String, String> {
    let topics = KafkaAdmin::list_topics(&brokers).await?;
    serde_json::to_string(&topics).map_err(|e| e.to_string())
}

/// Echoes the configured bootstrap servers — rskafka exposes no API to query
/// the cluster's actual broker roster.
#[tauri::command]
async fn kafka_list_brokers(brokers: String) -> Result<String, String> {
    serde_json::to_string(&brokers_to_summaries(&brokers)).map_err(|e| e.to_string())
}

#[tauri::command]
async fn kafka_create_topic(brokers: String, name: String, partitions: i32, replication_factor: i16) -> Result<(), String> {
    KafkaAdmin::create_topic(&brokers, &name, partitions, replication_factor).await
}

#[tauri::command]
async fn kafka_delete_topic(brokers: String, name: String) -> Result<(), String> {
    KafkaAdmin::delete_topic(&brokers, &name).await
}

#[tauri::command]
async fn kafka_purge_topic(brokers: String, name: String) -> Result<(), String> {
    KafkaAdmin::purge_topic(&brokers, &name).await
}

#[tauri::command]
async fn kafka_start_consume_stream(
    brokers: String,
    topic: String,
    partitions: Vec<i32>,
    app: tauri::AppHandle,
    streams: tauri::State<'_, KafkaConsumeStreams>,
) -> Result<u64, String> {
    let stream_id = streams.next_id();
    consumer::start_stream(brokers, topic, partitions, app, stream_id, &streams).await?;
    Ok(stream_id)
}

#[tauri::command]
fn kafka_stop_consume_stream(stream_id: u64, streams: tauri::State<'_, KafkaConsumeStreams>) -> Result<(), String> {
    streams.stop(stream_id);
    Ok(())
}

#[tauri::command]
async fn kafka_produce(
    brokers: String,
    topic: String,
    partition: i32,
    key: Option<String>,
    value: Option<String>,
    headers: Vec<(String, String)>,
) -> Result<i64, String> {
    KafkaProducer::produce(&brokers, &topic, partition, key, value, headers).await
}

#[cfg(windows)]
#[tauri::command]
async fn wsl_list_distros() -> Result<Vec<String>, String> {
    off_main_thread(libs::wsl::list_distros).await
}

#[cfg(windows)]
#[tauri::command]
async fn wsl_windows_path_to_wsl(path: String) -> Result<String, String> {
    off_main_thread(move || libs::wsl::windows_path_to_wsl(&path)).await
}

#[cfg(windows)]
#[tauri::command]
fn wsl_start_session(
    distro: Option<String>,
    cwd: Option<String>,
    app: tauri::AppHandle,
    sessions: tauri::State<'_, WslSessions>,
) -> Result<u64, String> {
    sessions.start(distro, cwd, app)
}

#[cfg(windows)]
#[tauri::command]
fn wsl_write(session_id: u64, data: String, sessions: tauri::State<'_, WslSessions>) -> Result<(), String> {
    sessions.write(session_id, &data)
}

#[cfg(windows)]
#[tauri::command]
fn wsl_resize(session_id: u64, cols: u16, rows: u16, sessions: tauri::State<'_, WslSessions>) -> Result<(), String> {
    sessions.resize(session_id, cols, rows)
}

#[cfg(windows)]
#[tauri::command]
fn wsl_close_session(session_id: u64, sessions: tauri::State<'_, WslSessions>) -> Result<(), String> {
    sessions.close(session_id)
}

// --- Terminal (native shell) ---

#[tauri::command]
fn terminal_start_session(
    cwd: Option<String>,
    app: tauri::AppHandle,
    sessions: tauri::State<'_, TerminalSessions>,
) -> Result<u64, String> {
    sessions.start(cwd, app)
}

#[tauri::command]
fn terminal_write(session_id: u64, data: String, sessions: tauri::State<'_, TerminalSessions>) -> Result<(), String> {
    sessions.write(session_id, &data)
}

#[tauri::command]
fn terminal_resize(session_id: u64, cols: u16, rows: u16, sessions: tauri::State<'_, TerminalSessions>) -> Result<(), String> {
    sessions.resize(session_id, cols, rows)
}

#[tauri::command]
fn terminal_close_session(session_id: u64, sessions: tauri::State<'_, TerminalSessions>) -> Result<(), String> {
    sessions.close(session_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(LogStreams::default())
        .manage(KafkaConsumeStreams::default())
        .manage(TerminalSessions::default());
    #[cfg(windows)]
    let builder = builder.manage(WslSessions::default());

    builder
        .invoke_handler(tauri::generate_handler![
            read_hosts,
            write_hosts,
            export_text_backup,
            app_platform,
            #[cfg(windows)]
            read_env_vars,
            #[cfg(windows)]
            write_env_vars,
            docker_list_containers,
            docker_inspect_container,
            docker_container_logs,
            docker_remove_container,
            docker_start_container,
            docker_stop_container,
            docker_restart_container,
            docker_info,
            docker_start_log_stream,
            docker_stop_log_stream,
            docker_list_images,
            docker_inspect_image,
            docker_remove_image,
            docker_list_volumes,
            docker_inspect_volume,
            docker_remove_volume,
            docker_list_networks,
            docker_inspect_network,
            docker_remove_network,
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
            helm_uninstall,
            kafka_docker_start,
            kafka_docker_stop,
            kafka_docker_reset,
            kafka_helm_start,
            kafka_helm_stop,
            kafka_helm_reset,
            kafka_list_topics,
            kafka_list_brokers,
            kafka_create_topic,
            kafka_delete_topic,
            kafka_purge_topic,
            kafka_start_consume_stream,
            kafka_stop_consume_stream,
            kafka_produce,
            #[cfg(windows)]
            wsl_list_distros,
            #[cfg(windows)]
            wsl_windows_path_to_wsl,
            #[cfg(windows)]
            wsl_start_session,
            #[cfg(windows)]
            wsl_write,
            #[cfg(windows)]
            wsl_resize,
            #[cfg(windows)]
            wsl_close_session,
            terminal_start_session,
            terminal_write,
            terminal_resize,
            terminal_close_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
