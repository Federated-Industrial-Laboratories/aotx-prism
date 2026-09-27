# Shared CCIR workspaces

[Documentation](README.md) | [Runtime setup](setup.md) | [Recovery](troubleshooting.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

A complete CCIR file stores model assets, persistent conversations and durable runtime state.
Active state remains on the GPU. PRISM uses the AOTX 0.3.5 shared gateway and file tools.
Ordinary conversations retain their separate local history and temporary request handles.

## Create a complete file

1. Configure and save an ordinary profile in **Runtime setup**.
2. Include a language model and the embedding model in its store.
3. Select a data-only module folder with the conductor role.
4. Open **Windows > CCIR files**.
5. Select the installed runtime profile.
6. Enter an absolute **New destination path** that does not exist.
7. Open **Create a new shared runtime**.
8. Supply the required refusal phrase asset for an affect build.
9. Optionally select a device settings file.
10. Select **Check creation assets** and read the disk requirement.
11. Select **Create shared runtime**.
12. Wait for **complete** and inspect the verified file identity.

PRISM prepares an empty checkpoint with the installed GPU state tool.
The packager copies model assets, data modules and selected device settings.
It enables the shared profile and embedding role. It does not change the source files.
This creation path does not add a policy asset. Background scheduling requires
a compatible policy supplied through the backend's complete-file tools.

The initial storage allowance includes all regular asset files and 128 MiB for metadata.
Saved history needs additional space. This allowance is not a file capacity guarantee.

An affect build requires an operator-supplied phrase file or `quality/refusal-phrases.txt` in the store.
PRISM supplies no default calibration asset. Model loading does not qualify automatic interpretation or controls.
File operations use a private temporary directory and never replace an existing destination.
**Cancel file operation** stops the owned tool and removes its temporary output.

## Open a complete runtime

Use **Inspect and verify** to read a file without activation.
The file must include shared state and its embedding role.
Inspection reports its lineage, generation, assets, architecture and compiled slot capacity.
Activation still checks compatibility and available GPU resources.

1. Open **Runtime setup** and select **Complete shared CCIR** as the runtime mode.
2. Select the complete file and its compatible installed build.
3. Select an existing local participant or create one.
4. Select the language role, GPU and runtime storage folder.
5. Save the profile, then select **Start runtime**.
6. Wait for **ready**, then select **Connect owned runtime**.
7. Open **CCIR workspace**, then select **Open shared workspace**.

Participant IDs stay in local desktop settings, outside projects and complete files.
Keep the same participant ID when restoring a file to retain its stored membership.
Enter a retained ID in **Existing participant ID** when moving to another installation.
Leave that field empty to generate a new identity.
Each owned start creates fresh deployment grants and gateway credentials.
Remote participants use the credentials and grants supplied by their operator.

Activation can load packaged native policy code. Such files require the backend's explicit trust configuration.
This launcher does not supply native policy trust. Use a configured external gateway for those deployments.

## Spaces and conversations

Register the current participant when the interface requests registration.
Create a space or select one with the required rights. Then create or select a conversation.

Select **New CCIR conversation** to set its name and system prompt.
The default prompt assigns no name or runtime role. A blank prompt adds no role instructions.
The runtime still supplies memory rules, authenticated actor context and model formatting.
Instructions remain fixed for that conversation. Start another conversation to change them.

The selected conversation exposes its exact saved prompt when the gateway supports this feature.
Existing conversations keep their original instructions. Older conversations without
an explicit prompt retain their inherited runtime role.

Prompt support must be advertised by the connected backend. Update both the core
and gateway to use it. Earlier core versions cannot replay the new prompt records.
Keep a stopped-file copy before upgrading an existing runtime.

Space and conversation names are local project labels. Their persistent IDs remain visible.

| Scope | Access and memory boundary |
| --- | --- |
| Private | Explicit members share this space. Other private spaces have separate owners. |
| Room | Memory uses the exact space ID as its room. |
| Instance | Registered participants with current shared grants have implicit access. |

Scope cannot change. Membership changes require current manage permission.
An empty rights selection blocks access, including implicit instance access.
Creating another space does not publish existing private memory.
The runtime checks current grants and membership for every operation and read.

Select generation settings in **Models**. Shared inputs use at most 2,048 UTF-8 bytes.
Each attached media reference uses 73 of those bytes. The current model must support its media type.
Only sources attached to the current input become model media inputs.
The model's advertised capability controls whether automatic memory interpretation is available.

## Request recovery and durability

PRISM saves each canonical request before transport. The record includes its body, route,
gateway, operation key, participant, lineage and sequence. It contains no bearer token.

| State | Meaning |
| --- | --- |
| Accepted | The runtime issued an operation receipt. |
| Committed | The device committed the operation. |
| Admission saved | The durable file contains the admitted operation. |
| Result saved | The durable file contains its terminal result. |

A completed response can still await storage. Read its generation, pending bytes and save error.
**Save runtime state** creates a recorded save request. Wait for its saved terminal result.
Cancellation addresses the exact operation. It cannot undo committed memory.
Disconnect stops result reads and does not cancel execution.

After reconnecting, use **Read result** for a retained receipt.
**Retry exact request** sends the original canonical bytes, key and sequence.
It does not create another input. PRISM never replays requests merely because a connection opens.
An ordinary request with uncertain admission still has no retry action.

When a copied file starts at another gateway URL, verify its participant and lineage.
Use **Attach to matching restored runtime** before an exact retry or retained-result read.
This explicit action changes the saved endpoint, while retaining the canonical request.
Different participant or lineage identities are refused.

Ordered events expose gaps and the retained event floor.
Current rights can refuse old handles. Retired handles can return HTTP 410.
HTTP 409 reports a conflict; HTTP 429 reports capacity or persistence pressure.
Saved local records remain available, but they are not a current access or durability check.

## Stop, copy and restore

**Stop owned runtime** requests a saved terminal boundary before process shutdown.
The supervisor retains its shutdown request in the private runtime directory.
It waits for owned process exits and verifies the stopped complete file.
The interface reports failure if saving, process cleanup or file verification fails.
Closing PRISM follows this same owned shutdown path. External gateways remain running.

A shutdown save has a five-minute client deadline. A timeout is a failed save confirmation.
It does not invalidate the last acknowledged generation or establish that later work was saved.
Abrupt power loss or forced termination can lose work after that generation.

Wait for a successful saved stop. In **CCIR files**, select a new destination and
use **Copy stopped runtime**. A cooperating active writer prevents compaction.
Start the copy with a fresh journal and the same participant ID.
The restored runtime retains its lineage, conversation IDs, membership and saved receipts.

## Local storage limits

The shared journal uses a separate table in the project's private SQLite database.
It permits 256 saved requests, 256 local labels and 16 MiB of serialized data.
A disk or revision conflict stops new mutations. Reopen the project after resolving the problem.

Open another project when the local record limit is reached. Persistent device resources remain in the CCIR.
Project JSON export covers ordinary history. Back up the closed project database to retain its shared journal.

The device has separate compiled capacity limits. **Receipt capacity** can retire saved terminal receipts below an explicit floor.
Retirement makes old device handles unavailable. It does not remove local journal records.
Lists contain at most 64 rows per page. Use each list's next-page control to continue.

See [runtime setup](setup.md) and [connection boundaries](architecture.md).

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
