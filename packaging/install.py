#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Install verified per-user packages and remove only registered application files.
# Inputs: action and optional prefix. Output: installed paths. Exit: 0 done, 1 refused.
import argparse
import fcntl
import hashlib
import re
import json
import os
from pathlib import Path
import shutil
import stat
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
    icon = str(home / 'current/runtime/resources/app/dist/prism-rendered.png')
    escape = lambda value: value.replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$').replace('%', '%%')
    return ('[Desktop Entry]\nType=Application\nName=AOTX-PRISM\n'
            'Comment=Project Runtime Interface and Session Manager\n'
            f'Exec="{escape(launcher)}"\nIcon={icon}\nTerminal=false\nCategories=Utility;Development;\n'
            'StartupWMClass=aotx-prism\nX-AOTX-PRISM-Managed=true\n')


def current_package(home, required=False):
    current = home / 'current'
    if not current.exists() and not current.is_symlink() and not required:
        return
    if not current.is_symlink():
        raise ValueError('The current package pointer is not owned.')
    target = os.readlink(current)
    if not re.fullmatch(r'releases/[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[1-9][0-9]*)?-[0-9a-f]{12}', target):
        raise ValueError('The current package pointer is not owned.')
    release = home / target
    plain(release)
    data = verify(release)
    if release.name != data['version'] + '-' + data['source_commit'][:12]:
        raise ValueError('The current package identity differs.')


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
    entry_hash = lambda value: hashlib.sha256(value.encode()).hexdigest()
    desktop_text = entry(prefix, home)
    allowed = [entry_hash(desktop_text)]
    present = home.exists()
    if present:
        plain(marker)
        saved = json.loads(marker.read_text())
        if saved.get('schema') != MARKER or saved.get('prefix') != str(prefix) or not isinstance(saved.get('desktop_hashes'), list):
            raise ValueError('The installation folder is not registered.')
        allowed = saved['desktop_hashes']
        if not 1 <= len(allowed) <= 2 or any(not isinstance(v, str) or not re.fullmatch('[0-9a-f]{64}', v) for v in allowed):
            raise ValueError('Invalid registered desktop entry.')
    elif action == 'uninstall':
        raise ValueError('No registered installation exists.')
    for path in (binary, desktop):
        if path.exists() or path.is_symlink():
            if not present or (path == binary and (not path.is_symlink() or os.readlink(path) != str(home / 'current/aotx-prism'))) or (path == desktop and (path.is_symlink() or entry_hash(path.read_text()) not in allowed)):
                raise ValueError('An existing launcher is not owned by this installation.')
    if not present:
        home.mkdir(parents=True, mode=0o755)
        atomic(marker, json.dumps({'schema': MARKER, 'prefix': str(prefix), 'desktop_hashes': allowed}))
    lock_path = home / '.lock'
    if lock_path.exists() and not stat.S_ISREG(lock_path.lstat().st_mode):
        raise ValueError('The installation lock is not a regular file.')
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        current_package(home, required=action == 'uninstall')
        if action == 'uninstall':
            if {p.name for p in home.iterdir()} - {'installation.json', '.lock', 'releases', 'current'}:
                raise ValueError('The installation contains unregistered files.')
            releases = home / 'releases'
            plain(releases)
            for release in releases.iterdir():
                installed = verify(release)
                if release.name != installed['version'] + '-' + installed['source_commit'][:12]:
                    raise ValueError('An installed package has an unregistered name.')
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
        binary.parent.mkdir(parents=True, exist_ok=True)
        applications.mkdir(parents=True, exist_ok=True)
        point(current, 'releases/' + name)
        point(binary, home / 'current/aotx-prism')
        previous = entry_hash(desktop.read_text()) if desktop.exists() else entry_hash(desktop_text)
        atomic(marker, json.dumps({'schema': MARKER, 'prefix': str(prefix), 'desktop_hashes': list(dict.fromkeys([previous, entry_hash(desktop_text)]))}))
        atomic(desktop, desktop_text)
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
