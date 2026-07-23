#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponseData {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub duration_ms: u64,
}

pub struct HttpClient;

impl HttpClient {
    pub async fn send(
        method: &str,
        url: &str,
        headers: &[(String, String)],
        body: Option<&str>,
        insecure: bool,
    ) -> Result<HttpResponseData, String> {
        let mut builder = reqwest::Client::builder().timeout(std::time::Duration::from_secs(30));
        if insecure {
            builder = builder.danger_accept_invalid_certs(true);
        }
        let client = builder.build().map_err(|e| e.to_string())?;

        let method: reqwest::Method = method.parse().map_err(|_| format!("Invalid method: {method}"))?;
        let mut req = client.request(method, url);
        for (name, value) in headers {
            req = req.header(name, value);
        }
        if let Some(b) = body {
            req = req.body(b.to_string());
        }

        let start = std::time::Instant::now();
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let duration_ms = start.elapsed().as_millis() as u64;

        let status = resp.status();
        let headers = resp
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();
        let body = resp.text().await.map_err(|e| e.to_string())?;

        Ok(HttpResponseData {
            status: status.as_u16(),
            status_text: status.canonical_reason().unwrap_or("").to_string(),
            headers,
            body,
            duration_ms,
        })
    }
}
