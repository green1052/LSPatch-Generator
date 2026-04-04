# LSPatch Generator

LSPatch Generator is an automated tool designed to download and patch Android applications using LSPatch. It simplifies the process of applying LSPatch modifications by automating APK downloads and patching with specific configurations.

## Features

- **Automated Downloads**: Download APKs directly from APKPure or a specified direct URL.
- **Customizable Patching**: Configure LSPatch flags including:
  - `--manager`
  - `--embed` (using predefined embed modules)
  - `--debuggable`
  - `--injectdex`
  - `--allowdown`
  - `--sigbypasslv`
- **Concurrent Processing**: Patches multiple applications in parallel with a configurable limit (default: 2).
- **Automated Workflow**: Combines downloading and patching in a single command.

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

## Configuration

Create or modify `config.json` in the root directory to define the applications you want to patch and their configurations.

### `config.json` Structure

- **`embeds`**: A dictionary of names and paths to LSPatch modules you want to embed.
- **`applications`**: A dictionary where the key is the package name (or a unique identifier) and the value is an `Application` object.

#### `Application` Object

- `type`: Either `"apkpure"` (for automated download from APKPure) or `"direct"` (for a manual download URL).
- `url`: (Optional) The download URL if `type` is `"direct"`.
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
            "type": "apkpure",
            "manager": true
        },
        "com.example.app": {
            "type": "direct",
            "url": "https://example.com/app.apk",
            "embed": ["my-module"],
            "debuggable": true
        }
    }
}
```

## Usage

Run the generator using the following command:

```bash
pnpm start
```