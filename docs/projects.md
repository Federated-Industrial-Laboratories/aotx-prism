# Projects and files

A project is an existing local folder with a private `.prism/project.sqlite3`
database. It contains ordinary conversation history, generation profiles, local
labels and a separate journal of shared requests. It does not contain CCIR memory.

[Documentation](README.md) | [First use](first-use.md) | [Security](security.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

## Select a folder

Open **Project** to read the complete current path and recent choices.
Disconnect before opening another folder. The `.prism` directory must be private
and owned by the current account. Do not place projects inside the application installation.

Project file access is read-only. Opening a project does not send its files to
a model and does not enable model-driven edits or command execution.

## Manage ordinary history

| Action | Result |
| --- | --- |
| **Rename conversation** | Changes the selected conversation's local name. |
| **Archive conversation** | Hides its history from the main conversation list. |
| **Restore conversation** | Returns an archived conversation to that list. |
| **Export project history** | Writes ordinary project data as JSON to a chosen file. |

Resolve pending requests before archiving a conversation. Archive is not deletion
of local history or device memory. Exports include saved text, profiles and media
references, without credentials or media bytes. Export is not a complete CCIR backup.

The project supports 64 ordinary conversations and 128 turns per conversation.
Serialized history is limited to 16 MiB; large replies can reach that limit first.
See [client limits](architecture.md#local-files) for the remaining bounds.

## Preview files

Open **Project files**, then select a visible folder or text file.
Use **Up one folder** to return. A text preview requires valid UTF-8 in a regular
file of at most 128 KiB. Hidden paths, symbolic links and traversal are refused.

Each directory view contains at most 128 entries from at most 4,096 inspected
entries. It is a bounded preview, not a complete disk inventory.
File contents are not attached to conversations through this view.

## Attach media

**Attach media** appears when the selected model and gateway permit media input.
Select a JPEG or WAV with the native file picker. The client checks its type,
byte limit and returned digest. A ready source appears above the input controls.
Submit a message to use that exact source handle.

Removing an attachment from the input leaves its gateway source intact.
Open **Windows > Media sources** to inspect and explicitly remove sources.
Active requests can prevent removal. Deleted sources cannot support later history references.

An interrupted upload is not retried automatically. Refresh the source list,
then compare the digest and byte count before selecting the file again.
Start a new conversation when its media belongs to another runtime.
Media support does not establish general visual or audio accuracy.

## Back up local history

1. Resolve or record any outstanding requests.
2. Disconnect the gateway and close PRISM.
3. Copy the project folder, including its complete `.prism` directory.
4. Preserve any separate files needed by the project.

Closing PRISM permits a consistent copy of its local database. External runtime
work remains separate. Save and stop a CCIR writer before copying its runtime file.
See [CCIR backup](shared.md#stop-copy-and-restore).

Version-one project data migrates to version two when opened. The original JSON
remains in the database's `original_project` table. Unsupported versions are refused.
An older application may not understand data written by a newer version.
Back up the project before changing application versions.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
