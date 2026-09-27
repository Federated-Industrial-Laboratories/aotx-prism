#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Check committed build inputs with distinct ignored files in documentation and assets.
# Inputs: temporary source commits. Output: assertions. Exit: 0 pass, 1 failure.
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import package_linux as builder


def source(root):
    package = {'name': 'aotx-prism', 'version': '0.1.0', 'description': 'Package test.',
               'license': 'Apache-2.0', 'type': 'module', 'main': 'dist-desktop/desktop/main.js',
               'scripts': {'build': 'python3 build.py'}}
    files = {p: 'Committed content.' for p in ('LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md',
             'VERSION', 'CONTRIBUTING.md', 'docs/install.md', 'public/prism-rendered.png',
             'packaging/install.py', 'packaging/verify.py', 'packaging/aotx-prism')}
    files.update({'package.json': json.dumps(package),
                  'package-lock.json': json.dumps({'packages': {'node_modules/electron': {'version': '1.0.0'}}}),
                  '.gitignore': 'node_modules/\n.env\nout/\ndist/\ndist-desktop/\n',
                  'build.py': "from pathlib import Path\nimport shutil\nshutil.copytree('public', 'dist')\n"
                              "Path('dist/index.html').write_text('Committed application.')\n"
                              "Path('dist-desktop/desktop').mkdir(parents=True)\n"
                              "Path('dist-desktop/desktop/main.js').write_text('Committed desktop.')\n"})
    for name, content in files.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    commands = [('init', '-q'), ('add', '--', *files),
                ('-c', 'user.name=Package Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Add source fixture')]
    for command in commands:
        subprocess.run(['git', *command], cwd=root, check=True, capture_output=True)
    runtime = root / 'node_modules/electron/dist'
    runtime.mkdir(parents=True)
    (runtime / 'resources').mkdir()
    (runtime / 'version').write_text('1.0.0')
    (runtime / 'electron').write_text('Package fixture executable.')
    for dependency in ('react', 'react-dom', 'scheduler', 'dockview', 'dockview-core', 'dockview-react'):
        directory = root / 'node_modules' / dependency
        directory.mkdir()
        (directory / ('LICENCE.md' if dependency.startswith('dockview') else 'LICENSE')).write_text('Package fixture license.')


class PackageInputTests(unittest.TestCase):
    def test_ignored_inputs_are_excluded_from_build_and_archive(self):
        for count in (1, 64):
            with self.subTest(count=count), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                source(root)
                for index in range(count):
                    for folder in ('docs', 'public'):
                        target = root / folder / f'private-{index}/.env'
                        target.parent.mkdir()
                        target.write_text(f'PRIVATE_FIXTURE={count}-{index}-{folder}\n')
                with patch.object(builder, 'ROOT', root), contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(builder.git('status', '--porcelain'), '')
                    builder.build(root / 'out')
                archive = next((root / 'out').glob('*.tar.gz'))
                with tarfile.open(archive) as tar:
                    members = tar.getmembers()
                    self.assertGreater(len(members), 10)
                    for member in members:
                        self.assertNotIn('private-', member.name)
                        if member.isfile():
                            self.assertNotIn(b'PRIVATE_FIXTURE=', tar.extractfile(member).read())
                    doc = next(m for m in members if m.name.endswith('/docs/install.md'))
                    self.assertEqual(tar.extractfile(doc).read(), b'Committed content.')
                self.assertFalse((root / 'dist').exists(), 'The build used the working source folder.')

    def test_source_links_are_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source(root)
            (root / 'public/linked').symlink_to('/etc/passwd')
            subprocess.run(['git', 'add', '--', 'public/linked'], cwd=root, check=True)
            subprocess.run(['git', '-c', 'user.name=Package Test', '-c', 'user.email=test@example.invalid',
                            'commit', '-qm', 'Add linked fixture'], cwd=root, check=True)
            with patch.object(builder, 'ROOT', root), self.assertRaises(ValueError):
                builder.build(root / 'out')
            self.assertFalse((root / 'out').exists())


if __name__ == '__main__':
    unittest.main()
