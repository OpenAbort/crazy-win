use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Standard hosts file location for the current OS.
#[cfg(windows)]
const DEFAULT_HOSTS_PATH: &str = r"C:\Windows\System32\drivers\etc\hosts";
#[cfg(not(windows))]
const DEFAULT_HOSTS_PATH: &str = "/etc/hosts";

/// Reads and writes the system hosts file.
pub struct HostsFile {
    path: PathBuf,
}

impl HostsFile {
    /// Point at the standard hosts file for this OS.
    pub fn new() -> Self {
        HostsFile {
            path: PathBuf::from(DEFAULT_HOSTS_PATH),
        }
    }

    /// Point at a custom path (useful for tests).
    #[allow(dead_code)]
    pub fn with_path<P: AsRef<Path>>(path: P) -> Self {
        HostsFile {
            path: path.as_ref().to_path_buf(),
        }
    }

    /// Read the whole file into a String.
    pub fn read(&self) -> io::Result<String> {
        fs::read_to_string(&self.path)
    }

    /// Overwrite the file with `content`.
    pub fn write(&self, content: &str) -> io::Result<()> {
        fs::write(&self.path, content)
    }
}
