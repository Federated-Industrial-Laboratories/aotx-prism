# First use

PRISM opens a local workspace without starting a model. The connection strip
shows whether a gateway is connected. A project folder stores local history.
It is not a grant for model file access.

## Choose a workflow

| Need | Start here |
| --- | --- |
| Use a running gateway | Open **Connection** and enter its URL and bearer token |
| Start an installed local runtime | Open **Runtime setup** and check a saved installation profile |
| Keep ordinary conversations in a folder | Open **Project**, choose the folder and select **Open project** |
| Use persistent shared conversations | Open **CCIR workspace** after connecting a complete shared file |
| Inspect memory or background work | Open **Windows > Memory evidence** or **Windows > Activity** |

An external gateway requires HTTPS, or HTTP through an exact loopback address.
A local SSH tunnel can expose a remote gateway. Tokens remain in process memory.
Enter the token again after restarting PRISM.

## Hold an ordinary conversation

1. Open or select a project folder.
2. Connect a gateway or select **Connect owned runtime** after local startup.
3. Open **Models** and select an advertised model.
4. Apply the token limit and temperature.
5. Select **New conversation**.
6. Set the conversation name and system prompt.
7. Select **Create conversation**.
8. Enter text and select **Send message**.

Use Ctrl+Enter to send from the message box. Tab and Shift+Tab move keyboard focus.
Enter or Space activates a focused button. Escape closes the open Windows menu.
Use the theme selector for silver or graphite.

Model output is shown as received. **Completed** means the request has a terminal
result; the footer separately reports local history storage.
When supported, **Attach media** selects JPEG or WAV input explicitly.
Project file previews are read-only and do not send files to the model.

## Open shared work

Shared CCIR files carry persistent participants, spaces, conversations and device
state. A runtime profile names a local installation; a generation profile names
model settings. Neither profile is a project or a shared privacy boundary.

Follow [shared workspaces](shared.md) to create or open a complete file.
Select a participant, space and conversation before sending shared input.
Shared receipts distinguish admission, completion and saved state.
Save and stop a writer before copying a complete file.

Automatic memory, appraisal and controls depend on exact model qualification.
Unqualified features remain unavailable. [Evidence and activity](evidence.md)
explains supported views, exact references, controls and background counters.
The optional visualization starts closed and does not generate model work.

## Resume after interruption

Reopen the project from **Project**. Connect the same gateway when it still exists.
For ordinary input with a retained handle, select **Read result**.
An uncertain submission without a handle is not sent again automatically.
For shared input, inspect the retained operation and its receipt before retrying.
The shared journal preserves the exact request identity.

Closing PRISM stops runtimes that it owns. External runtimes continue independently.
Do not infer a saved device result from a local history entry alone.
Read [setup](setup.md) and [connection and storage](architecture.md) for recovery limits.
