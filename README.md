<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/header-dark.png">
    <img src="docs/assets/header.png" width="720" alt="AOTX-PRISM. A seated silver-blue-haired operator beside the product title.">
  </picture>
</p>

<p align="center">A desktop workspace for AOTX conversations and persistent CCIR runtimes.</p>

<p align="center"><img src="docs/assets/badges.svg" width="720" alt="Apache 2.0 | Version 0.1.0, unreleased | Linux x86-64 | AOTX gateway"></p>

<p align="center">
  <a href="docs/install.md">Install</a> |
  <a href="docs/first-use.md">Start</a> |
  <a href="docs/shared.md">CCIR</a> |
  <a href="docs/README.md">Documentation</a>
</p>

<p align="center"><img src="docs/assets/divider.svg" width="720" alt=""></p>

AOTX-PRISM brings conversations, project history, runtime setup and memory evidence
into one desktop application. Connect an existing AOTX gateway or start a local
installation. Choose ordinary conversations or persistent CCIR spaces, with explicit
instructions for each new conversation.

The interface uses silver panel headers, a restrained amber accent and dockable
windows. A graphite theme provides the same layout on dark surfaces. Fonts and
application assets are local.

**Version 0.1.0 is unreleased.** Source builds and local Linux packages are available.
No application release or version tag is published. See [changes](CHANGELOG.md)
and [support boundaries](docs/support.md).

## Capabilities

| Area | Current behavior |
| --- | --- |
| Conversations | Text, advertised JPEG/WAV input, incremental output and exact cancellation. |
| Conversation setup | Editable neutral instructions for new ordinary and CCIR conversations. |
| Projects | Local history, conversation names, archives, JSON exports and read-only file previews. |
| Runtime setup | Installation checks, GPU selection, saved profiles and owned process shutdown. |
| Shared CCIR | Complete file creation, verification, activation, saved shutdown and stopped-file copies. |
| Persistent spaces | Participant membership, scoped conversations, ordered events and exact request recovery. |
| Affect and controls | Qualified model controls, permitted runtime settings and scoped state readback. |
| Evidence and activity | Typed memory, source references, explicit publication, policy counters and controls. |
| Workspace | Floating or docked panels, resizing, maximize/restore and saved layout. |

Project folders do not grant model file access. Model-driven file edits and command
execution are outside this version. AOTX owns inference and persistent memory;
PRISM displays the interfaces advertised by the connected gateway.

<p align="center"><img src="docs/assets/divider.svg" width="720" alt=""></p>

## Install or build

The desktop target is Linux x86-64. A packaged installation includes Electron and
does not require Node.js. It still requires a graphical session, system desktop
libraries, a working Chromium sandbox and Python for installation.

For a supplied package, follow [Linux installation](docs/install.md).
AOTX executables, model files and gateway dependencies are separate installations.
PRISM does not download them. An external gateway can run inference on another machine.

For a source checkout, use Node.js 22.16 or later, npm and Python 3.12 or later:

```sh
npm ci
npm run build
npm start
```

Run these commands from the repository root. Source builds need the same desktop
libraries and sandbox support as installed packages.

## Start a conversation

1. Open **Project** and select an existing folder for local history.
2. Open **Connection** and enter the gateway URL and bearer token.
3. Select **Connect**.
4. Open **Models**, select an advertised model and apply generation settings.
5. Select **+ New conversation**.
6. Set a name and review the neutral system prompt.
7. Select **Create conversation**, enter a message and select **Send message**.

Use HTTPS for a remote gateway, or HTTP through a loopback SSH tunnel.
The bearer token stays in process memory. Enter it again after restarting PRISM.

[First use](docs/first-use.md) covers the full procedure.
[Runtime setup](docs/setup.md) covers starting an installed local backend.

## Use persistent CCIR conversations

Connect a complete shared runtime, then open **CCIR workspace**. Register the
participant, select a space and create a conversation. **New CCIR conversation**
opens the same prompt editor with the runtime's supported byte limit.

CCIR instructions remain fixed for that conversation. Runtime memory rules and
authenticated actor context still apply. Existing conversations retain their
original instructions; a new default does not rewrite them.

A local history entry, completed response and saved CCIR result are different
states. Inspect the save receipt before relying on recovery. Stop a writer before
copying its complete file. See [shared workspaces](docs/shared.md).

<p align="center"><img src="docs/assets/divider.svg" width="720" alt=""></p>

## Documentation

The [manual index](docs/README.md) provides a reading order and shared terms.

| Task | Guide |
| --- | --- |
| Install, upgrade or remove PRISM | [Installation](docs/install.md) |
| Choose a project and send the first message | [First use](docs/first-use.md) |
| Manage folders, history, exports and media | [Projects and files](docs/projects.md) |
| Select a GPU, runtime or generation profile | [Runtime setup](docs/setup.md) |
| Save and restore persistent work | [Shared CCIR](docs/shared.md) |
| Configure controls and runtime affect | [Affect and model controls](docs/controls.md) |
| Inspect sources and background work | [Evidence and activity](docs/evidence.md) |
| Recover a failed connection or request | [Troubleshooting](docs/troubleshooting.md) |
| Understand data and permission boundaries | [Architecture](docs/architecture.md) and [security](docs/security.md) |

## Development

Use the locked dependencies. Run checks appropriate to the changed surface;
[testing](docs/testing.md) distinguishes source, protocol, visible desktop and
native runtime checks. [Contribution rules](CONTRIBUTING.md) describe branches,
review and pull requests.

<details>
<summary>Source layout</summary>

```text
src/        React views, Dockview layout and local styles
desktop/    gateway adapters, project storage and runtime supervision
shared/     typed commands, bounded data and protocol validation
public/     application marks, fonts and font licenses
docs/       user guides, reference and documentation artwork
tests/      protocol, storage, lifecycle, package and desktop checks
tools/      source gates and committed-source package builder
packaging/  package verification, per-user installer and launcher
```

</details>

<p align="center"><img src="docs/assets/divider.svg" width="720" alt=""></p>

<p align="center">Apache License, Version 2.0. See <a href="LICENSE">LICENSE</a>, <a href="NOTICE">NOTICE</a> and <a href="docs/dependencies.md">dependency notices</a>.</p>
