# LSPatch Generator

LSPatch Generator is an automated tool designed to download and patch Android applications using LSPatch. It simplifies the process of applying LSPatch modifications by automating APK downloads and patching with specific configurations.

## Features

- **Automated Downloads**: Download APKs from APKPure, APKMirror, Uptodown, archive listings, or direct URLs.
- **Customizable Patching**: Configure LSPatch flags including:
  - `--manager`
  - `--embed` (using predefined embed modules)
  - `--debuggable`
  - `--injectdex`
  - `--allowdown`
  - `--sigbypasslv`
- **Concurrent Processing**: Patches multiple applications in parallel with a configurable limit (default: 2).
- **Automated Workflow**: Combines downloading and patching in a single command.
- **Source Fallback**: Configure multiple download sources per app (`sources`) and try them in order until one succeeds.
- **APKS Bundle Merge**: Automatically merges downloaded `.apks` bundles into a patchable single `.apk`.

## Prerequisites

- [Node.js](https://nodejs.org/) (Recommended version: 20+)
- [pnpm](https://pnpm.io/) (Recommended package manager)
- **Java Runtime Environment (JRE)**: Required to execute `bin/lspatch.jar`.

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/green1052/LSPatch-Generator.git
    cd LSPatch-Generator
    ```

2.  Install the dependencies:
    ```bash
    pnpm install
    ```

3.  Ensure you have `lspatch.jar` in the `bin/` directory.
4.  For split bundles (`.apks`, `.apkm`, `.xapk`), place `apkeditor.jar` in `bin/` (required for merge).

## Configuration

Create or modify `config.json` in the root directory to define the applications you want to patch and their configurations.

### `config.json` Structure

- **`embeds`**: A dictionary of names and paths to LSPatch modules you want to embed.
- **`applications`**: A dictionary where the key is the package name (or a unique identifier) and the value is an `Application` object.

#### `Application` Object

- `sources`: Required. Array of download sources to try in order.
  - source `type`:
    - `"apkpure"` (automated latest from APKPure using package name key)
    - `"direct"` (manual direct APK URL)
    - `"apkmirror"` (APKMirror app page URL)
    - `"uptodown"` (Uptodown app page URL)
    - `"archive"` (directory/archive page containing APK files)
  - source `url`: Required for `direct`, `apkmirror`, `uptodown`, and `archive`.
  - `archive` note: Intended for archive.org-style directory indexes (for example `.../apks/<package>`). The downloader matches package name and prefers files ending in `-<arch>.apk` (also `.apks/.apkm/.xapk`) like revanced archive selection.
- `arch`: (Optional) Archive source selection hint. One of `"all"`, `"arm64-v8a"`, `"arm-v7a"` (default: `"all"`).
- `manager`: (Optional) Boolean. If `true`, uses the `--manager` flag.
- `embed`: (Optional) An array of keys from the `embeds` section to include.
- `debuggable`: (Optional) Boolean. If `true`, adds the `--debuggable` flag.
- `injectdex`: (Optional) Boolean. If `true`, adds the `--injectdex` flag.
- `allowdown`: (Optional) Boolean. If `true`, adds the `--allowdown` flag.
- `sigbypasslv`: (Optional) Integer (0, 1, or 2). Sets the `--sigbypasslv` flag level.

### Example `config.json`

```json
{
    "embeds": {
        "my-module": "embeds/my-module.apk"
    },
    "applications": {
        "com.discord": {
            "sources": [
                {
                    "type": "apkpure"
                }
            ],
            "manager": true
        },
        "com.spotify.music": {
            "sources": [
                {
                    "type": "archive",
                    "url": "https://archive.org/download/jhc-apks/apks/com.spotify.music"
                },
                {
                    "type": "apkmirror",
                    "url": "https://www.apkmirror.com/apk/spotify-ab/spotify-music-and-podcasts/"
                },
                {
                    "type": "uptodown",
                    "url": "https://spotify.en.uptodown.com/android"
                },
                {
                    "type": "apkpure"
                }
            ]
        },
        "com.example.app": {
            "sources": [
                {
                    "type": "direct",
                    "url": "https://example.com/app.apk"
                }
            ],
            "embed": ["my-module"],
            "debuggable": true
        }
    }
}
```

## Notes

- Source fallback is sequential: the first successful source is used.
- APKMirror may return 403/HTML challenge pages depending on network/IP.
- Some Uptodown pages return external installer links (`data-url-ext`) instead of direct APK files.
- For stable automation, prefer `archive` (archive.org-style file indexes) as the first source when available.

## Usage

Run the generator using the following command:

```bash
pnpm start
```
