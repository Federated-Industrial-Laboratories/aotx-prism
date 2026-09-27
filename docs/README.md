# Documentation

Install and operate AOTX-PRISM, a desktop client for ordinary model conversations
and persistent CCIR runtimes. Start with a connected gateway, or use an installed
local AOTX build. The guides distinguish local project history from runtime memory.

[Project README](../README.md) | [Security](security.md) | [Contributing](../CONTRIBUTING.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

## Start here

1. Check the [supported platform and backend](support.md).
2. [Install a package or build from source](install.md).
3. [Open a project and connect a gateway](first-use.md).
4. Choose ordinary conversations or [persistent shared work](shared.md).
5. Read [recovery procedures](troubleshooting.md) before moving saved runtime files.

## Manual library

| Order | Manual | Subject |
| --- | --- | --- |
| 01 | [Installation](install.md) | Requirements, source builds, packages, upgrades and removal. |
| 02 | [First use](first-use.md) | Project selection, gateway connection and first conversation. |
| 03 | [Projects and files](projects.md) | History, archives, exports, previews, media and backups. |
| 04 | [Runtime setup](setup.md) | Local installations, GPU selection, ownership and saved profiles. |
| 05 | [Shared CCIR](shared.md) | Complete files, participants, scopes, prompts, receipts and recovery. |
| 06 | [Affect and model controls](controls.md) | Qualified doses, runtime settings, permissions and saved state. |
| 07 | [Evidence and activity](evidence.md) | Memory formats, source references, publication and policy work. |
| 08 | [Interface](interface.md) | Window layout, themes, keyboard controls and status language. |
| 09 | [Architecture](architecture.md) | Desktop boundary, transport, storage and client limits. |
| 10 | [Security](security.md) | Credentials, files, runtime trust and permission boundaries. |
| 11 | [Support](support.md) | Qualified surfaces, backend discovery and excluded functions. |
| 12 | [Troubleshooting](troubleshooting.md) | Connection failures, context limits, recovery and unavailable controls. |
| 13 | [Testing](testing.md) | Source, protocol, desktop, package and runtime checks. |
| 14 | [Dependencies](dependencies.md) | Locked components, local assets and license notices. |
| 15 | [Versioning](versioning.md) | Independent versions, package identities, tags and release procedure. |

## Shared terms

| Term | Meaning |
| --- | --- |
| Project | A local folder with a private PRISM history database. |
| Gateway | The authenticated HTTP interface to an AOTX runtime. |
| Runtime | The running AOTX instance that owns inference and device state. |
| Runtime profile | Local installation paths, GPU choice and launch configuration. |
| Generation profile | Saved output-token and temperature settings for an exact model. |
| CCIR | A complete runtime file with embedded assets and durable state. |
| Participant | The persistent identity used for shared membership and requests. |
| Space | A persistent access and memory scope within a shared runtime. |
| Conversation | An ordinary local history or a persistent conversation within a CCIR space. |
| Receipt | A runtime report of an operation's admission, result and save state. |
| Lineage | The persistent identity of a CCIR runtime and its shared resources. |
| Epoch | The identity of a running service instance; ordinary handles depend on it. |

A project is not a CCIR privacy boundary. A runtime profile does not change the
backend's compiled capacities. A completed response does not establish that its
result has reached durable storage.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Changes](../CHANGELOG.md) | [License](../LICENSE) | [Notices](../NOTICE)
