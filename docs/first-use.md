# First use

PRISM opens a local workspace without starting a model. The connection strip
reports gateway status. The project rail identifies where local history is stored.
Choosing a folder does not grant a model access to its files.

[Documentation](README.md) | [Installation](install.md) | [Shared CCIR](shared.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

## Choose how to connect

| Available system | Start here |
| --- | --- |
| A running local or remote gateway | Open **Connection** and enter its URL and bearer token. |
| An installed local AOTX build | Follow [runtime setup](setup.md), then select **Connect owned runtime**. |
| A complete shared CCIR file | Follow [activation](shared.md#open-a-complete-runtime), then open **CCIR workspace**. |

Remote gateway URLs require HTTPS. HTTP is permitted for exact loopback addresses
and `localhost`. An SSH tunnel can expose a remote gateway on loopback.
Use the credential issued by its operator. PRISM does not retain that token on disk.

## Open a project

1. Open **Project**.
2. Select **Browse folders** or enter an existing folder path.
3. Select **Open project**.
4. Check the current folder shown in the project rail.

PRISM stores its history in the folder's private `.prism` directory.
Disconnect before selecting another project. [Projects and files](projects.md)
explains archives, exports and backups.

## Hold an ordinary conversation

1. Connect the gateway.
2. Open **Models** and select an advertised model.
3. Apply the output-token limit and temperature.
4. Select **+ New conversation**.
5. Set the name and review the system prompt.
6. Select **Create conversation**.
7. Enter a message and select **Send message**.

The neutral default assigns no name or runtime role. Edit it before creation,
or leave it blank. **Use neutral default** restores the supplied instructions.
Existing conversations keep their original instructions.

The ordinary system prompt permits at most 4,096 UTF-8 bytes. This is a prompt
field limit, not the model's total context capacity. The connected backend also
limits the combined prompt and output. PRISM does not silently trim history.

Use Ctrl+Enter to send from the ordinary message box. Model output appears as
received. **Completed** reports a terminal device result; the footer separately
reports whether local history was saved.

## Use persistent conversations

Open **CCIR workspace** after connecting a complete shared runtime. Register the
participant, select a space and select **New CCIR conversation**. The setup window
lets you set its name and instructions before the first input.

Shared prompts require advertised support. The supported prompt field and each
shared input have separate 2,048-byte limits. Instructions remain fixed for that
conversation. Runtime memory rules and authenticated actor context still apply.

A shared result can be completed while its save is pending. Read the receipt,
generation and pending bytes. Follow [shared CCIR](shared.md) for scopes,
permissions and saved-file recovery.

## Open supporting windows

| Action | Window |
| --- | --- |
| Select a model or save generation settings | **Models** |
| Select qualified controls or permitted runtime settings | **Affect** |
| Read project files | **Project files** |
| Inspect memory and source references | **Windows > Memory evidence** |
| Read background counters and events | **Windows > Activity** |

Panels can float, dock, resize and maximize. Closing a panel does not cancel its
request. Choose silver or graphite with the theme selector.
See [interface controls](interface.md) for keyboard and layout details.

## Resume after interruption

Reopen the project and reconnect the same gateway when it is still available.
Use **Read result** for an ordinary request with a retained handle. A submission
with uncertain admission and no handle is not sent again automatically.

Shared operations retain an exact recovery identity. Inspect the receipt before
using **Retry exact request**. This action differs from an ordinary resubmission.
[Recovery guidance](troubleshooting.md#interrupted-requests) explains both cases.

Closing PRISM stops its owned runtime. External runtimes continue under their
operator's control. A local history entry alone does not establish a saved device result.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
