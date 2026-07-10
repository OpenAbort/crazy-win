use super::exec;

fn base_args(host: &str) -> Vec<String> {
    if host.trim().is_empty() {
        Vec::new()
    } else {
        vec!["-H".to_string(), host.trim().to_string()]
    }
}

pub struct Docker;

impl Docker {
    /// Lists all containers (running and stopped) as JSON Lines (one object per line).
    pub fn list_containers(host: &str) -> Result<String, String> {
        let mut args = base_args(host);
        args.extend(["ps".to_string(), "-a".to_string(), "--format".to_string(), "json".to_string()]);
        Ok(exec::run("docker", &args)?.stdout)
    }

    /// Full inspect output (a JSON array with one element) for a single container.
    pub fn inspect_container(host: &str, id: &str) -> Result<String, String> {
        let mut args = base_args(host);
        args.extend(["inspect".to_string(), id.to_string()]);
        Ok(exec::run("docker", &args)?.stdout)
    }

    /// Combined stdout+stderr log output; true stream interleaving is out of scope.
    pub fn container_logs(host: &str, id: &str, tail: Option<u32>) -> Result<String, String> {
        let mut args = base_args(host);
        args.push("logs".to_string());
        if let Some(n) = tail {
            args.push("--tail".to_string());
            args.push(n.to_string());
        }
        args.push(id.to_string());
        let out = exec::run("docker", &args)?;
        Ok(format!("{}{}", out.stdout, out.stderr))
    }

    pub fn remove_container(host: &str, id: &str, force: bool) -> Result<(), String> {
        let mut args = base_args(host);
        args.push("rm".to_string());
        if force {
            args.push("-f".to_string());
        }
        args.push(id.to_string());
        exec::run("docker", &args)?;
        Ok(())
    }

    /// Used as a lightweight "test connection" probe distinct from listing containers.
    pub fn info(host: &str) -> Result<String, String> {
        let mut args = base_args(host);
        args.extend(["info".to_string(), "--format".to_string(), "json".to_string()]);
        Ok(exec::run("docker", &args)?.stdout)
    }
}
