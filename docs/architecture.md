# Connection and storage

PRISM separates the reusable web interface from desktop operations. React views
receive typed commands and state snapshots through a sandboxed preload boundary.
The renderer has no Node.js access, generic IPC interface or direct network access.
The desktop process owns gateway credentials and project database transactions.

## Gateway contract

The client targets AOTX 0.3.5. Its ordinary inference routes are:

| Route | Use |
| --- | --- |
| `GET /aotx/v1/capabilities` | Models, current epoch, limits and feature availability |
| `POST /aotx/v1/requests` | One native admission for a user submission |
| `GET /aotx/v1/requests/{id}?cursor={byte}` | Incremental output and request state |
| `POST /aotx/v1/requests/{id}/cancel` | Exact request cancellation |
| `POST /aotx/v1/media` | Selected JPEG or WAV bytes |
| `GET /aotx/v1/media` | Current owned sources after complete or interrupted uploads |
| `DELETE /aotx/v1/media/{id}` | Explicit removal of an unused source |
| `GET, POST /aotx/v1/affect/settings` | Separately granted runtime settings |

Remote connections require HTTPS. HTTP is permitted for exact loopback addresses
and `localhost`. SSH tunnels can expose a remote gateway on loopback. Redirects
are refused. Tokens stay in process memory and are cleared on disconnect or exit.
Gateway TLS certificates must pass the system trust checks.

Only completed turns form the next request's history. Failed or cancelled output
remains visible but does not become a successful assistant turn. An unresolved
request blocks another submission in that conversation. Start a new conversation
when a lost admission has no recoverable handle.

The pending prompt is saved before admission. A returned handle is saved before
output polling. If a POST response is lost, the client reports uncertainty and
never retries that POST. A known handle permits safe status reads. Gateway and
runtime restarts can have different recovery results; ordinary handles are ephemeral.

Shared operations use `/aotx/v1/shared`. A separate local journal retains canonical
mutations and exact recovery identities before transport. Participant, lineage, sequence,
operation key and result byte spans are checked before storage or display.
Shared retries preserve the original body. They do not use ordinary retry rules.
See [shared workspaces](shared.md) for scopes, receipts, storage limits and stopped-file recovery.

Byte cursors, request identities and epochs are checked before output is applied.
The client retains raw bytes across UTF-8 boundaries and drains all terminal
windows before reporting completion. A save failure stops new submissions.

## Local files

A selected folder contains private `.prism/project.sqlite3` metadata. SQLite uses
transactions, full synchronization and revision checks. Concurrent writers cannot
silently replace another writer's accepted revision. Reopen after a conflict.
The metadata directory must be private and owned by the current account.

Project file access is read-only. Paths are restricted to visible entries in the
selected folder and its visible subfolders. Links, device files, non-UTF-8 text
and oversized files are refused. Each path component is opened without following links.

| Limit | Value |
| --- | --- |
| Conversations per project | 64 |
| Turns per conversation | 128 |
| Ordinary system prompt | 4,096 UTF-8 bytes |
| CCIR system prompt | 2,048 UTF-8 bytes, when advertised |
| Serialized project | 16 MiB |
| Output per request | 1 MiB |
| JSON HTTP response and request body | 2 MiB each |
| Media upload | 32 MiB or the lower advertised quota |
| HTTP exchange deadline | 30 seconds; 300 seconds for media upload |
| Text preview | 128 KiB |
| Directory view | 128 entries, at most 4,096 inspected entries |
| Saved layout | 256 KiB, fourteen known panels |
| Nested folder depth | 16 components |
| Saved generation profiles | 32 per project |
| Saved runtime profiles | 32 per desktop account |

Gateway model and prompt limits still apply. PRISM does not truncate a conversation
silently to fit them. A large project can reach its byte limit before its count limits.

## Desktop boundary

The application loads bundled assets through `prism://app/`. Navigation, pop-up
windows, webviews and permission requests are refused. A content security policy
blocks remote resources and renderer network calls. IPC accepts only the main
application frame and validates each named command.

Layout and theme are stored separately from project content. Invalid layouts
return to the default workspace. Closing a utility window does not own or end
request execution. No renderer operation executes a shell command.

The runtime adapter uses fixed executable names and argument arrays. A child
supervisor owns the launched process groups. It stops them on explicit shutdown
or lost desktop IPC. External gateways have no process ownership controls.
Local runtime profiles and recent folders are stored separately from projects.
See [setup](setup.md) for lifecycle, media and project migration behavior.

Electron supplies the desktop host. React and Dockview implement the web views.
A future host can implement the same typed bridge. Additional gateway features
can use separate adapters without changing ordinary conversation storage.
