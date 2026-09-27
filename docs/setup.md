# Runtime and project setup

PRISM can connect an external gateway or start a local AOTX runtime.
These paths use the same conversation interface. Local launch requires installed
AOTX 0.3.5 executables, model files, modules and a working gateway Python environment.
PRISM does not download these components.

## Start a local runtime

1. Open **Runtime setup**.
2. Enter a profile name.
3. Select the build folder containing `aotx_boot` and its disk programs.
4. Select the folder containing the `gateway` Python package.
5. Select the Python executable with the gateway dependencies installed.
6. Select the active model store and AOTX modules folder.
7. Select an existing folder for runtime storage.
8. Select **Refresh GPUs**, then select the required GPU.
9. Select the active language role from the model store.
10. Select **Check installation** to inspect the build and model files.
11. Select **Save runtime profile** to retain these paths.
12. Select **Start runtime**.
13. Wait for **ready**, then select **Connect owned runtime**.

The build version reports its compiled profile and slot capacity. A saved runtime
profile selects paths and a GPU. It does not increase compiled capacity.
Startup checks the installation again and refuses an unavailable GPU or invalid store.
The runtime performs its own memory admission and model verification.

Each start creates a private directory with a journal, settings, grants and logs.
Select a short storage path: the resulting service socket must fit 107 bytes.
The model files stay in the selected store. They are not copied.

Complete CCIR creation is a separate workflow that copies its packaged assets.
See [shared workspaces](shared.md) for complete files and persistent conversations.
The local gateway binds loopback and uses a new random credential.
That credential remains in process memory; configuration stores only its hash.

**Stop owned runtime** disconnects its client and waits for process exit.
Closing PRISM also stops its owned runtime. Loss of the desktop IPC connection
causes the supervisor to stop its children. Stored process IDs are never adopted.
Read **Startup and process log** when startup fails.

An external connection has no runtime ownership controls. Disconnecting an external
gateway stops result reads without stopping its runtime. After restarting PRISM,
reopen the project and connect the same external gateway to read retained handles.
A new owned runtime has a new epoch; older ordinary handles can expire.

## Save generation settings

Open **Models**, select a model and apply its token and temperature settings.
Enter a generation profile name and select **Save current settings**.
Use its **Apply** button to restore those settings.

Generation profiles belong to the project. They bind the exact model digest and
must fit the connected gateway limits. They are separate from runtime profiles.
An alias that now names another model cannot silently use the saved profile.

## Manage local history

**Project** shows the complete folder path and recent project choices.
Disconnect before opening another folder. Use **Rename conversation** to change
the selected conversation's local name. **Archive conversation** hides it from the
main list. **Restore conversation** makes it available again.

Archive does not delete history or device memory. Resolve pending requests before
archiving. **Export project history** writes JSON to the selected file. Exports
contain saved text, profiles and media references, without credentials or media bytes.

**Project files** supports nested folders and bounded UTF-8 previews. Use
**Up one folder** to return. Hidden paths, symbolic links and traversal are refused.
Project files are read-only and are not sent with a conversation.

Existing version-one project data migrates to version two. The original JSON remains
in the database's `original_project` table. Unsupported versions are refused.

## Attach JPEG or WAV files

**Attach media** appears when the selected model and gateway permit media input.
Select a JPEG or WAV with the native file picker. The client checks the type,
byte limit and returned digest. A ready source appears above the input controls.
Enter a message and select **Send message** to submit its exact source handle.

Removing an attachment from the input does not delete its gateway source.
Open **Windows > Media sources** to inspect and explicitly remove sources.
Active requests can refuse removal. Deleted sources cannot support later history
references. Start a new conversation when its media belongs to another runtime.

An interrupted upload is not retried. Refresh the source list before selecting
the file again. Match its digest and byte count to identify an accepted upload.
Media availability does not establish general visual or audio accuracy.
