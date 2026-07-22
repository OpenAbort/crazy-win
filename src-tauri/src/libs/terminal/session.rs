use base64::Engine;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::Emitter;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputPayload {
    pub session_id: u64,
    pub data: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionClosedPayload {
    pub session_id: u64,
    pub exit_code: Option<u32>,
}

struct TerminalSessionHandle {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
}

fn build_command(shell: &str, cwd: &Option<String>) -> CommandBuilder {
    let mut cmd = CommandBuilder::new(shell);
    if let Some(cwd) = cwd {
        cmd.cwd(cwd);
    }
    cmd
}

/// Shells to try, in order, for the current OS. `start()` tries each in turn
/// and only fails if every candidate fails to spawn.
#[cfg(windows)]
fn shell_candidates() -> Vec<String> {
    // Prefer PowerShell 7 (`pwsh.exe`) if installed; fall back to the
    // always-present Windows PowerShell (`powershell.exe`) otherwise.
    vec!["pwsh.exe".to_string(), "powershell.exe".to_string()]
}
#[cfg(not(windows))]
fn shell_candidates() -> Vec<String> {
    // Prefer the user's configured shell ($SHELL), falling back to bash/sh,
    // which are present on essentially every Linux distro.
    let mut candidates = Vec::new();
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() {
            candidates.push(shell);
        }
    }
    candidates.push("bash".to_string());
    candidates.push("sh".to_string());
    candidates
}

/// Tracks live native-shell PTY sessions, keyed by an id handed back to the
/// frontend. Structurally identical to `WslSessions` (same PTY plumbing,
/// read/write/resize/close semantics) — the only difference is which
/// executable gets spawned. Dropping a session's handle (on `close`) closes
/// the pseudo console, which terminates the attached shell process.
#[derive(Default)]
pub struct TerminalSessions {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<u64, TerminalSessionHandle>>,
}

impl TerminalSessions {
    pub fn start(&self, cwd: Option<String>, app: tauri::AppHandle) -> Result<u64, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let candidates = shell_candidates();
        let mut last_err: Option<String> = None;
        let mut child = None;
        for shell in &candidates {
            match pair.slave.spawn_command(build_command(shell, &cwd)) {
                Ok(c) => {
                    child = Some(c);
                    break;
                }
                Err(e) => last_err = Some(e.to_string()),
            }
        }
        let mut child = child.ok_or_else(|| {
            last_err.unwrap_or_else(|| "No shell available to start a session with.".to_string())
        })?;
        drop(pair.slave);

        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

        let session_id = self.next_id.fetch_add(1, Ordering::SeqCst);
        self.sessions.lock().unwrap().insert(
            session_id,
            TerminalSessionHandle {
                writer,
                master: pair.master,
            },
        );

        let output_app = app.clone();
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                        let _ = output_app.emit("terminal-output", TerminalOutputPayload { session_id, data });
                    }
                    Err(_) => break,
                }
            }
        });

        std::thread::spawn(move || {
            let exit_code = child.wait().ok().map(|status| status.exit_code());
            let _ = app.emit("terminal-session-closed", TerminalSessionClosedPayload { session_id, exit_code });
        });

        Ok(session_id)
    }

    pub fn write(&self, id: u64, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(handle) = sessions.get_mut(&id) {
            handle.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
            handle.writer.flush().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn resize(&self, id: u64, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        if let Some(handle) = sessions.get(&id) {
            handle
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Drops the session's writer/master, closing the pseudo console and
    /// terminating the attached process. Safe to call on an unknown id.
    pub fn close(&self, id: u64) -> Result<(), String> {
        self.sessions.lock().unwrap().remove(&id);
        Ok(())
    }
}
