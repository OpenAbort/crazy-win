use std::io;
use std::os::windows::process::CommandExt;
use std::process::Command;

/// Prevents a console window from flashing on screen when we shell out from a GUI app.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct ExecOutput {
    pub stdout: String,
    pub stderr: String,
}

/// Runs `program` with `args`, decoding output lossily (CLI output isn't guaranteed UTF-8).
/// Errors are mapped to messages safe to show directly in the UI.
pub fn run(program: &str, args: &[String]) -> Result<ExecOutput, String> {
    let output = Command::new(program)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| map_spawn_err(program, e))?;

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

fn map_spawn_err(program: &str, e: io::Error) -> String {
    match e.kind() {
        io::ErrorKind::NotFound => format!(
            "{program} was not found on PATH. Install it and make sure `{program}` runs from a terminal, then restart DevBox."
        ),
        _ => e.to_string(),
    }
}
