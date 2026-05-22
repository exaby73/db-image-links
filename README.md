# Dropbox Image Links

Desktop app for creating CSV files from Dropbox product image folders.

The app connects to Dropbox once, accepts a public Dropbox folder link, creates or reuses public preview links for each image, and exports rows in this shape:

```csv
SKU,Link 1,Link 2
1077S-BEIGE,https://www.dropbox.com/...,https://www.dropbox.com/...
```

## What Users Need

- A Dropbox account that owns, or has mounted access to, the folders being processed.
- A Dropbox app key created in the Dropbox App Console.
- The Dropbox app must be a scoped **Full Dropbox** app. Do not choose **App Folder**; App Folder apps can only act inside their dedicated app folder and cannot create links for arbitrary SKU folders.
- The Dropbox app must have these scopes enabled:

```text
files.metadata.read sharing.write
```

Dropbox automatically selects `sharing.read` when `sharing.write` is enabled.

The app uses Dropbox OAuth PKCE with offline access. It stores the refresh token in the operating system credential store:

- macOS: Keychain
- Windows: Credential Manager

Generated short-lived Dropbox access tokens are not used for long-term setup because they expire.

## Folder Modes

Single SKU mode:

```text
1077S-BEIGE/
  1.jpg
  2.jpg
```

The folder name becomes the SKU.

Multi SKU mode:

```text
Products/
  1077S-BEIGE/
    1.jpg
    2.jpg
  1078S-BLACK/
    a.jpg
    b.jpg
```

Each first-level child folder becomes one SKU row.

Images are sorted by natural filename order, so `1.jpg`, `2.jpg`, and `10.jpg` stay in numeric order. Non-numbered names are sorted alphabetically.

## Dropbox Setup In The App

1. Open the Dropbox App Console.
2. Create a scoped Dropbox API app.
3. Choose **Full Dropbox** access, not **App Folder**.
4. Enable the scopes listed above.
5. Copy the app key.
6. Paste the app key into Dropbox Image Links.
7. Click **Open Dropbox authorization**.
8. Approve access in Dropbox.
9. Copy the authorization code Dropbox shows.
10. Paste the code into the app and click **Finish setup**.

If you already created an App Folder app, create a new Full Dropbox app and use the new app key. Dropbox access type is selected when the app is created.

Use **Disconnect Dropbox** to remove stored credentials from the computer.

## Installing On macOS

The macOS build is ad-hoc signed but not notarized by Apple.

If macOS says it cannot verify the app:

1. Download the macOS `.zip` artifact from GitHub Actions or from the GitHub Release for the version you want.
2. Unzip it if the browser did not do that automatically.
3. Drag **Dropbox Image Links.app** into Applications.
4. Right-click the app and choose **Open**.
5. Confirm **Open** in the warning dialog.

If the button is not available:

1. Try opening the app once.
2. Go to **System Settings > Privacy & Security**.
3. Find the blocked app message.
4. Click **Open Anyway**.

If macOS says the app is damaged, remove the download quarantine flag after moving the app to Applications:

```sh
xattr -dr com.apple.quarantine "/Applications/Dropbox Image Links.app"
```

Then right-click **Dropbox Image Links.app** and choose **Open** once.

## Installing On Windows

Download the Windows installer from GitHub Actions or from the GitHub Release for the version you want, then run the `.msi` or `.exe` installer.

If Windows SmartScreen warns about an unknown publisher, choose **More info** and then **Run anyway** if the file came from the expected project build.

Windows users do not need WSL to install or use the app.

## Development

### Tooling

Tools are pinned with `asdf`:

```text
nodejs 24.16.0
pnpm 11.2.2
rust 1.95.0
```

On macOS:

```sh
asdf install
```

Tauri also needs Apple command line build tools:

```sh
xcode-select --install
```

On Windows, `asdf` does not support PowerShell or Command Prompt. Use WSL for normal repository development commands, or install the pinned Node.js, pnpm, and Rust versions manually for native Windows builds.

Native Windows installer builds need the Microsoft C++ Build Tools and WebView2 runtime. The GitHub Actions Windows runner already has the required build environment.

### Commands

Install dependencies:

```sh
pnpm i
```

Run the desktop app in development:

```sh
pnpm dev
```

Run only the Vite web shell:

```sh
pnpm web:dev
```

Build the frontend:

```sh
pnpm build
```

Build the desktop installer for the current platform:

```sh
pnpm tauri:build
```

Run linting and formatting checks:

```sh
pnpm check
```

Format files with Biome:

```sh
pnpm format
```

Run Rust tests:

```sh
pnpm test
```

Per `AGENTS.md`, run pnpm workspace tests and any commands that may touch external files in an elevated shell.

## CI

The repository includes:

- A checks workflow for TypeScript, Biome, Rust checks, and Rust tests.
- A build workflow for macOS and Windows Tauri artifacts.
- Tag builds like `v1.0.0` attach generated installers to the GitHub Release.

Commit messages and PR titles should follow the Git Committer skill rules.
