use keyring::Entry;
use serde::{Deserialize, Serialize};
use thiserror::Error;

const SERVICE_NAME: &str = "com.dbimagelinks.desktop";
const ACCOUNT_NAME: &str = "dropbox";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCredentials {
    pub app_key: String,
    pub refresh_token: String,
}

#[derive(Debug, Error)]
pub enum SecretError {
    #[error("Could not access secure credential storage: {0}")]
    Keyring(#[from] keyring::Error),
    #[error("Stored Dropbox credentials are damaged. Disconnect and run setup again: {0}")]
    Decode(#[from] serde_json::Error),
}

pub struct CredentialStore;

impl CredentialStore {
    pub fn new() -> Self {
        Self
    }

    pub fn load(&self) -> Result<Option<StoredCredentials>, SecretError> {
        let entry = self.entry()?;
        match entry.get_password() {
            Ok(value) => Ok(Some(serde_json::from_str(&value)?)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    pub fn save(&self, app_key: &str, refresh_token: &str) -> Result<(), SecretError> {
        let credentials = StoredCredentials {
            app_key: app_key.to_string(),
            refresh_token: refresh_token.to_string(),
        };
        self.entry()?
            .set_password(&serde_json::to_string(&credentials)?)?;
        Ok(())
    }

    pub fn clear(&self) -> Result<(), SecretError> {
        let entry = self.entry()?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(error.into()),
        }
    }

    fn entry(&self) -> Result<Entry, keyring::Error> {
        Entry::new(SERVICE_NAME, ACCOUNT_NAME)
    }
}
