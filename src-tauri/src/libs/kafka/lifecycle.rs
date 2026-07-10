use crate::libs::cli::docker::Docker;
use crate::libs::cli::helm::Helm;
use crate::libs::cli::kubectl::Kubectl;

pub struct KafkaLifecycle;

impl KafkaLifecycle {
    pub fn docker_start(
        host: &str,
        container_name: &str,
        image: &str,
        port: u16,
        extra_env: &[(String, String)],
    ) -> Result<(), String> {
        Docker::run_kafka_container(host, container_name, image, port, extra_env)?;
        Ok(())
    }

    pub fn docker_stop(host: &str, container_name: &str) -> Result<(), String> {
        Docker::stop_container(host, container_name)
    }

    /// Destroys the existing container and its data volume (both best-effort,
    /// since a container/volume that never existed isn't an error here), then
    /// starts a fresh broker with no prior topics/messages.
    pub fn docker_reset(
        host: &str,
        container_name: &str,
        image: &str,
        port: u16,
        extra_env: &[(String, String)],
    ) -> Result<(), String> {
        let _ = Docker::remove_container(host, container_name, true);
        let _ = Docker::remove_volume(host, &format!("{container_name}-data"));
        Docker::run_kafka_container(host, container_name, image, port, extra_env)?;
        Ok(())
    }

    pub fn helm_start(
        context: &str,
        namespace: &str,
        release: &str,
        chart: &str,
        values: &[(String, String)],
    ) -> Result<(), String> {
        Helm::install(context, namespace, release, chart, values)?;
        Ok(())
    }

    pub fn helm_stop(context: &str, namespace: &str, release: &str) -> Result<(), String> {
        Helm::uninstall(context, namespace, release)
    }

    /// Uninstalls the release, deletes its PVCs by label (Helm's uninstall
    /// leaves PVCs behind by design), then reinstalls fresh.
    pub fn helm_reset(
        context: &str,
        namespace: &str,
        release: &str,
        chart: &str,
        values: &[(String, String)],
    ) -> Result<(), String> {
        let _ = Helm::uninstall(context, namespace, release);
        let _ = Kubectl::delete_by_label(
            context,
            namespace,
            "pvc",
            &format!("app.kubernetes.io/instance={release}"),
        );
        Helm::install(context, namespace, release, chart, values)?;
        Ok(())
    }
}
