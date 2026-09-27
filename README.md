<p align="center"><img src="public/prism-rendered.png" width="112" alt="AOTX-PRISM" /></p>
<h1 align="center">AOTX-PRISM</h1>
<p align="center">Project Runtime Interface and Session Manager</p>

---

AOTX-PRISM is a desktop workspace for AOTX. Connect an existing gateway, open a
project folder and hold ordinary model conversations. Move, resize and dock
utility windows without closing the conversation.
Use complete CCIR files for persistent shared spaces and conversations.

The development version is **0.1.0**. Source builds are available. No installer,
version tag or application release is published.

## Current capabilities

| Workflow | Support |
| --- | --- |
| Project folders | Local history, names, archive, export and nested read-only previews |
| Runtime setup | Checked local launch, GPU selection and saved machine profiles |
| Gateway connection | Bearer authentication, model discovery and capability display |
| Conversations | Text and advertised JPEG/WAV input, incremental output and exact cancellation |
| Generation profiles | Saved settings bound to an exact model digest |
| Recovery | Read a known request again without sending its prompt again |
| Shared CCIR | Create, inspect, activate, save, copy and restore complete shared files |
| Persistent conversations | Participant membership, scoped spaces, ordered events and exact request recovery |
| Workspace | Docked or floating panels, saved layout, silver and graphite themes |
| Evidence and controls | Typed memory, exact references, qualified doses and policy actions |
| Activity window | Background counters, conversation event pages and an optional rain field |

Model-driven file changes and command execution are outside the first release.

## Build and start

Use Linux with a graphical desktop, Node.js 22.16 or later, npm and Python 3.12
or later. The source build has been exercised on Linux x86-64. Other platforms
are not qualified. An AOTX gateway is required for inference.

```sh
npm ci
npm run build
npm start
```

Dependency versions are pinned in `package-lock.json`. Installation downloads the
pinned Electron runtime. The application bundles its fonts and interface assets.
No account or external web content is required to open the workspace.

## First conversation

1. Open **Project** from the menu.
2. Enter an existing folder path, or use **Browse folders**.
3. Select **Open project**. PRISM creates private metadata in `.prism`.
4. Open **Connection**. Enter the gateway URL and bearer token.
5. Select **Connect**. Open **Models** to inspect or change the generation settings.
6. Select **New conversation**, enter a message and select **Send message**.

The application starts with a local workspace under its desktop data directory.
Reopen a project folder to restore its conversations. A bearer token is not
stored with the project. Connect again after an application restart.

Use **Runtime setup** to start an installed local runtime instead of entering
an external gateway. See [runtime and project setup](docs/setup.md) for the full flow.
See [shared CCIR workspaces](docs/shared.md) for persistent conversations and complete files.

Use **Windows** to open a panel. Drag its tab to move it. Use **Float** or **Dock**
for explicit placement. Drag a window edge or divider to resize it.

**Maximize** expands a panel. **Restore** returns to its previous layout.

**Reset layout** restores the conversation view. Closing a panel does not cancel
its device request. The optional system folder picker is the only modal selector.

The activity window opens with status tiles. Select **Show visualization** to open
its rain field. Memory evidence, qualified controls and policy actions use the
existing gateway. Read [evidence and activity](docs/evidence.md) for their limits.
See [interface structure](docs/interface.md) for themes and panels.

## Storage and request state

Project history is stored in `.prism/project.sqlite3`. Project files are not sent
to the model. Text previews are read-only and exclude hidden files and links.
Close PRISM before copying a project database for backup.

Local history and device execution have separate states. **Completed** reports a
terminal device result. The footer reports whether history was saved locally.
If output reading stops, reconnect to the same gateway and select **Read result**.
PRISM does not send a prompt again after an uncertain admission.

**Cancel request** sends cancellation for the exact request handle. A final device
state confirms the result. Disconnecting stops reads without canceling device work.
Exiting PRISM stops its owned runtime and leaves external runtimes running.
A runtime restart can expire ordinary request handles; local
history remains available.

See [connection and storage details](docs/architecture.md) for limits and boundaries.

## Development

```sh
npm run check
npm run test:desktop
node --import tsx tests/setup-desktop.mjs
node --import tsx tests/shared-desktop.mjs
node --import tsx tests/evidence-desktop.mjs
git diff --check
```

The desktop test requires a visible graphical session. It uses an isolated project
and a local HTTP fixture. It does not claim GPU inference acceptance.

| Path | Responsibility |
| --- | --- |
| `src/` | React views, Dockview layout and local styles |
| `desktop/` | Sandboxed application boundary, gateway transport and project storage |
| `shared/` | Typed commands and bounded project data |
| `tests/` | Protocol, storage, lifecycle and visible desktop checks |
| `tools/` | Source and version checks |

See [contribution rules](CONTRIBUTING.md), [version rules](docs/versioning.md) and
[changes](CHANGELOG.md). The client uses existing AOTX interfaces.

## License

The source uses the [Apache License 2.0](LICENSE). Bundled fonts use the SIL Open
Font License. See [NOTICE](NOTICE) and [dependency notices](docs/dependencies.md).
