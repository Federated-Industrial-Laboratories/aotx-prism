# Troubleshooting

Start with the connection strip, request receipt and runtime log. Keep admission,
completion, local storage and CCIR durability separate when interpreting a failure.

[Documentation](README.md) | [Runtime setup](setup.md) | [Shared CCIR](shared.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

## Connection and startup

| Symptom | Check and action |
| --- | --- |
| Gateway cannot connect | Check the URL, listener and credential. Remote HTTP requires a loopback tunnel or HTTPS. |
| TLS connection refused | Check the certificate and system trust. Redirects and invalid certificates are refused. |
| Feature unavailable | Read advertised capabilities. A matching version string alone is insufficient. |
| GPU unavailable | Refresh GPUs and inspect the chosen UUID, free memory and backend admission log. |
| Owned runtime fails to start | Read **Startup and process log**; recheck executables, model store and gateway Python. |
| Service socket path is too long | Select a shorter runtime storage path. The resulting socket path must fit 107 bytes. |
| Installed desktop does not open | Check desktop libraries and host sandbox support. Keep the Chromium sandbox enabled. |

PRISM does not adopt an external runtime by a saved process ID.
After a desktop restart, an ordinary owned start creates a new runtime and epoch.
Use an external gateway when an operator manages a longer-lived instance.

## Interrupted requests

For an ordinary request with a retained handle, reconnect the same gateway and
select **Read result**. A runtime restart can expire that handle. PRISM retains
saved text but does not claim that the old device result remains accessible.

If ordinary admission is uncertain and no handle was received, do not assume
nothing ran. PRISM does not retry the submission. Start a new conversation when
there is no recoverable handle and the earlier request cannot be reconciled.

For shared work, inspect the saved receipt. **Retry exact request** uses its
original canonical body, key and sequence. It does not create another input.
A restored copy at another URL requires **Attach to matching restored runtime**
and matching participant and lineage identities.

| Shared response | Meaning and next step |
| --- | --- |
| HTTP 403 | Current grants or membership refuse access. Ask the runtime operator to check them. |
| HTTP 404 | The addressed resource is absent or unavailable in the current scope. |
| HTTP 409 | The operation conflicts with current state. Read the receipt and current selection. |
| HTTP 410 | The identity, handle or retained record has expired. Local text is not a replacement handle. |
| HTTP 429 | Capacity or persistence pressure prevents admission. Inspect runtime state before retrying. |

Cancel addresses an exact request. It cannot reverse already committed memory.
Disconnect stops reads without canceling device work.

## Context and output limits

Three independent limits can affect an input:

1. PRISM bounds individual fields and serialized requests in bytes.
2. The gateway reports its wrapped-prompt and output limits.
3. The backend build bounds total sequence tokens and physical cache capacity.

The **Models** token setting controls output length, not the total context window.
Reducing reply length can release some context capacity. A new conversation removes
prior ordinary turns from the next prompt, but does not increase backend capacity.
PRISM does not silently drop history to make a request fit.

Changing compiled context capacity requires a compatible backend build and runtime
restart. Larger token tables do not add physical VRAM. Ask the runtime operator
to inspect the profile, model shape and cache allocation.

## Prompts and controls

| Symptom | Explanation and action |
| --- | --- |
| An old conversation uses a runtime role | Existing instructions are preserved. Create a new conversation with the desired prompt. |
| CCIR prompt setup is unavailable | Open a shared workspace, select a space and check backend prompt support. |
| A control is absent | The exact model/control pair may be unqualified or unavailable. Ordinary inference can remain supported. |
| An affect change is refused | Refresh epoch and revision; inspect permissions and pending local settings. Writes are not retried automatically. |
| A permission refusal keeps controls disabled | Correct the operator grant, then reconnect. |
| A qualified shared control cannot be sent | Affect must be disabled. Send one input without a control to permit the runtime reset. |
| Activity is quiet | Check the reported policy and its counters. The panel does not create background model work. |

[Controls](controls.md) explains setting scope and save requirements.
[Evidence](evidence.md) explains policy requirements and source-version limits.

## Storage and recovery

If local saving fails, stop new submissions and reopen the project after correcting
the folder, permissions or capacity problem. Concurrent revision conflicts require
reopening; PRISM does not silently replace another writer's accepted state.

A completed CCIR reply can still have pending bytes or a save error.
Use **Save runtime state** and wait for a saved terminal receipt.
If shutdown reports failed or forced cleanup, retain its log and verify the stopped
file before copying or reopening it. Do not infer durable success from process exit alone.

A cold or replaced evidence payload can make a source read unavailable.
The current-source view cannot prove an earlier source version. Retain the exact
reference and inspect the runtime's recovery tools when that version is needed.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
