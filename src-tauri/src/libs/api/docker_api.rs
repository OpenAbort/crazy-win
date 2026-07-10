use serde_json::Value;

/// Converts a `-H`-style host string (`tcp://host:port`, or a bare `host:port`)
/// into a plain `http://` base URL reqwest can use.
fn base_url(host: &str) -> Result<String, String> {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return Err("Direct API mode needs a host, e.g. tcp://127.0.0.1:2375".to_string());
    }
    if let Some(rest) = trimmed.strip_prefix("tcp://") {
        Ok(format!("http://{rest}"))
    } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        Ok(trimmed.to_string())
    } else {
        Ok(format!("http://{trimmed}"))
    }
}

async fn check_status(resp: reqwest::Response) -> Result<reqwest::Response, String> {
    if resp.status().is_success() {
        return Ok(resp);
    }
    let status = resp.status();
    let body = resp.text().await.unwrap_or_default();
    let message = serde_json::from_str::<Value>(&body)
        .ok()
        .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(|s| s.to_string()))
        .unwrap_or(body);
    Err(format!("Docker API error ({status}): {message}"))
}

/// Reshapes an `/containers/json` entry into the same field names/shapes the
/// `docker ps --format json` CLI path already produces, so the frontend's
/// parsing works unchanged regardless of connection mode.
fn normalize_container(v: &Value) -> Value {
    let id = v.get("Id").and_then(|x| x.as_str()).unwrap_or_default();
    let image = v.get("Image").and_then(|x| x.as_str()).unwrap_or_default();
    let names = v
        .get("Names")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|n| n.as_str())
                .map(|n| n.trim_start_matches('/'))
                .collect::<Vec<_>>()
                .join(",")
        })
        .unwrap_or_default();
    let state = v.get("State").and_then(|x| x.as_str()).unwrap_or_default();
    let status = v.get("Status").and_then(|x| x.as_str()).unwrap_or_default();
    let ports = v
        .get("Ports")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .map(format_port)
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();

    serde_json::json!({
        "ID": id,
        "Image": image,
        "Names": names,
        "State": state,
        "Status": status,
        "Ports": ports,
    })
}

fn format_port(p: &Value) -> String {
    let private = p.get("PrivatePort").and_then(|x| x.as_u64());
    let public = p.get("PublicPort").and_then(|x| x.as_u64());
    let typ = p.get("Type").and_then(|x| x.as_str()).unwrap_or("tcp");
    let ip = p.get("IP").and_then(|x| x.as_str()).unwrap_or("0.0.0.0");
    match (private, public) {
        (Some(priv_p), Some(pub_p)) => format!("{ip}:{pub_p}->{priv_p}/{typ}"),
        (Some(priv_p), None) => format!("{priv_p}/{typ}"),
        _ => String::new(),
    }
}

/// Docker multiplexes stdout/stderr with an 8-byte frame header per chunk,
/// but only when the container was NOT started with a TTY attached.
fn demux_log_stream(bytes: &[u8]) -> String {
    let mut out = String::new();
    let mut i = 0;
    while i + 8 <= bytes.len() {
        let size = u32::from_be_bytes([bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]]) as usize;
        let start = i + 8;
        let end = (start + size).min(bytes.len());
        out.push_str(&String::from_utf8_lossy(&bytes[start..end]));
        i = end;
    }
    out
}

pub struct DockerApi;

impl DockerApi {
    pub async fn list_containers(host: &str) -> Result<String, String> {
        let base = base_url(host)?;
        let resp = reqwest::get(format!("{base}/containers/json?all=true"))
            .await
            .map_err(|e| e.to_string())?;
        let resp = check_status(resp).await?;
        let containers: Vec<Value> = resp.json().await.map_err(|e| e.to_string())?;
        Ok(containers
            .iter()
            .map(normalize_container)
            .map(|c| c.to_string())
            .collect::<Vec<_>>()
            .join("\n"))
    }

    /// Wraps the single-object response in a JSON array, matching the shape
    /// `docker inspect <id>` already produces (an array with one element).
    pub async fn inspect_container(host: &str, id: &str) -> Result<String, String> {
        let base = base_url(host)?;
        let resp = reqwest::get(format!("{base}/containers/{id}/json"))
            .await
            .map_err(|e| e.to_string())?;
        let resp = check_status(resp).await?;
        let value: Value = resp.json().await.map_err(|e| e.to_string())?;
        Ok(Value::Array(vec![value]).to_string())
    }

