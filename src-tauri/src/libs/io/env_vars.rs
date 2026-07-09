use std::collections::BTreeMap;
use std::io;

use winreg::enums::*;
use winreg::RegKey;

const SYSTEM_ENV_PATH: &str = r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment";

fn open(scope: &str, write: bool) -> io::Result<RegKey> {
    let access = if write { KEY_READ | KEY_WRITE } else { KEY_READ };
    match scope {
        "user" => RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags("Environment", access),
        "system" => {
            RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(SYSTEM_ENV_PATH, access)
        }
        other => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("Unknown scope: {other}"),
        )),
    }
}

fn map_io_err(e: io::Error) -> String {
    match e.kind() {
        io::ErrorKind::PermissionDenied => {
            "Permission denied. Run the app as administrator to edit system environment variables."
                .to_string()
        }
        _ => e.to_string(),
    }
}

pub struct EnvVars;

impl EnvVars {
    /// Read all values from the scope's key, sorted by name for stable ordering/diffing.
    pub fn read(scope: &str) -> Result<Vec<(String, String)>, String> {
        let key = open(scope, false).map_err(map_io_err)?;
        let mut map: BTreeMap<String, String> = BTreeMap::new();
        for entry in key.enum_values() {
            let (name, _) = entry.map_err(|e| e.to_string())?;
            // Skip values that don't decode as a plain string (e.g. odd REG types
            // left behind by some installers) rather than failing the whole read.
            if let Ok(value) = key.get_value::<String, _>(&name) {
                map.insert(name, value);
            }
        }
        Ok(map.into_iter().collect())
    }

    /// Diff `desired` against the live registry state for `scope` and apply sets/deletes.
    pub fn write(scope: &str, desired: &[(String, String)]) -> Result<(), String> {
        let key = open(scope, true).map_err(map_io_err)?;
        let current: BTreeMap<String, String> = Self::read(scope)?.into_iter().collect();
        let desired_map: BTreeMap<&str, &str> =
            desired.iter().map(|(n, v)| (n.as_str(), v.as_str())).collect();

        for name in current.keys() {
            if !desired_map.contains_key(name.as_str()) {
                key.delete_value(name).map_err(map_io_err)?;
            }
        }
        for (name, value) in desired {
            if current.get(name).map(|v| v.as_str()) != Some(value.as_str()) {
                key.set_value(name, value).map_err(map_io_err)?;
            }
        }
        Ok(())
    }
}
