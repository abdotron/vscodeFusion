
# Fusion SQL Worksheet for VS Code

A VS Code extension that lets you run SQL against Oracle Fusion (SaaS) via BI
Publisher — 

## How it works

1. You save a named connection: URL, username, password, BIP data source( ApplicationDB_FSCM,or ApplicationDB_HCM or ApplicationDB_CRM)
2. The extension auto-generates a unique `.xdm` data-model path like
   `/Custom/tmp_xxx.xdm` (the same pattern your PL/SQL uses).
3. Open a `.fusionsql` worksheet from the sidebar and type SQL.
4. Press **Ctrl+Enter** (or **F5**) — the extension:
   - uploads your SQL as a BIP data model (create or update `.xdm`),
   - calls `runDataModel` via SOAP,
   - decodes the returned XML rowset,
   - renders rows in a sortable, filterable table next to your editor.

Passwords are stored in VS Code's **secret storage** (OS keychain on macOS /
Credential Manager on Windows / libsecret on Linux) — never on disk in plain
text.
## use the extension
vS Code → Extensions view → … menu → Install from VSIX… → pick the file.

## Build from source

Requires Node.js 18+ and npm.

```bash
cd fusion-vscode
npm install
npm run compile
```

### Option A: run without installing (dev mode)

Open the folder in VS Code and press **F5**. A second VS Code window launches
with the extension loaded. Use it to add a connection and run queries.

### Option B: package into a .vsix and install permanently

```bash
npm run package
```

Produces `fusion-sql-1.0.0.vsix`. Install it:

- VS Code → Extensions view → `…` menu → **Install from VSIX…** → pick the file.
- Or from CLI: `code --install-extension fusion-sql-1.0.0.vsix`

## Using it

1. Click the **Fusion SQL** icon on the left activity bar.
2. Click **+** to add a connection:
   - Name (your handle, e.g. `FUSION-DEV`)
   - URL (e.g. `https://eenp-dev1.fa.ocs.oraclecloud.com`)
   - Username, password
   - BIP data source reference (usually `demo`)
3. Click the connection to open a new worksheet. It's a plain `.fusionsql`
   file with a header comment naming the connection — edit freely, use all
   of VS Code's SQL editing features.
4. Write a query and press **Ctrl+Enter**. Results appear beside the editor.
5. You can select part of the worksheet and only the selection runs.

## Settings

- `fusionSql.defaultRowLimit` — cap every query (default: 500; 0 = unlimited).
- `fusionSql.verbose` — log raw SOAP to the **Fusion SQL** output channel.

## Limitations

- Read-only. DML/DDL pass through to BIP as-written; whether they succeed
  depends on your data-source privileges. No transactions.
- No schema browsing (BIP doesn't expose data-dictionary metadata over SOAP).
  Write SQL directly.
- Column types are reported as strings — Fusion sends all values as text via
  BIP XML; cast them in your SQL if you need typed output.

## Files

- `src/connectionStore.ts` – profile + secret-storage wrapper
- `src/bipClient.ts` – SOAP client (getObject / createObject / updateObject / runDataModel)
- `src/connectionsProvider.ts` – sidebar tree
- `src/resultsPanel.ts` – results webview (sort / filter / copy CSV)
- `src/extension.ts` – activation + commands
