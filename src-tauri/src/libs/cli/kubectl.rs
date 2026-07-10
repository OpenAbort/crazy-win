use super::exec;

/// Resource kinds supported by the Kubernetes tool's MVP list/describe/delete views.
const ALLOWED_KINDS: &[&str] = &["pods", "deployments", "services"];

/// Applied to every call that actually talks to the API server, so an
/// unreachable/misconfigured context fails in a few seconds instead of
/// hanging on client-go's default (much longer) connection retry/backoff.
const REQUEST_TIMEOUT: &str = "10s";

fn timeout_args() -> Vec<String> {
    vec!["--request-timeout".to_string(), REQUEST_TIMEOUT.to_string()]
}

fn validate_kind(kind: &str) -> Result<(), String> {
    if ALLOWED_KINDS.contains(&kind) {
        Ok(())
    } else {
        Err(format!("Unsupported resource kind: {kind}"))
    }
}

fn namespace_args(namespace: Option<&str>) -> Vec<String> {
    match namespace {
        Some(ns) => vec!["-n".to_string(), ns.to_string()],
        None => vec!["-A".to_string()],
    }
}

pub struct Kubectl;

impl Kubectl {
    /// Newline-delimited context names (not JSON).
    pub fn list_contexts() -> Result<String, String> {
        Ok(exec::run("kubectl", &["config".to_string(), "get-contexts".to_string(), "-o".to_string(), "name".to_string()])?.stdout)
    }

    /// Used only to preselect a sane default before any persisted value exists.
    pub fn current_context() -> Result<String, String> {
        Ok(exec::run("kubectl", &["config".to_string(), "current-context".to_string()])?.stdout)
    }

    pub fn list_namespaces(context: &str) -> Result<String, String> {
        let mut args = vec!["--context".to_string(), context.to_string()];
        args.extend(timeout_args());
        args.extend(["get".to_string(), "namespaces".to_string(), "-o".to_string(), "json".to_string()]);
        Ok(exec::run("kubectl", &args)?.stdout)
    }

    pub fn list_resources(context: &str, namespace: Option<&str>, kind: &str) -> Result<String, String> {
        validate_kind(kind)?;
        let mut args = vec!["--context".to_string(), context.to_string()];
        args.extend(namespace_args(namespace));
        args.extend(timeout_args());
        args.extend(["get".to_string(), kind.to_string(), "-o".to_string(), "json".to_string()]);
        Ok(exec::run("kubectl", &args)?.stdout)
    }

    /// Plain text output, rendered as-is.
    pub fn describe_resource(context: &str, namespace: &str, kind: &str, name: &str) -> Result<String, String> {
        validate_kind(kind)?;
        let mut args = vec!["--context".to_string(), context.to_string(), "-n".to_string(), namespace.to_string()];
        args.extend(timeout_args());
        args.extend(["describe".to_string(), kind.to_string(), name.to_string()]);
        Ok(exec::run("kubectl", &args)?.stdout)
    }

    pub fn delete_resource(context: &str, namespace: &str, kind: &str, name: &str) -> Result<(), String> {
        validate_kind(kind)?;
        let mut args = vec!["--context".to_string(), context.to_string(), "-n".to_string(), namespace.to_string()];
        args.extend(timeout_args());
        args.extend(["delete".to_string(), kind.to_string(), name.to_string()]);
        exec::run("kubectl", &args)?;
        Ok(())
    }

    pub fn scale_deployment(context: &str, namespace: &str, name: &str, replicas: u32) -> Result<(), String> {
        let mut args = vec!["--context".to_string(), context.to_string(), "-n".to_string(), namespace.to_string()];
        args.extend(timeout_args());
        args.extend(["scale".to_string(), "deployment".to_string(), name.to_string(), format!("--replicas={replicas}")]);
        exec::run("kubectl", &args)?;
        Ok(())
    }

    /// Deletes every resource of `resource` kind matching `label_selector`
    /// (e.g. cleaning up a Helm release's PVCs before reinstalling) rather
    /// than a single named resource — deliberately bypasses `validate_kind`,
    /// since `pvc` isn't in the app's pods/deployments/services allowlist.
    pub fn delete_by_label(context: &str, namespace: &str, resource: &str, label_selector: &str) -> Result<(), String> {
        let mut args = vec!["--context".to_string(), context.to_string(), "-n".to_string(), namespace.to_string()];
        args.extend(timeout_args());
        args.extend([
            "delete".to_string(),
            resource.to_string(),
            "-l".to_string(),
            label_selector.to_string(),
            "--ignore-not-found".to_string(),
        ]);
        exec::run("kubectl", &args)?;
        Ok(())
    }
}
