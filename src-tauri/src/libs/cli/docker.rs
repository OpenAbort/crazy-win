use std::process::Child;

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

    /// Spawns `docker logs -f`, leaving the child running so its stdout can be
    /// tailed line-by-line by the caller.
    pub fn stream_logs(host: &str, id: &str, tail: Option<u32>) -> Result<Child, String> {
        let mut args = base_args(host);
        args.push("logs".to_string());
        args.push("-f".to_string());
        if let Some(n) = tail {
            args.push("--tail".to_string());
            args.push(n.to_string());
        }
        args.push(id.to_string());
        exec::spawn_piped("docker", &args)
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

    /// Runs a detached single-node KRaft-mode Kafka broker (no separate
    /// Zookeeper container needed). `extra_env` entries override the built-in
    /// defaults with the same key.
    pub fn run_kafka_container(
        host: &str,
        container_name: &str,
        image: &str,
        port: u16,
        extra_env: &[(String, String)],
    ) -> Result<String, String> {
        let mut args = base_args(host);
        args.extend([
            "run".to_string(),
            "-d".to_string(),
            "--name".to_string(),
            container_name.to_string(),
            "-p".to_string(),
            format!("{port}:9092"),
        ]);

        let overridden: std::collections::HashSet<&str> =
            extra_env.iter().map(|(k, _)| k.as_str()).collect();
        let defaults: Vec<(String, String)> = vec![
            ("KAFKA_NODE_ID".to_string(), "1".to_string()),
            ("KAFKA_PROCESS_ROLES".to_string(), "broker,controller".to_string()),
            (
                "KAFKA_LISTENERS".to_string(),
                "PLAINTEXT://:9092,CONTROLLER://:9093".to_string(),
            ),
            (
                "KAFKA_ADVERTISED_LISTENERS".to_string(),
                format!("PLAINTEXT://localhost:{port}"),
            ),
            (
                "KAFKA_CONTROLLER_QUORUM_VOTERS".to_string(),
                "1@localhost:9093".to_string(),
            ),
            ("KAFKA_CONTROLLER_LISTENER_NAMES".to_string(), "CONTROLLER".to_string()),
            ("KAFKA_INTER_BROKER_LISTENER_NAME".to_string(), "PLAINTEXT".to_string()),
            ("CLUSTER_ID".to_string(), "MkU3OEVBNTcwNTJENDM2Qk".to_string()),
        ];
        for (k, v) in defaults {
            if !overridden.contains(k.as_str()) {
                args.push("-e".to_string());
                args.push(format!("{k}={v}"));
            }
        }
        for (k, v) in extra_env {
            args.push("-e".to_string());
            args.push(format!("{k}={v}"));
        }

        args.push("-v".to_string());
        args.push(format!("{container_name}-data:/var/lib/kafka/data"));
        args.push(image.to_string());

        Ok(exec::run("docker", &args)?.stdout)
    }

    /// Stops (but does not remove) a running container by name.
    pub fn stop_container(host: &str, name: &str) -> Result<(), String> {
        let mut args = base_args(host);
        args.extend(["stop".to_string(), name.to_string()]);
        exec::run("docker", &args)?;
        Ok(())
    }

    /// Starts an already-created, stopped container by name.
    pub fn start_container(host: &str, name: &str) -> Result<(), String> {
        let mut args = base_args(host);
        args.extend(["start".to_string(), name.to_string()]);
        exec::run("docker", &args)?;
        Ok(())
    }

    /// Restarts a container by name, regardless of its current state.
    pub fn restart_container(host: &str, name: &str) -> Result<(), String> {
        let mut args = base_args(host);
        args.extend(["restart".to_string(), name.to_string()]);
        exec::run("docker", &args)?;
        Ok(())
    }

    /// Best-effort volume removal; a missing volume is not an error since a
    /// fresh start never created one yet.
    pub fn remove_volume(host: &str, volume: &str) -> Result<(), String> {
        let mut args = base_args(host);
        args.extend(["volume".to_string(), "rm".to_string(), volume.to_string()]);
        let _ = exec::run("docker", &args);
        Ok(())
    }

    /// Removes a volume, surfacing any error (e.g. "volume is in use") instead
    /// of swallowing it like `remove_volume` does for the Kafka teardown flow.
    pub fn remove_volume_checked(host: &str, volume: &str) -> Result<(), String> {
        let mut args = base_args(host);
        args.extend(["volume".to_string(), "rm".to_string(), volume.to_string()]);
        exec::run("docker", &args)?;
        Ok(())
    }

    /// Lists all images (including untagged/dangling) as JSON Lines.
    pub fn list_images(host: &str) -> Result<String, String> {
        let mut args = base_args(host);
        args.extend(["images".to_string(), "-a".to_string(), "--format".to_string(), "json".to_string()]);
        Ok(exec::run("docker", &args)?.stdout)
    }

    /// Full inspect output (a JSON array with one element) for a single image.
    pub fn inspect_image(host: &str, id: &str) -> Result<String, String> {
        let mut args = base_args(host);
        args.extend(["image".to_string(), "inspect".to_string(), id.to_string()]);
        Ok(exec::run("docker", &args)?.stdout)
    }

    pub fn remove_image(host: &str, id: &str, force: bool) -> Result<(), String> {
        let mut args = base_args(host);
        args.push("rmi".to_string());
        if force {
            args.push("-f".to_string());
        }
        args.push(id.to_string());
        exec::run("docker", &args)?;
        Ok(())
    }

    /// Lists all volumes as JSON Lines.
    pub fn list_volumes(host: &str) -> Result<String, String> {
        let mut args = base_args(host);
        args.extend(["volume".to_string(), "ls".to_string(), "--format".to_string(), "json".to_string()]);
        Ok(exec::run("docker", &args)?.stdout)
    }

    /// Full inspect output (a JSON array with one element) for a single volume.
    pub fn inspect_volume(host: &str, name: &str) -> Result<String, String> {
        let mut args = base_args(host);
        args.extend(["volume".to_string(), "inspect".to_string(), name.to_string()]);
        Ok(exec::run("docker", &args)?.stdout)
    }

    /// Lists all networks as JSON Lines.
    pub fn list_networks(host: &str) -> Result<String, String> {
        let mut args = base_args(host);
        args.extend(["network".to_string(), "ls".to_string(), "--format".to_string(), "json".to_string()]);
        Ok(exec::run("docker", &args)?.stdout)
    }

    /// Full inspect output (a JSON array with one element) for a single network.
    pub fn inspect_network(host: &str, id: &str) -> Result<String, String> {
        let mut args = base_args(host);
        args.extend(["network".to_string(), "inspect".to_string(), id.to_string()]);
        Ok(exec::run("docker", &args)?.stdout)
    }

    pub fn remove_network(host: &str, id: &str) -> Result<(), String> {
        let mut args = base_args(host);
        args.extend(["network".to_string(), "rm".to_string(), id.to_string()]);
        exec::run("docker", &args)?;
        Ok(())
    }
}
