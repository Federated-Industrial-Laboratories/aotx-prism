#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Install verified per-user packages and remove only registered application files.
# Inputs: action and optional prefix. Output: installed paths. Exit: 0 done, 1 refused.
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
sys.dont_write_bytecode = True
from verify import verify

MARKER = 'aotx.prism.install.v1'


def plain(path):
    for part in [path, *path.parents]:
        if part.is_symlink():
            raise ValueError('Installation paths must not contain links.')


def atomic(path, content):
    descriptor, name = tempfile.mkstemp(prefix='.prism-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(content)
        os.chmod(name, 0o644)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def point(path, target):
    temporary = path.with_name(path.name + '.new')
    if temporary.exists() or temporary.is_symlink():
        raise ValueError('An unfinished installation pointer exists.')
    try:
        temporary.symlink_to(target)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def entry(prefix, home):
    launcher = str(prefix / 'bin/aotx-prism')
    icon = str(home / 'current/app/dist/prism-rendered.png')
    escape = lambda value: value.replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%')
    return ('[Desktop Entry]\nType=Application\nName=AOTX-PRISM\n'
            'Comment=Project Runtime Interface and Session Manager\n'
            f'Exec="{escape(launcher)}"\nIcon={icon}\nTerminal=false\nCategories=Utility;Development;\n'
            'StartupWMClass=aotx-prism\nX-AOTX-PRISM-Managed=true\n')


def operate(action, package, prefix):
    prefix = Path(os.path.abspath(prefix))
    if any(c in str(prefix) for c in '\n\r\t\\%'):
        raise ValueError('The installation prefix contains control characters.')
    plain(prefix)
    if os.geteuid() == 0:
        raise ValueError('Install for a normal desktop account without sudo.')
    data = verify(package) if action == 'install' else None
    home = prefix / 'share/aotx-prism'
    applications = prefix / 'share/applications'
    binary = prefix / 'bin/aotx-prism'
    desktop = applications / 'aotx-prism.desktop'
    for path in (home, applications, binary.parent):
        plain(path)
    marker = home / 'installation.json'
    present = home.exists()
    if present:
        plain(marker)
        saved = json.loads(marker.read_text())
        if saved != {'schema': MARKER, 'prefix': str(prefix)}:
            raise ValueError('The installation folder is not registered.')
    elif action == 'uninstall':
        raise ValueError('No registered installation exists.')
    for path in (binary, desktop):
        if path.exists() or path.is_symlink():
            if not present or (path == binary and (not path.is_symlink() or os.readlink(path) != str(home / 'current/aotx-prism'))) or (path == desktop and (path.is_symlink() or path.read_text() != entry(prefix, home))):
                raise ValueError('An existing launcher is not owned by this installation.')
    if not present:
        home.mkdir(parents=True, mode=0o755)
        atomic(marker, json.dumps({'schema': MARKER, 'prefix': str(prefix)}))
    lock_path = home / '.lock'
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if action == 'uninstall':
            if {p.name for p in home.iterdir()} - {'installation.json', '.lock', 'releases', 'current'}:
                raise ValueError('The installation contains unregistered files.')
            releases = home / 'releases'
            plain(releases)
            for release in releases.iterdir():
                verify(release)
            binary.unlink(missing_ok=True)
            desktop.unlink(missing_ok=True)
            shutil.rmtree(home)
            print('Application files removed. Project folders and desktop data are preserved.')
            return
        releases = home / 'releases'
        plain(releases)
        releases.mkdir(exist_ok=True)
        name = data['version'] + '-' + data['source_commit'][:12]
        target = releases / name
        if target.exists() or target.is_symlink():
            if verify(target) != data:
                raise ValueError('This version has different installed bytes.')
        else:
            temporary = Path(tempfile.mkdtemp(prefix='.stage-', dir=home))
            try:
                shutil.copytree(package, temporary / 'package')
                verify(temporary / 'package')
                os.rename(temporary / 'package', target)
            finally:
                shutil.rmtree(temporary)
        current = home / 'current'
        if (current.exists() or current.is_symlink()) and (not current.is_symlink() or not os.readlink(current).startswith('releases/')):
            raise ValueError('The current package pointer is not owned.')
        binary.parent.mkdir(parents=True, exist_ok=True)
        applications.mkdir(parents=True, exist_ok=True)
        point(current, 'releases/' + name)
        point(binary, home / 'current/aotx-prism')
        atomic(desktop, entry(prefix, home))
        print(f'Installed {data["version"]}: {binary}')


def main():
    parser = argparse.ArgumentParser(description='Install or remove AOTX-PRISM for the current account.')
    parser.add_argument('action', choices=['install', 'uninstall', 'verify'])
    parser.add_argument('--prefix', type=Path, default=Path.home() / '.local')
    args = parser.parse_args()
    package = Path(__file__).resolve().parent
    try:
        if args.action == 'verify':
            data = verify(package)
            print(f'Verified {data["version"]}: {len(data["files"])} files')
        else:
            operate(args.action, package, args.prefix)
    except (OSError, ValueError, KeyError) as error:
        print(f'Installation refused: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
