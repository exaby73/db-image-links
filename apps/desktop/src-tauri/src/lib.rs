mod csv_export;
mod dropbox;
mod natural_sort;
mod secrets;

use dropbox::{AuthSession, DropboxClient, ProcessMode};
use secrets::CredentialStore;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionStatus {
    connected: bool,
    app_key_hint: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthStart {
    auth_url: String,
    code_verifier: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProcessRequest {
    folder_url: String,
    mode: ProcessMode,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessResponse {
    rows: Vec<dropbox::SkuResult>,
    failures: Vec<dropbox::ProcessFailure>,
    csv: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveCsvRequest {
    path: String,
    csv: String,
}

#[tauri::command]
fn connection_status() -> Result<ConnectionStatus, String> {
    let store = CredentialStore::new();
    let credentials = store.load().map_err(to_message)?;
    Ok(ConnectionStatus {
        connected: credentials.is_some(),
        app_key_hint: credentials
            .as_ref()
            .map(|value| mask_app_key(&value.app_key)),
    })
}

#[tauri::command]
fn start_auth(app_key: String) -> Result<AuthStart, String> {
    let app_key = app_key.trim();
    if app_key.is_empty() {
        return Err("Enter the Dropbox app key before starting setup.".to_string());
    }

    let session = AuthSession::new(app_key);
    Ok(AuthStart {
        auth_url: session.auth_url,
        code_verifier: session.code_verifier,
    })
}

#[tauri::command]
async fn complete_auth(
    app_key: String,
    code: String,
    code_verifier: String,
) -> Result<ConnectionStatus, String> {
    let client = DropboxClient::new();
    let token = client
        .exchange_auth_code(app_key.trim(), code.trim(), code_verifier.trim())
        .await
        .map_err(to_message)?;

    CredentialStore::new()
        .save(app_key.trim(), &token.refresh_token)
        .map_err(to_message)?;

    connection_status()
}

#[tauri::command]
fn disconnect_dropbox() -> Result<ConnectionStatus, String> {
    CredentialStore::new().clear().map_err(to_message)?;
    connection_status()
}

#[tauri::command]
async fn process_dropbox_folder(request: ProcessRequest) -> Result<ProcessResponse, String> {
    let credentials = CredentialStore::new()
        .load()
        .map_err(to_message)?
        .ok_or_else(|| "Connect Dropbox before generating a CSV.".to_string())?;

    let client = DropboxClient::new();
    let output = match client
        .process_folder(&credentials, &request.folder_url, request.mode)
        .await
    {
        Ok(output) => output,
        Err(dropbox::DropboxError::Unauthorized(message)) => {
            let _ = CredentialStore::new().clear();
            return Err(format!(
                "{message} Dropbox has been disconnected; run setup again."
            ));
        }
        Err(error) => return Err(to_message(error)),
    };

    let csv = csv_export::build_csv(&output.rows);
    Ok(ProcessResponse {
        rows: output.rows,
        failures: output.failures,
        csv,
    })
}

#[tauri::command]
fn save_csv_file(request: SaveCsvRequest) -> Result<(), String> {
    std::fs::write(&request.path, request.csv)
        .map_err(|error| format!("Could not save CSV to {}: {error}", request.path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            connection_status,
            start_auth,
            complete_auth,
            disconnect_dropbox,
            process_dropbox_folder,
            save_csv_file,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run app");
}

fn mask_app_key(app_key: &str) -> String {
    let trimmed = app_key.trim();
    if trimmed.len() <= 6 {
        return "configured".to_string();
    }

    format!("{}...{}", &trimmed[..3], &trimmed[trimmed.len() - 3..])
}

fn to_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}
