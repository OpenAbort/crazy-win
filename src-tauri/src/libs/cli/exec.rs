use std::io::{self, Write};
use std::process::{Child, Command, Stdio};

/// Prevents a console window from flashing on screen when we shell out from a
/// GUI app. Windows-only concern — a no-op on Linux/macOS, where GUI-launched
/// processes never pop a console in the first place.
#[cfg(windows)]
fn suppress_console_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
fn suppress_console_window(_cmd: &mut Command) {}

pub struct ExecOutput {
    pub stdout: String,
    pub stderr: String,
}

/// Runs `program` with `args`, decoding output lossily (CLI output isn't guaranteed UTF-8).
/// Errors are mapped to messages safe to show directly in the UI.
pub fn run(program: &str, args: &[String]) -> Result<ExecOutput, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    suppress_console_window(&mut cmd);
    let output = cmd.output().map_err(|e| map_spawn_err(program, e))?;
    finish_output(program, output)
}

/// Like `run`, but pipes `stdin_data` to the child's stdin before waiting —
/// needed for commands that read their input from stdin (e.g. `kubectl apply -f -`).
pub fn run_with_stdin(program: &str, args: &[String], stdin_data: &str) -> Result<ExecOutput, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    suppress_console_window(&mut cmd);
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| map_spawn_err(program, e))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(stdin_data.as_bytes()).map_err(|e| e.to_string())?;
    } // dropping `stdin` here closes the pipe, signaling EOF so the child doesn't hang waiting for more input
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    finish_output(program, output)
}

fn finish_output(program: &str, output: std::process::Output) -> Result<ExecOutput, String> {
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if !output.status.success() {
        let message = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            stdout.trim().to_string()
        };
        return Err(if message.is_empty() {
            format!("{program} exited with a non-zero status.")
        } else {
            message
        });
    }

    Ok(ExecOutput { stdout, stderr })
}

/// Spawns `program` with piped stdout/stderr instead of waiting for completion,
/// so a caller can stream output line-by-line (e.g. `docker logs -f`).
pub fn spawn_piped(program: &str, args: &[String]) -> Result<Child, String> {
    let mut cmd = Command::new(program);
    cmd.args(args);
    suppress_console_window(&mut cmd);
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| map_spawn_err(program, e))
}

fn map_spawn_err(program: &str, e: io::Error) -> String {
    match e.kind() {
        io::ErrorKind::NotFound => format!(
            "{program} was not found on PATH. Install it and make sure `{program}` runs from a terminal, then restart DevBox."
        ),
        _ => e.to_string(),
    }
}
