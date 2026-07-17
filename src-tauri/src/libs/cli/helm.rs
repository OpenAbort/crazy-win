use super::exec;
use crate::libs::api::kubeconfig::ManualK8sConnection;

fn namespace_args(namespace: Option<&str>) -> Vec<String> {
    match namespace {
        Some(ns) => vec!["-n".to_string(), ns.to_string()],
        None => vec!["-A".to_string()],
    }
}

/// `--kube-context <name>`, or the equivalent ad-hoc `--kube-apiserver`/
/// `--kube-token`/`--kube-insecure-skip-tls-verify` flags when a manual
/// connection is supplied — Helm 3 supports connecting this way without any
/// kubeconfig context.
fn connection_args(context: &str, manual: Option<&ManualK8sConnection>) -> Vec<String> {
    match manual {
        Some(m) => {
            let mut args = vec!["--kube-apiserver".to_string(), m.server.clone()];
            if let Some(t) = &m.token {
                if !t.is_empty() {
                    args.push("--kube-token".to_string());
                    args.push(t.clone());
                }
            }
            if m.insecure {
                args.push("--kube-insecure-skip-tls-verify".to_string());
            }
            args
        }
        None => vec!["--kube-context".to_string(), context.to_string()],
    }
}

pub struct Helm;

impl Helm {
    /// Note: Helm's context flag is `--kube-context`, not `--context` like kubectl.
    pub fn list_releases(context: &str, namespace: Option<&str>, manual: Option<&ManualK8sConnection>) -> Result<String, String> {
        let mut args = vec!["list".to_string()];
        args.extend(connection_args(context, manual));
        args.extend(namespace_args(namespace));
        args.extend(["-o".to_string(), "json".to_string()]);
        Ok(exec::run("helm", &args)?.stdout)
    }

    pub fn get_values(
        context: &str,
        namespace: &str,
        release: &str,
        manual: Option<&ManualK8sConnection>,
    ) -> Result<String, String> {
        let mut args = vec!["get".to_string(), "values".to_string(), release.to_string()];
        args.extend(connection_args(context, manual));
        args.extend(["-n".to_string(), namespace.to_string(), "-o".to_string(), "yaml".to_string()]);
        Ok(exec::run("helm", &args)?.stdout)
    }

    pub fn status(
        context: &str,
        namespace: &str,
        release: &str,
        manual: Option<&ManualK8sConnection>,
    ) -> Result<String, String> {
        let mut args = vec!["status".to_string(), release.to_string()];
        args.extend(connection_args(context, manual));
        args.extend(["-n".to_string(), namespace.to_string(), "-o".to_string(), "json".to_string()]);
        Ok(exec::run("helm", &args)?.stdout)
    }

    pub fn uninstall(
        context: &str,
        namespace: &str,
        release: &str,
        manual: Option<&ManualK8sConnection>,
    ) -> Result<(), String> {
        let mut args = vec!["uninstall".to_string(), release.to_string()];
        args.extend(connection_args(context, manual));
        args.extend(["-n".to_string(), namespace.to_string()]);
        exec::run("helm", &args)?;
        Ok(())
    }

    /// Installs (or upgrades an existing release in place) a chart, creating
    /// the namespace if it doesn't exist yet.
    pub fn install(
        context: &str,
        namespace: &str,
        release: &str,
        chart: &str,
        values: &[(String, String)],
    ) -> Result<String, String> {
        let mut args = vec![
            "upgrade".to_string(),
            "--install".to_string(),
            release.to_string(),
            chart.to_string(),
            "--kube-context".to_string(),
            context.to_string(),
            "-n".to_string(),
            namespace.to_string(),
            "--create-namespace".to_string(),
        ];
        for (k, v) in values {
            args.push("--set".to_string());
            args.push(format!("{k}={v}"));
        }
        Ok(exec::run("helm", &args)?.stdout)
    }
}
