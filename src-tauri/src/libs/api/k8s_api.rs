use serde_json::Value;

use super::kubeconfig::{self, Auth, ManualK8sConnection, ResolvedContext};

fn kind_path(kind: &str) -> Result<&'static str, String> {
    match kind {
        "pods" | "services" => Ok("api/v1"),
        "deployments" => Ok("apis/apps/v1"),
        other => Err(format!("Unsupported resource kind: {other}")),
    }
}

fn build_client(ctx: &ResolvedContext) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder();
    if let Some(ca) = &ctx.ca_pem {
        let cert = reqwest::Certificate::from_pem(ca).map_err(|e| e.to_string())?;
        builder = builder.add_root_certificate(cert);
    }
    if ctx.insecure_skip_tls_verify {
        builder = builder.danger_accept_invalid_certs(true);
    }
    if let Auth::ClientCert { cert_pem, key_pem } = &ctx.auth {
        let mut combined = cert_pem.clone();
        combined.extend_from_slice(key_pem);
        let identity = reqwest::Identity::from_pem(&combined).map_err(|e| e.to_string())?;
        builder = builder.identity(identity);
    }
    builder.build().map_err(|e| e.to_string())
}

async fn request(
    context: &str,
    manual: Option<&ManualK8sConnection>,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
    content_type: &str,
) -> Result<Value, String> {
    let resolved = match manual {
        Some(m) => kubeconfig::resolve_manual(m),
        None => kubeconfig::resolve_context(context)?,
    };
    let client = build_client(&resolved)?;
    let url = format!(
        "{}/{}",
        resolved.server.trim_end_matches('/'),
        path.trim_start_matches('/')
    );

    let mut req = client.request(method, url);
    if let Auth::Bearer(token) = &resolved.auth {
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    if let Some(b) = &body {
        req = req.header("Content-Type", content_type).json(b);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let message = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(|s| s.to_string()))
            .unwrap_or(text);
        return Err(format!("Kubernetes API error ({status}): {message}"));
    }

    if text.trim().is_empty() {
        Ok(Value::Null)
    } else {
        serde_json::from_str(&text).map_err(|e| e.to_string())
    }
}

pub struct K8sApi;

impl K8sApi {
    pub fn list_contexts() -> Result<String, String> {
        Ok(kubeconfig::list_context_names()?.join("\n"))
    }

    pub fn current_context() -> Result<String, String> {
        Ok(kubeconfig::current_context_name()?.unwrap_or_default())
    }

    pub async fn list_namespaces(context: &str, manual: Option<&ManualK8sConnection>) -> Result<String, String> {
        let value = request(context, manual, reqwest::Method::GET, "api/v1/namespaces", None, "application/json").await?;
        Ok(value.to_string())
    }

    pub async fn list_resources(
        context: &str,
        namespace: Option<&str>,
        kind: &str,
        manual: Option<&ManualK8sConnection>,
    ) -> Result<String, String> {
        let group_path = kind_path(kind)?;
        let path = match namespace {
            Some(ns) => format!("{group_path}/namespaces/{ns}/{kind}"),
            None => format!("{group_path}/{kind}"),
        };
        let value = request(context, manual, reqwest::Method::GET, &path, None, "application/json").await?;
        Ok(value.to_string())
    }

    /// There's no REST equivalent to `kubectl describe` (it's a client-side kubectl
    /// feature aggregating several calls into a human-readable summary) — this
    /// returns the raw resource JSON instead, with a note explaining the difference.
    pub async fn describe_resource(
        context: &str,
        namespace: &str,
        kind: &str,
        name: &str,
        manual: Option<&ManualK8sConnection>,
    ) -> Result<String, String> {
        let group_path = kind_path(kind)?;
        let path = format!("{group_path}/namespaces/{namespace}/{kind}/{name}");
        let value = request(context, manual, reqwest::Method::GET, &path, None, "application/json").await?;
        let pretty = serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
        Ok(format!(
            "# Direct API mode shows raw resource JSON here (kubectl describe's summary is a\n# client-side feature with no REST equivalent). Switch to CLI mode for the full\n# `kubectl describe` output.\n\n{pretty}"
        ))
    }

    pub async fn delete_resource(
        context: &str,
        namespace: &str,
        kind: &str,
        name: &str,
        manual: Option<&ManualK8sConnection>,
    ) -> Result<(), String> {
        let group_path = kind_path(kind)?;
        let path = format!("{group_path}/namespaces/{namespace}/{kind}/{name}");
        request(context, manual, reqwest::Method::DELETE, &path, None, "application/json").await?;
        Ok(())
    }

    pub async fn scale_deployment(
        context: &str,
        namespace: &str,
        name: &str,
        replicas: u32,
        manual: Option<&ManualK8sConnection>,
    ) -> Result<(), String> {
        let path = format!("apis/apps/v1/namespaces/{namespace}/deployments/{name}");
        let body = serde_json::json!({ "spec": { "replicas": replicas } });
        request(context, manual, reqwest::Method::PATCH, &path, Some(body), "application/merge-patch+json").await?;
        Ok(())
    }

    /// Full-replace PUT of an edited manifest — unlike `scale_deployment`'s
    /// merge-patch, this sends the whole object back (matching what
    /// `kubectl apply`/`kubectl edit` do), so the content type is plain
    /// `application/json`, not `application/merge-patch+json`.
    pub async fn apply_manifest(
        context: &str,
        namespace: &str,
        kind: &str,
        name: &str,
        manual: Option<&ManualK8sConnection>,
        content: &str,
    ) -> Result<(), String> {
        let group_path = kind_path(kind)?;
        let path = format!("{group_path}/namespaces/{namespace}/{kind}/{name}");
        let body: Value = serde_json::from_str(content).map_err(|e| format!("Invalid JSON: {e}"))?;
        request(context, manual, reqwest::Method::PUT, &path, Some(body), "application/json").await?;
        Ok(())
    }
}
