# Security and data boundaries

PRISM is a desktop client of an AOTX gateway. The runtime owns inference, memory
and admission. Local project state records what the client saved; it does not
override current runtime permissions or prove that an operation is durable.

[Documentation](README.md) | [Architecture](architecture.md) | [Shared CCIR](shared.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

## Credentials and connections

Remote connections require HTTPS with valid system certificate trust.
HTTP is accepted only for exact loopback addresses and `localhost`.
Redirects are refused. Use a separately configured SSH tunnel for a remote
loopback gateway; PRISM does not create the tunnel or manage SSH credentials.

Bearer tokens remain in process memory and are cleared on disconnect or exit.
They are not included in portable project history. Locally owned gateways use
random credentials; their configuration stores the credential hash.
Treat credentials from external operators as private access material.

## Desktop isolation

The renderer loads bundled assets through `prism://app/`. It has no Node.js
access, generic IPC interface or direct network access. Navigation, pop-up windows,
webviews and permission requests are refused. Named desktop commands are validated.

The Electron sandbox remains enabled. Resolve a host sandbox refusal through
supported system configuration; do not disable it to run PRISM.

## Projects and attachments

The selected project permits bounded read-only previews of visible regular files.
Hidden paths, symbolic links, device files and traversal are refused.
A project folder grants no model tools or implicit file upload.

Media upload is explicit. Uploaded sources remain at the gateway until removed
or otherwise expired by that service. Removing an attachment from the composer
does not delete its source. Exports can contain private conversation text.

## Shared access

The runtime checks current grants and space membership for operations and reads.
A participant ID identifies stored membership; it is not a replacement for a bearer credential.
Private, room and instance scopes have different access rules.
Publishing a memory record to another space is an explicit mutation.

Runtime affect changes require `affect_manage`. Policy actions require their own
management permission. These controls can affect work across the connected runtime.
Check the scope shown by the interface before applying a setting.

## Runtime files and local launch

A complete CCIR can contain private memory, model assets and executable native
policy code. Verify its source and keep it under the intended account's control.
The local launcher does not supply native policy trust. Use a configured external
runtime for a file that requires that authority.

The launcher executes installed backend programs through fixed argument arrays.
Installation profiles name executable paths; use a trusted installation.
PRISM stops only the process groups it owns. Disconnecting an external gateway
neither stops that runtime nor erases its memory.

Save and stop a CCIR writer before copying its file. Close PRISM before backing
up a project database. Uninstall preserves projects and desktop state.
Remove retained personal data separately when it is no longer required.

## Report a suspected defect

Use a private channel to the repository maintainers. Include the affected version,
source commit and a minimal example with synthetic data. Do not place credentials,
private runtime files or personal conversations in a public issue.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
