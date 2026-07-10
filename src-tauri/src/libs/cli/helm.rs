use super::exec;

fn namespace_args(namespace: Option<&str>) -> Vec<String> {
    match namespace {
        Some(ns) => vec!["-n".to_string(), ns.to_string()],
        None => vec!["-A".to_string()],
    }
}

pub struct Helm;

impl Helm {
    /// Note: Helm's context flag is `--kube-context`, not `--context` like kubectl.
    pub fn list_releases(context: &str, namespace: Option<&str>) -> Result<String, String> {
        let mut args = vec!["list".to_string(), "--kube-context".to_string(), context.to_string()];
        args.extend(namespace_args(namespace));
        args.extend(["-o".to_string(), "json".to_string()]);
        Ok(exec::run("helm", &args)?.stdout)
    }

    pub fn get_values(context: &str, namespace: &str, release: &str) -> Result<String, String> {
        let args = vec![
            "get".to_string(),
            "values".to_string(),
            release.to_string(),
            "--kube-context".to_string(),
            context.to_string(),
            "-n".to_string(),
            namespace.to_string(),
            "-o".to_string(),
            "yaml".to_string(),
        ];
        Ok(exec::run("helm", &args)?.stdout)
    }

    pub fn status(context: &str, namespace: &str, release: &str) -> Result<String, String> {
        let args = vec![
            "status".to_string(),
            release.to_string(),
            "--kube-context".to_string(),
            context.to_string(),
            "-n".to_string(),
            namespace.to_string(),
            "-o".to_string(),
            "json".to_string(),
        ];
        Ok(exec::run("helm", &args)?.stdout)
    }

    pub fn uninstall(context: &str, namespace: &str, release: &str) -> Result<(), String> {
        let args = vec![
            "uninstall".to_string(),
            release.to_string(),
            "--kube-context".to_string(),
            context.to_string(),
            "-n".to_string(),
            namespace.to_string(),
        ];
        exec::run("helm", &args)?;
        Ok(())
    }
}
