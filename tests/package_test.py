#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Check package integrity, distinct upgrades and preservation of unrelated files.
# Inputs: synthetic packages. Output: assertions. Exit: 0 pass, 1 failure.
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'packaging'))
from install import operate
from verify import inventory, verify


def fixture(root, index):
    package = root / f'package-{index}'
    package.mkdir()
    for path in ('aotx-prism', 'runtime/electron', 'runtime/resources/app/package.json', 'runtime/resources/app/dist/index.html',
                 'runtime/resources/app/dist-desktop/desktop/main.js', 'install.py', 'verify.py', 'LICENSE'):
        target = package / path
        target.parent.mkdir(exist_ok=True, parents=True)
        target.write_text(f'Package {index}: {path}')
        target.chmod(0o755 if path in ('aotx-prism', 'runtime/electron') else 0o644)
    data = {'schema': 'aotx.prism.package.v1', 'platform': 'linux-x64', 'version': f'0.1.{index}',
            'source_commit': f'{index + 1:040x}', 'lock_sha256': 'f' * 64, 'files': inventory(package)}
    (package / 'manifest.json').write_text(json.dumps(data))
    return package


class PackageTests(unittest.TestCase):
    def test_distinct_upgrades_and_preserved_projects(self):
        for count in (1, 64):
            with self.subTest(count=count), tempfile.TemporaryDirectory() as temporary, contextlib.redirect_stdout(io.StringIO()):
                root = Path(temporary)
                prefix = root / 'Local Applications'
                project = prefix / 'share/projects/.prism/project.sqlite3'
                project.parent.mkdir(parents=True)
                project.write_bytes(b'Preserved project')
                for i in range(count):
                    source = fixture(root, i)
                    operate('install', source, prefix)
                    current = prefix / 'share/aotx-prism/current'
                    self.assertEqual(verify(current.resolve())['source_commit'], f'{i + 1:040x}')
                    self.assertEqual((current / 'runtime/resources/app/dist/index.html').read_text(), f'Package {i}: runtime/resources/app/dist/index.html')
                    self.assertEqual(len(list((current.parent / 'releases').iterdir())), i + 1)
                    self.assertEqual(os.readlink(prefix / 'bin/aotx-prism'), str(current / 'aotx-prism'))
                operate('uninstall', source, prefix)
                self.assertTrue(project.exists(), 'Uninstall removed the user project.')
                self.assertEqual(project.read_bytes(), b'Preserved project')
                self.assertFalse((prefix / 'share/aotx-prism').exists())
                self.assertFalse((prefix / 'bin/aotx-prism').is_symlink())
                self.assertFalse((prefix / 'share/applications/aotx-prism.desktop').exists())

    def test_changed_bytes_modes_and_extra_files_are_refused(self):
        for defect in ('bytes', 'mode', 'extra', 'link'):
            with self.subTest(defect=defect), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                source = fixture(root, 0)
                target = source / 'LICENSE'
                if defect == 'bytes':
                    target.write_text('Changed')
                elif defect == 'mode':
                    target.chmod(0o777)
                elif defect == 'extra':
                    (source / 'extra').write_text('Unexpected')
                else:
                    target.unlink()
                    target.symlink_to('/etc/passwd')
                with self.assertRaises(ValueError):
                    operate('install', source, root / 'prefix')
                self.assertFalse((root / 'prefix').exists())

    def test_unrelated_target_and_unregistered_release_data_are_preserved(self):
        with tempfile.TemporaryDirectory() as temporary, contextlib.redirect_stdout(io.StringIO()):
            root = Path(temporary)
            source = fixture(root, 0)
            prefix = root / 'prefix'
            (prefix / 'bin').mkdir(parents=True)
            binary = prefix / 'bin/aotx-prism'
            binary.write_text('Unrelated')
            with self.assertRaises(ValueError):
                operate('install', source, prefix)
            self.assertEqual(binary.read_text(), 'Unrelated')
            binary.unlink()
            operate('install', source, prefix)
            extra = prefix / 'share/aotx-prism/current/project.txt'
            extra.write_text('Preserve this file')
            with self.assertRaises(ValueError):
                operate('uninstall', source, prefix)
            self.assertEqual(extra.read_text(), 'Preserve this file')
            self.assertTrue(binary.is_symlink())

    def test_linked_parent_is_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = fixture(root, 0)
            (root / 'other').mkdir()
            (root / 'prefix').symlink_to(root / 'other')
            with self.assertRaises(ValueError):
                operate('install', source, root / 'prefix')
            self.assertEqual(list((root / 'other').iterdir()), [])


if __name__ == '__main__':
    unittest.main()
