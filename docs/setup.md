# Runtime and project setup

PRISM can connect an external gateway or start a local AOTX installation.
Both use the same conversation interface. A local launch requires installed
backend tools, gateway dependencies, model files and modules.

[Documentation](README.md) | [First use](first-use.md) | [Shared CCIR](shared.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

## Choose the connection type

| Connection | Ownership |
| --- | --- |
| External gateway | Its operator starts and stops the backend. PRISM only connects. |
| Owned ordinary runtime | PRISM launches the selected local installation and supervises its processes. |
| Owned complete CCIR | PRISM activates a compatible local file and requests a saved shutdown. |

An external gateway can run on another machine. PRISM does not install remote
software or manage its processes. Use HTTPS or an independently configured loopback tunnel.

## Start a local runtime

1. Open **Runtime setup** and enter a profile name.
2. Select the build folder containing `aotx_boot` and its disk programs.
3. Select the folder containing the `gateway` Python package.
4. Select a Python executable with the gateway dependencies installed.
5. Select the active model store and AOTX modules folder.
6. Select an existing folder for runtime storage.
7. Select **Refresh GPUs**, then choose the required GPU.
8. Select the active language role from the model store.
9. Select **Check installation** and inspect the reported build and models.
10. Select **Save runtime profile**.
11. Select **Start runtime**.
12. Wait for **ready**, then select **Connect owned runtime**.

The build reports its compiled profile and slot capacity. Saving a profile does
not increase those capacities. Startup rechecks the installation and refuses
an unavailable GPU or invalid model store. The backend owns final resource admission.

Each start creates a private directory with a journal, settings, grants and logs.
Use a short storage path: the resulting service socket must fit 107 bytes.
Ordinary runtime model files stay in the selected store and are not copied.
Complete CCIR creation instead packages its assets into a new file.

The owned gateway binds loopback with a random credential. The credential remains
in process memory; its configuration stores only a hash.
Read **Startup and process log** if launch fails.

## Grant operator controls

Before starting an owned runtime, select **Allow runtime affect controls** to grant
its connection permission to change runtime affect settings. Select **Allow background
policy controls** when policy management is also required.

These are separate grants. Neither qualifies a model nor adds missing policy or
steering assets. External operators configure the corresponding grants themselves.
See [affect controls](controls.md) and [policy work](evidence.md#control-policy-work).

## Stop and reconnect

**Stop owned runtime** disconnects its client and waits for its processes to exit.
Closing PRISM also stops owned processes. Loss of the desktop IPC connection causes
the supervisor to stop its children. Stored process IDs are never adopted.

For a shared file, shutdown first requests a saved receipt and then verifies the
stopped file. Inspect the reported result. A timeout or forced cleanup is a failed
confirmation, not a successful saved stop. See [CCIR shutdown](shared.md#stop-copy-and-restore).

Disconnecting an external gateway stops result reads while its runtime continues.
After restarting PRISM, reopen the project and reconnect to read retained handles.
A new ordinary owned runtime has a new epoch; older request handles can expire.

## Save generation settings

Open **Models**, select an advertised model and apply output-token and temperature
settings. Enter a profile name and select **Save current settings**.
Use that profile's **Apply** action to restore it.

Generation profiles belong to the project and bind an exact model digest.
Their values must fit current gateway limits. An alias that now names a different
model cannot silently use the old profile. Up to 32 profiles can be saved per project.

Runtime profiles instead belong to the desktop account and hold installation paths
and GPU selection. Up to 32 runtime profiles can be saved. Neither kind of profile
is a project folder, conversation prompt or shared privacy boundary.

## Manage local history

Use **Project** for folder selection, conversation names, archive and JSON export.
[Projects and files](projects.md) explains those actions and consistent backups.

## Attach JPEG or WAV files

Select media explicitly when the model and gateway advertise support.
The [attachment procedure](projects.md#attach-media) covers uploads, uncertain
results and source removal. Project previews do not upload files.

## Conversation instructions

**+ New conversation** and **New CCIR conversation** open the setup window.
Set the name and prompt before creation. The neutral default assigns no identity;
an empty field is permitted. Existing histories retain their original instructions.

Ordinary prompts are saved locally and precede the conversation messages.
Shared prompts require a selected space and advertised backend support. Their
exact bytes are stored by the runtime and remain fixed for that conversation.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
