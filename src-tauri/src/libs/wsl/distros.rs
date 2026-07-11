use std::io::ErrorKind;
use std::os::windows::process::CommandExt;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Lists installed WSL distro names via `wsl.exe -l -q`.
///
/// `wsl.exe`'s piped stdout is UTF-16LE (Windows console text, not a UTF-8
/// pipe), so this must NOT reuse `exec::run`'s lossy-UTF-8 decode — that
/// would garble the output with interleaved null bytes.
pub fn list_distros() -> Result<Vec<String>, String> {
    let output = Command::new("wsl.exe")
        .args(["-l", "-q"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| match e.kind() {
            ErrorKind::NotFound => {
                "wsl.exe was not found on PATH. Install WSL with `wsl --install`, then restart DevBox.".to_string()
            }
            _ => e.to_string(),
        })?;

    if !output.status.success() {
        let stderr = decode_wsl_output(&output.stderr);
        return Err(if stderr.trim().is_empty() {
            "wsl.exe exited with a non-zero status.".to_string()
        } else {
            stderr.trim().to_string()
        });
    }

    let text = decode_wsl_output(&output.stdout);
    let distros: Vec<String> = text
        .lines()
        .map(|line| line.trim_end_matches('\r').trim())
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect();

    Ok(distros)
}

/// Converts an absolute Windows path (e.g. `E:\Dev\Project`) to its
/// WSL-visible equivalent under the default `/mnt/<drive>` mount (e.g.
/// `/mnt/e/Dev/Project`).
///
/// This is done locally rather than by shelling out to `wsl.exe wslpath -u`:
/// `wsl.exe` relays arguments to the Linux side by reconstructing a command
/// line, and backslashes get silently swallowed in that relay (verified: a
/// path like `E:\Dev\Project\OpenAbort` arrives on the Linux side as
/// `E:DevProjectOpenAbort`, i.e. every backslash-letter pair had its
/// backslash stripped). Converting locally sidesteps that entirely and
/// doesn't require spawning a process.
pub fn windows_path_to_wsl(path: &str) -> Result<String, String> {
    let path = path.trim();
    let mut chars = path.chars();
    let drive = chars
        .next()
        .filter(|c| c.is_ascii_alphabetic())
        .ok_or_else(|| format!("Not an absolute Windows path: {path}"))?;
    if chars.next() != Some(':') {
        return Err(format!("Not an absolute Windows path: {path}"));
    }

    let rest = path[2..].replace('\\', "/");
    let rest = rest.trim_start_matches('/');
    Ok(format!("/mnt/{}/{}", drive.to_ascii_lowercase(), rest))
}

/// `wsl.exe -l -q` writes UTF-16LE to a piped stdout. Decode as UTF-16LE,
/// falling back to lossy UTF-8 if the byte count is odd or decoding fails
/// (e.g. some WSL builds/locales emit plain UTF-8 already).
fn decode_wsl_output(bytes: &[u8]) -> String {
    if bytes.len() % 2 == 0 && !bytes.is_empty() {
        let utf16: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        if let Ok(text) = String::from_utf16(&utf16) {
            return text;
        }
    }
    String::from_utf8_lossy(bytes).into_owned()
}
