#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Build a versioned Linux archive from a clean source commit and pinned dependencies.
# Inputs: output folder. Output: archive, manifest and checksum. Exit: 0 built, 1 failed.
import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_verify', ROOT / 'packaging/verify.py')
verify_module = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(verify_module)


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def build(output):
    if platform.system() != 'Linux' or platform.machine() != 'x86_64':
        raise ValueError('Packaging requires Linux x86-64.')
    if git('status', '--porcelain', '--untracked-files=normal'):
        raise ValueError('Commit source changes before packaging.')
    commit = git('rev-parse', 'HEAD')
    package = json.loads((ROOT / 'package.json').read_text())
    version = package['version']
    lock = json.loads((ROOT / 'package-lock.json').read_text())
    electron = ROOT / 'node_modules/electron/dist'
    if (electron / 'version').read_text().strip() != lock['packages']['node_modules/electron']['version']:
        raise ValueError('The Electron runtime differs from the dependency lock.')
    for directory in ('dist', 'dist-desktop'):
        shutil.rmtree(ROOT / directory, ignore_errors=True)
    subprocess.run(['npm', 'run', 'build'], cwd=ROOT, check=True)
    if git('rev-parse', 'HEAD') != commit or git('status', '--porcelain', '--untracked-files=normal'):
        raise ValueError('The source changed during the build.')
    name = f'aotx-prism-{version}-{commit[:12]}-linux-x64'
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'{name}.tar.gz'
    if archive.exists():
        raise ValueError('The output archive already exists.')
    with tempfile.TemporaryDirectory(prefix='prism-package-') as temporary:
        destination = Path(temporary) / name
        destination.mkdir()
        shutil.copytree(electron, destination / 'runtime', ignore=shutil.ignore_patterns('default_app.asar'))
        app = destination / 'runtime/resources/app'
        app.mkdir()
        for directory in ('dist', 'dist-desktop'):
            shutil.copytree(ROOT / directory, app / directory)
        (app / 'package.json').write_text(json.dumps({key: package[key] for key in ('name', 'version', 'description', 'license', 'type', 'main')}, indent=2) + '\n')
        for path in ('LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md', 'VERSION', 'CONTRIBUTING.md'):
            shutil.copyfile(ROOT / path, destination / path)
        shutil.copytree(ROOT / 'docs', destination / 'docs')
        (destination / 'public').mkdir()
        shutil.copyfile(ROOT / 'public/prism-rendered.png', destination / 'public/prism-rendered.png')
        for path in ('install.py', 'verify.py', 'aotx-prism'):
            shutil.copyfile(ROOT / 'packaging' / path, destination / path)
        notices = destination / 'licenses'
        notices.mkdir()
        for dependency in ('react', 'react-dom', 'scheduler', 'dockview', 'dockview-core', 'dockview-react'):
            base = ROOT / 'node_modules' / dependency
            filename = 'LICENCE.md' if dependency.startswith('dockview') else 'LICENSE'
            shutil.copyfile(base / filename, notices / f'{dependency}.txt')
        for path in destination.rglob('*'):
            if path.is_file():
                mode = 0o755 if path.name in ('aotx-prism', 'electron', 'chrome-sandbox', 'chrome_crashpad_handler') else 0o644
                path.chmod(mode)
        manifest = {'schema': 'aotx.prism.package.v1', 'platform': 'linux-x64', 'version': version,
                    'source_commit': commit, 'lock_sha256': verify_module.digest(ROOT / 'package-lock.json'),
                    'electron': (electron / 'version').read_text().strip(), 'files': verify_module.inventory(destination)}
        (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
        verify_module.verify(destination)
        with tarfile.open(archive, 'w:gz') as tar:
            tar.add(destination, arcname=name)
        shutil.copyfile(destination / 'manifest.json', output / f'{name}.manifest.json')
    checksum = verify_module.digest(archive)
    archive.with_suffix(archive.suffix + '.sha256').write_text(f'{checksum}  {archive.name}\n')
    print(json.dumps({'archive': str(archive), 'sha256': checksum, 'source_commit': commit}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Package the committed Linux desktop.')
    parser.add_argument('--output', type=Path, default=ROOT / 'out')
    args = parser.parse_args()
    build(args.output.resolve())