    pub async fn container_logs(host: &str, id: &str, tail: Option<u32>) -> Result<String, String> {
        let base = base_url(host)?;

        let inspect_resp = check_status(
            reqwest::get(format!("{base}/containers/{id}/json"))
                .await
                .map_err(|e| e.to_string())?,
        )
        .await?;
        let inspect: Value = inspect_resp.json().await.map_err(|e| e.to_string())?;
        let tty = inspect
            .get("Config")
            .and_then(|c| c.get("Tty"))
            .and_then(|t| t.as_bool())
            .unwrap_or(false);

        let tail_param = tail.map(|n| n.to_string()).unwrap_or_else(|| "all".to_string());
        let url = format!("{base}/containers/{id}/logs?stdout=true&stderr=true&tail={tail_param}");
        let resp = check_status(reqwest::get(&url).await.map_err(|e| e.to_string())?).await?;
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;

        Ok(if tty {
            String::from_utf8_lossy(&bytes).into_owned()
        } else {
            demux_log_stream(&bytes)
        })
    }

    pub async fn remove_container(host: &str, id: &str, force: bool) -> Result<(), String> {
        let base = base_url(host)?;
        let client = reqwest::Client::new();
        let resp = client
            .delete(format!("{base}/containers/{id}?force={force}"))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        check_status(resp).await?;
        Ok(())
    }

    pub async fn info(host: &str) -> Result<String, String> {
        let base = base_url(host)?;
        let resp = check_status(reqwest::get(format!("{base}/info")).await.map_err(|e| e.to_string())?).await?;
        resp.text().await.map_err(|e| e.to_string())
    }

    /// Pulls `image` if not already present, matching the CLI path's implicit
    /// `docker run` pull — the Engine API never pulls automatically.
    async fn pull_image(host: &str, image: &str) -> Result<(), String> {
        let base = base_url(host)?;
        let (name, tag) = image.rsplit_once(':').unwrap_or((image, "latest"));
        let client = reqwest::Client::new();
        let resp = client
            .post(format!("{base}/images/create?fromImage={name}&tag={tag}"))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        check_status(resp).await?;
        Ok(())
    }

    /// Creates and starts a detached single-node KRaft-mode Kafka broker via
    /// the Engine API — no `docker.exe` required. `extra_env` entries override
    /// the built-in defaults with the same key.
    pub async fn run_kafka_container(
        host: &str,
        container_name: &str,
        image: &str,
        port: u16,
        extra_env: &[(String, String)],
    ) -> Result<(), String> {
        Self::pull_image(host, image).await?;
        let base = base_url(host)?;

        let overridden: std::collections::HashSet<&str> =
            extra_env.iter().map(|(k, _)| k.as_str()).collect();
        let mut env: Vec<String> = Vec::new();
        let defaults: Vec<(&str, String)> = vec![
            ("KAFKA_NODE_ID", "1".to_string()),
            ("KAFKA_PROCESS_ROLES", "broker,controller".to_string()),
            ("KAFKA_LISTENERS", "PLAINTEXT://:9092,CONTROLLER://:9093".to_string()),
            ("KAFKA_ADVERTISED_LISTENERS", format!("PLAINTEXT://localhost:{port}")),
            ("KAFKA_CONTROLLER_QUORUM_VOTERS", "1@localhost:9093".to_string()),
            ("KAFKA_CONTROLLER_LISTENER_NAMES", "CONTROLLER".to_string()),
            ("KAFKA_INTER_BROKER_LISTENER_NAME", "PLAINTEXT".to_string()),
            ("CLUSTER_ID", "MkU3OEVBNTcwNTJENDM2Qk".to_string()),
        ];
        for (k, v) in defaults {
            if !overridden.contains(k) {
                env.push(format!("{k}={v}"));
            }
        }
        for (k, v) in extra_env {
            env.push(format!("{k}={v}"));
        }

        let body = serde_json::json!({
            "Image": image,
            "Env": env,
            "ExposedPorts": { "9092/tcp": {} },
            "HostConfig": {
                "PortBindings": { "9092/tcp": [{ "HostPort": port.to_string() }] },
                "Binds": [format!("{container_name}-data:/var/lib/kafka/data")],
            },
        });

        let client = reqwest::Client::new();
        let create_resp = client
            .post(format!("{base}/containers/create?name={container_name}"))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let create_resp = check_status(create_resp).await?;
        let created: Value = create_resp.json().await.map_err(|e| e.to_string())?;
        let id = created
            .get("Id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Docker API did not return a container id.".to_string())?;

        let start_resp = client
            .post(format!("{base}/containers/{id}/start"))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        check_status(start_resp).await?;
        Ok(())
    }

    pub async fn stop_container(host: &str, name: &str) -> Result<(), String> {
        let base = base_url(host)?;
        let client = reqwest::Client::new();
        let resp = client
            .post(format!("{base}/containers/{name}/stop"))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        check_status(resp).await?;
        Ok(())
    }

    /// Best-effort volume removal; a missing volume is not an error since a
    /// fresh start never created one yet.
    pub async fn remove_volume(host: &str, volume: &str) -> Result<(), String> {
        let base = base_url(host)?;
        let client = reqwest::Client::new();
        let _ = client.delete(format!("{base}/volumes/{volume}")).send().await;
        Ok(())
    }
}
