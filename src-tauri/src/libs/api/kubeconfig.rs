use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize)]
struct RawKubeConfig {
    #[serde(rename = "current-context")]
    current_context: Option<String>,
    #[serde(default)]
    contexts: Vec<NamedContext>,
    #[serde(default)]
    clusters: Vec<NamedCluster>,
    #[serde(default)]
    users: Vec<NamedUser>,
}

#[derive(Deserialize)]
struct NamedContext {
    name: String,
    context: ContextRef,
}

#[derive(Deserialize)]
struct ContextRef {
    cluster: String,
    user: String,
}

#[derive(Deserialize)]
struct NamedCluster {
    name: String,
    cluster: ClusterInfo,
}

#[derive(Deserialize)]
struct ClusterInfo {
    server: String,
    #[serde(rename = "certificate-authority-data")]
    certificate_authority_data: Option<String>,
    #[serde(rename = "certificate-authority")]
    certificate_authority: Option<String>,
    #[serde(rename = "insecure-skip-tls-verify")]
    insecure_skip_tls_verify: Option<bool>,
}

#[derive(Deserialize)]
struct NamedUser {
    name: String,
    user: UserInfo,
}

#[derive(Deserialize)]
struct UserInfo {
    #[serde(rename = "client-certificate-data")]
    client_certificate_data: Option<String>,
    #[serde(rename = "client-certificate")]
    client_certificate: Option<String>,
    #[serde(rename = "client-key-data")]
    client_key_data: Option<String>,
    #[serde(rename = "client-key")]
    client_key: Option<String>,
    token: Option<String>,
    exec: Option<serde_yaml::Value>,
}

pub enum Auth {
    ClientCert { cert_pem: Vec<u8>, key_pem: Vec<u8> },
    Bearer(String),
    None,
}

pub struct ResolvedContext {
    pub server: String,
    pub ca_pem: Option<Vec<u8>>,
    pub insecure_skip_tls_verify: bool,
    pub auth: Auth,
}

/// Only the first entry of `$KUBECONFIG` is honored; full multi-file merge
/// (like kubectl does) is out of scope for this best-effort direct-API path.
fn kubeconfig_path() -> PathBuf {
    if let Ok(value) = std::env::var("KUBECONFIG") {
        if let Some(first) = value.split(';').find(|s| !s.is_empty()) {
            return PathBuf::from(first);
        }
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    PathBuf::from(home).join(".kube").join("config")
}

fn load() -> Result<RawKubeConfig, String> {
    let path = kubeconfig_path();
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("Couldn't read kubeconfig at {}: {e}", path.display()))?;
    serde_yaml::from_str(&text).map_err(|e| format!("Couldn't parse kubeconfig: {e}"))
}

pub fn list_context_names() -> Result<Vec<String>, String> {
    Ok(load()?.contexts.into_iter().map(|c| c.name).collect())
}

pub fn current_context_name() -> Result<Option<String>, String> {
    Ok(load()?.current_context)
}

/// Reads either a `*-data` (base64) field or falls back to reading the
/// referenced file path, matching how kubectl itself resolves these fields.
fn read_pem_field(data: Option<String>, file: Option<String>) -> Result<Option<Vec<u8>>, String> {
    if let Some(data) = data {
        return Ok(Some(
            STANDARD
                .decode(data.trim())
                .map_err(|e| format!("Invalid base64 in kubeconfig: {e}"))?,
        ));
    }
    if let Some(path) = file {
        return Ok(Some(
            std::fs::read(&path).map_err(|e| format!("Couldn't read {path}: {e}"))?,
        ));
    }
    Ok(None)
}

pub fn resolve_context(name: &str) -> Result<ResolvedContext, String> {
    let config = load()?;

    let ctx = config
        .contexts
        .iter()
        .find(|c| c.name == name)
        .ok_or_else(|| format!("Context '{name}' not found in kubeconfig"))?;

    let cluster = config
        .clusters
        .iter()
        .find(|c| c.name == ctx.context.cluster)
        .ok_or_else(|| format!("Cluster '{}' not found in kubeconfig", ctx.context.cluster))?;

    let user = config
        .users
        .iter()
        .find(|u| u.name == ctx.context.user)
        .ok_or_else(|| format!("User '{}' not found in kubeconfig", ctx.context.user))?;

    if user.user.exec.is_some() {
        return Err(format!(
            "Context '{name}' uses exec-based authentication (e.g. a cloud CLI plugin like aws/gcloud/az), which Direct API mode doesn't support. Switch to CLI mode for this context."
        ));
    }

    let ca_pem = read_pem_field(
        cluster.cluster.certificate_authority_data.clone(),
        cluster.cluster.certificate_authority.clone(),
    )?;

    let cert_pem = read_pem_field(
        user.user.client_certificate_data.clone(),
        user.user.client_certificate.clone(),
    )?;
    let key_pem = read_pem_field(
        user.user.client_key_data.clone(),
        user.user.client_key.clone(),
    )?;

    let auth = match (cert_pem, key_pem) {
        (Some(cert_pem), Some(key_pem)) => Auth::ClientCert { cert_pem, key_pem },
        _ => match &user.user.token {
            Some(token) => Auth::Bearer(token.clone()),
            None => Auth::None,
        },
    };

    Ok(ResolvedContext {
        server: cluster.cluster.server.clone(),
        ca_pem,
        insecure_skip_tls_verify: cluster.cluster.insecure_skip_tls_verify.unwrap_or(false),
        auth,
    })
}
