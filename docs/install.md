# Install the Linux desktop

The package targets Linux x86-64 with a graphical session. Python 3.12 or later
installs and verifies it. GNU coreutils supplies the launcher path tools.
Node.js and npm are not required to run an installed package.

The runtime requires the system libraries used by Electron, including GTK, NSS,
GBM and ALSA. Use your distribution's supported packages for these libraries.
The Chromium sandbox must work on the host. PRISM does not disable the sandbox
or change host security policy. A host sandbox refusal must be resolved by its operator.

AOTX executables, gateway dependencies and models are separate installations.
Conversations can use an external gateway. The package does not start
GPU work, download models or create a login startup entry.

## Verify and install

Obtain the archive and its checksum from the same trusted release source.
A checksum checks bytes; it does not establish who published them.

1. Run `sha256sum -c PACKAGE.tar.gz.sha256` beside the archive.
2. Extract the archive with `tar -xzf PACKAGE.tar.gz`.
3. Open the extracted package folder.
4. Run `python3 install.py verify`.
5. Run `python3 install.py install` without `sudo`.
6. Start **AOTX-PRISM** from the application menu.

The command `~/.local/bin/aotx-prism` also starts the installed application.
Use `--prefix /absolute/folder` for a separate installation location.
The same prefix must be supplied when uninstalling that installation.
A custom prefix outside `~/.local` may require a manual desktop-menu entry.

The default installation creates these paths:

| Path | Contents |
| --- | --- |
| `~/.local/share/aotx-prism/releases/` | Verified version and source-commit packages |
| `~/.local/share/aotx-prism/current` | Selected installed package |
| `~/.local/bin/aotx-prism` | Launcher link |
| `~/.local/share/applications/aotx-prism.desktop` | Desktop entry |

Each manifest binds the source commit, dependency lock, file checksums and modes.
Installation refuses changed package files and unrelated existing launchers.
Do not put projects or other files inside the installation folder.

## Upgrade or remove

Close PRISM before an upgrade. Verify the new archive, then run its installer.
The current pointer changes after the copied package passes verification.
Earlier packages remain available.

Install an earlier verified package to select it.
An older application may not understand project data written by a newer version.
Back up projects before changing versions.

Run `python3 install.py uninstall` from an extracted package to remove installation
files and the desktop entry. All user projects and application state are preserved.
Uninstall refuses unregistered files and invalid installation pointers.

Application data normally uses `$XDG_CONFIG_HOME/aotx-prism` or
`~/.config/aotx-prism`. `PRISM_STATE_DIR` overrides that path when explicitly set.
It contains the default workspace, recent folders, runtime profiles and layout.
Chosen projects retain their own `.prism/project.sqlite3` files.
Remove personal data separately only after making any required backups.

## Build a package

From a clean source commit, install the locked dependencies with `npm ci`.
Run `npm run package:linux`. The command rebuilds both application components
and writes an archive, a manifest copy and a checksum under `out/`.

The build uses a temporary copy of committed source. Ignored local files are excluded.
It includes the pinned Electron runtime, local fonts and required dependency notices.
Development tools, credentials, model files and backend programs are excluded.

Packaging does not create a version tag or publish a release.
See [version rules](versioning.md) for the release sequence.
