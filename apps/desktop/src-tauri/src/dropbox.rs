use crate::natural_sort;
use crate::secrets::StoredCredentials;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use reqwest::{header::HeaderMap, StatusCode};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;
use thiserror::Error;
use tokio::time::sleep;
use url::Url;

const AUTHORIZE_URL: &str = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL: &str = "https://api.dropboxapi.com/oauth2/token";
const GET_SHARED_LINK_METADATA_URL: &str =
    "https://api.dropboxapi.com/2/sharing/get_shared_link_metadata";
const LIST_FOLDER_URL: &str = "https://api.dropboxapi.com/2/files/list_folder";
const LIST_FOLDER_CONTINUE_URL: &str = "https://api.dropboxapi.com/2/files/list_folder/continue";
const CREATE_SHARED_LINK_URL: &str =
    "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings";
const LIST_SHARED_LINKS_URL: &str = "https://api.dropboxapi.com/2/sharing/list_shared_links";
const SCOPES: &str = "files.metadata.read sharing.read sharing.write";
const MAX_ATTEMPTS: usize = 5;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessMode {
    Single,
    Multi,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkuResult {
    pub sku: String,
    pub links: Vec<String>,
    pub image_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessFailure {
    pub sku: String,
    pub item: String,
    pub message: String,
}

pub struct ProcessOutput {
    pub rows: Vec<SkuResult>,
    pub failures: Vec<ProcessFailure>,
}

pub struct AuthSession {
    pub auth_url: String,
    pub code_verifier: String,
}

impl AuthSession {
    pub fn new(app_key: &str) -> Self {
        let code_verifier = create_code_verifier();
        let code_challenge = create_code_challenge(&code_verifier);
        let mut url = Url::parse(AUTHORIZE_URL).expect("valid Dropbox auth URL");
        url.query_pairs_mut()
            .append_pair("client_id", app_key)
            .append_pair("response_type", "code")
            .append_pair("token_access_type", "offline")
            .append_pair("code_challenge_method", "S256")
            .append_pair("code_challenge", &code_challenge)
            .append_pair("scope", SCOPES);

        Self {
            auth_url: url.to_string(),
            code_verifier,
        }
    }
}

#[derive(Debug, Error)]
pub enum DropboxError {
    #[error("Dropbox authorization expired or was revoked.")]
    Unauthorized(String),
    #[error("Dropbox rejected the request: {0}")]
    Api(String),
    #[error("Could not reach Dropbox: {0}")]
    Network(#[from] reqwest::Error),
    #[error("The Dropbox response was not in the expected format: {0}")]
    Decode(#[from] serde_json::Error),
    #[error("The Dropbox folder link is invalid. Paste a https://www.dropbox.com folder link.")]
    InvalidFolderUrl,
}

#[derive(Clone)]
pub struct DropboxClient {
    http: reqwest::Client,
}

impl DropboxClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }

    pub async fn exchange_auth_code(
        &self,
        app_key: &str,
        code: &str,
        code_verifier: &str,
    ) -> Result<TokenResponse, DropboxError> {
        let response = self
            .http
            .post(TOKEN_URL)
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("client_id", app_key),
                ("code_verifier", code_verifier),
            ])
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await?;
        if !status.is_success() {
            return Err(map_error_status(status, text));
        }

        let token: TokenResponse = serde_json::from_str(&text)?;
        if token.refresh_token.trim().is_empty() {
            return Err(DropboxError::Api(
                "Dropbox did not return a refresh token. Check that offline access was allowed."
                    .to_string(),
            ));
        }
        Ok(token)
    }

    pub async fn process_folder(
        &self,
        credentials: &StoredCredentials,
        folder_url: &str,
        mode: ProcessMode,
    ) -> Result<ProcessOutput, DropboxError> {
        validate_dropbox_folder_url(folder_url)?;
        let access_token = self.refresh_access_token(credentials).await?;
        let root = self
            .get_shared_link_metadata(&access_token, folder_url, None)
            .await?;
        let root_entries = self.list_folder(&access_token, folder_url, "").await?;

        match mode {
            ProcessMode::Single => {
                let files = sorted_files(root_entries);
                Ok(self.process_sku(&access_token, root.name, files).await)
            }
            ProcessMode::Multi => {
                let mut folders = sorted_folders(root_entries);
                let mut rows = Vec::new();
                let mut failures = Vec::new();

                for folder in folders.drain(..) {
                    match self
                        .list_folder(&access_token, folder_url, &format!("/{}", folder.name))
                        .await
                    {
                        Ok(entries) => {
                            let sku_output = self
                                .process_sku(&access_token, folder.name, sorted_files(entries))
                                .await;
                            rows.extend(sku_output.rows);
                            failures.extend(sku_output.failures);
                        }
                        Err(error) => failures.push(ProcessFailure {
                            sku: folder.name,
                            item: "folder".to_string(),
                            message: error.to_string(),
                        }),
                    }
                }

                Ok(ProcessOutput { rows, failures })
            }
        }
    }

    async fn process_sku(
        &self,
        access_token: &str,
        sku: String,
        files: Vec<FileEntry>,
    ) -> ProcessOutput {
        let mut links = Vec::new();
        let mut failures = Vec::new();
        let image_count = files.len();

        for file in files {
            let item = file.name.clone();
            match file.dropbox_path() {
                Some(path) => match self.create_or_reuse_shared_link(access_token, &path).await {
                    Ok(link) => links.push(link),
                    Err(error) => failures.push(ProcessFailure {
                        sku: sku.clone(),
                        item,
                        message: error.to_string(),
                    }),
                },
                None => failures.push(ProcessFailure {
                    sku: sku.clone(),
                    item,
                    message: "Dropbox did not return an account path for this file.".to_string(),
                }),
            }
        }

        ProcessOutput {
            rows: vec![SkuResult {
                sku,
                links,
                image_count,
            }],
            failures,
        }
    }

    async fn refresh_access_token(
        &self,
        credentials: &StoredCredentials,
    ) -> Result<String, DropboxError> {
        let response = self
            .http
            .post(TOKEN_URL)
            .form(&[
                ("grant_type", "refresh_token"),
                ("refresh_token", credentials.refresh_token.as_str()),
                ("client_id", credentials.app_key.as_str()),
            ])
            .send()
            .await?;

        let status = response.status();
        let text = response.text().await?;
        if !status.is_success() {
            return Err(map_error_status(status, text));
        }

        let token: AccessTokenResponse = serde_json::from_str(&text)?;
        Ok(token.access_token)
    }

    async fn get_shared_link_metadata(
        &self,
        access_token: &str,
        folder_url: &str,
        path: Option<&str>,
    ) -> Result<SharedLinkMetadata, DropboxError> {
        let body = match path {
            Some(path) => json!({ "url": folder_url, "path": path }),
            None => json!({ "url": folder_url }),
        };
        self.post_json(GET_SHARED_LINK_METADATA_URL, access_token, &body)
            .await
    }

    async fn list_folder(
        &self,
        access_token: &str,
        folder_url: &str,
        path: &str,
    ) -> Result<Vec<Metadata>, DropboxError> {
        let mut result: ListFolderResponse = self
            .post_json(
                LIST_FOLDER_URL,
                access_token,
                &json!({
                    "path": path,
                    "recursive": false,
                    "include_deleted": false,
                    "limit": 2000,
                    "shared_link": { "url": folder_url }
                }),
            )
            .await?;

        let mut entries = result.entries;
        while result.has_more {
            result = self
                .post_json(
                    LIST_FOLDER_CONTINUE_URL,
                    access_token,
                    &json!({ "cursor": result.cursor }),
                )
                .await?;
            entries.extend(result.entries);
        }

        Ok(entries)
    }

    async fn create_or_reuse_shared_link(
        &self,
        access_token: &str,
        path: &str,
    ) -> Result<String, DropboxError> {
        let response = self
            .post_raw(
                CREATE_SHARED_LINK_URL,
                access_token,
                &json!({
                    "path": path,
                    "settings": {
                        "requested_visibility": "public",
                        "access": "viewer"
                    }
                }),
            )
            .await?;

        if response.status.is_success() {
            let metadata: LinkMetadata = serde_json::from_str(&response.text)?;
            return Ok(metadata.url);
        }

        if response.status == StatusCode::CONFLICT
            && response.text.contains("shared_link_already_exists")
        {
            let value: Value = serde_json::from_str(&response.text).unwrap_or(Value::Null);
            if let Some(url) = find_url(&value) {
                return Ok(url);
            }

            return self.find_existing_link(access_token, path).await;
        }

        Err(map_error_status(response.status, response.text))
    }

    async fn find_existing_link(
        &self,
        access_token: &str,
        path: &str,
    ) -> Result<String, DropboxError> {
        let response: ListSharedLinksResponse = self
            .post_json(
                LIST_SHARED_LINKS_URL,
                access_token,
                &json!({ "path": path, "direct_only": true }),
            )
            .await?;

        response
            .links
            .into_iter()
            .next()
            .map(|link| link.url)
            .ok_or_else(|| {
                DropboxError::Api(
                    "Dropbox reported an existing shared link but did not return it.".to_string(),
                )
            })
    }

    async fn post_json<T: DeserializeOwned>(
        &self,
        url: &str,
        access_token: &str,
        body: &Value,
    ) -> Result<T, DropboxError> {
        let response = self.post_raw(url, access_token, body).await?;
        if !response.status.is_success() {
            return Err(map_error_status(response.status, response.text));
        }
        Ok(serde_json::from_str(&response.text)?)
    }

    async fn post_raw(
        &self,
        url: &str,
        access_token: &str,
        body: &Value,
    ) -> Result<RawResponse, DropboxError> {
        let mut attempt = 0;
        loop {
            let response = self
                .http
                .post(url)
                .bearer_auth(access_token)
                .json(body)
                .send()
                .await?;

            let status = response.status();
            let headers = response.headers().clone();
            let text = response.text().await?;

            if status != StatusCode::TOO_MANY_REQUESTS || attempt + 1 >= MAX_ATTEMPTS {
                return Ok(RawResponse { status, text });
            }

            sleep(retry_delay(attempt, &headers)).await;
            attempt += 1;
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
struct AccessTokenResponse {
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct SharedLinkMetadata {
    name: String,
}

#[derive(Debug, Deserialize)]
struct LinkMetadata {
    url: String,
}

#[derive(Debug, Deserialize)]
struct ListSharedLinksResponse {
    links: Vec<LinkMetadata>,
}

#[derive(Debug, Deserialize)]
struct ListFolderResponse {
    entries: Vec<Metadata>,
    cursor: String,
    has_more: bool,
}

#[derive(Debug, Deserialize)]
#[serde(tag = ".tag")]
enum Metadata {
    #[serde(rename = "file")]
    File(FileEntry),
    #[serde(rename = "folder")]
    Folder(FolderEntry),
    #[serde(other)]
    Other,
}

#[derive(Debug, Clone, Deserialize)]
struct FileEntry {
    name: String,
    path_lower: Option<String>,
    path_display: Option<String>,
}

impl FileEntry {
    fn dropbox_path(&self) -> Option<String> {
        self.path_lower
            .clone()
            .or_else(|| self.path_display.clone())
    }
}

#[derive(Debug, Clone, Deserialize)]
struct FolderEntry {
    name: String,
}

struct RawResponse {
    status: StatusCode,
    text: String,
}

fn sorted_files(entries: Vec<Metadata>) -> Vec<FileEntry> {
    let mut files: Vec<FileEntry> = entries
        .into_iter()
        .filter_map(|entry| match entry {
            Metadata::File(file) => Some(file),
            _ => None,
        })
        .collect();
    natural_sort::sort_names(&mut files, |file| &file.name);
    files
}

fn sorted_folders(entries: Vec<Metadata>) -> Vec<FolderEntry> {
    let mut folders: Vec<FolderEntry> = entries
        .into_iter()
        .filter_map(|entry| match entry {
            Metadata::Folder(folder) => Some(folder),
            _ => None,
        })
        .collect();
    natural_sort::sort_names(&mut folders, |folder| &folder.name);
    folders
}

fn validate_dropbox_folder_url(value: &str) -> Result<(), DropboxError> {
    let url = Url::parse(value).map_err(|_| DropboxError::InvalidFolderUrl)?;
    match (url.scheme(), url.host_str()) {
        ("https", Some(host)) if host == "www.dropbox.com" || host == "dropbox.com" => Ok(()),
        _ => Err(DropboxError::InvalidFolderUrl),
    }
}

fn create_code_verifier() -> String {
    let mut bytes = [0_u8; 64];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn create_code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn retry_delay(attempt: usize, headers: &HeaderMap) -> Duration {
    let retry_after = headers
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());
    Duration::from_secs(retry_delay_seconds(attempt, retry_after))
}

pub fn retry_delay_seconds(attempt: usize, retry_after: Option<u64>) -> u64 {
    retry_after.unwrap_or_else(|| 2_u64.saturating_pow(attempt as u32).min(30))
}

fn map_error_status(status: StatusCode, text: String) -> DropboxError {
    if status == StatusCode::UNAUTHORIZED {
        return DropboxError::Unauthorized(extract_error_summary(&text));
    }
    DropboxError::Api(extract_error_summary(&text))
}

fn extract_error_summary(text: &str) -> String {
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|value| {
            value
                .get("error_summary")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| text.to_string())
}

fn find_url(value: &Value) -> Option<String> {
    match value {
        Value::Object(map) => {
            if let Some(url) = map.get("url").and_then(Value::as_str) {
                return Some(url.to_string());
            }
            map.values().find_map(find_url)
        }
        Value::Array(items) => items.iter().find_map(find_url),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_dropbox_urls() {
        assert!(validate_dropbox_folder_url("https://www.dropbox.com/scl/fo/abc").is_ok());
        assert!(validate_dropbox_folder_url("https://example.com/scl/fo/abc").is_err());
        assert!(validate_dropbox_folder_url("not a url").is_err());
    }

    #[test]
    fn uses_retry_after_header_when_present() {
        assert_eq!(retry_delay_seconds(0, Some(8)), 8);
        assert_eq!(retry_delay_seconds(0, None), 1);
        assert_eq!(retry_delay_seconds(3, None), 8);
    }

    #[test]
    fn extracts_existing_link_from_nested_error() {
        let value = json!({
            "error": {
                ".tag": "shared_link_already_exists",
                "shared_link_already_exists": {
                    ".tag": "metadata",
                    "metadata": {
                        "url": "https://www.dropbox.com/s/file"
                    }
                }
            }
        });
        assert_eq!(
            find_url(&value),
            Some("https://www.dropbox.com/s/file".to_string())
        );
    }
}
