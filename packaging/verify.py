#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Verify package files against their content and mode manifest.
# Inputs: package folder. Output: verified metadata. Exit: 0 verified, 1 invalid.
import hashlib
import json
import re
import stat
from pathlib import Path


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def inventory(root):
    rows = {}
    for path in sorted(root.rglob('*')):
        mode = path.lstat().st_mode
        if stat.S_ISLNK(mode) or not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
            raise ValueError('Package links and special files are not permitted.')
        if stat.S_ISREG(mode) and path.relative_to(root).as_posix() != 'manifest.json':
            rows[path.relative_to(root).as_posix()] = {'sha256': digest(path), 'mode': stat.S_IMODE(mode)}
    return rows


def verify(root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Select a regular package folder.')
    manifest = root / 'manifest.json'
    if manifest.is_symlink() or not manifest.is_file() or manifest.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('Invalid package manifest.')
    data = json.loads(manifest.read_text())
    if data.get('schema') != 'aotx.prism.package.v1' or data.get('platform') != 'linux-x64':
        raise ValueError('Unsupported package format.')
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[1-9][0-9]*)?', data.get('version', '')):
        raise ValueError('Invalid package version.')
    if not re.fullmatch(r'[0-9a-f]{40}', data.get('source_commit', '')):
        raise ValueError('Invalid source identity.')
    if not re.fullmatch(r'[0-9a-f]{64}', data.get('lock_sha256', '')):
        raise ValueError('Invalid dependency identity.')
    files = data.get('files', {})
    required = {'aotx-prism', 'runtime/electron', 'app/package.json', 'app/dist/index.html',
                'app/dist-desktop/desktop/main.js', 'install.py', 'verify.py', 'LICENSE'}
    if not required.issubset(files) or files != inventory(root):
        raise ValueError('Package contents do not match the manifest.')
    if files['aotx-prism']['mode'] != 0o755 or files['runtime/electron']['mode'] != 0o755:
        raise ValueError('Package executables have invalid permissions.')
    if any(row['mode'] not in (0o644, 0o755) for row in files.values()):
        raise ValueError('Package modes are invalid.')
    return data
