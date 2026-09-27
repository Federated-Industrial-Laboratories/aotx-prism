#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Check source size, license headers, private data and version metadata.
# Inputs: source root. Output: findings and counts. Exit: 0 clean, 1 findings.
"""Inspect repository text before publication."""

import argparse
import json
import subprocess
import sys
import re
from pathlib import Path

SKIP = {".git", ".venv", "node_modules", "__pycache__", "dist", "build",
        "dist-desktop", "out", "target", ".cache", "coverage", "test-results", "playwright-report"}
SUFFIXES = {".py", ".js", ".mjs", ".cjs", ".cts", ".jsx", ".ts", ".tsx", ".css", ".sh", ".rs"}
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:(?:OPENSSH|RSA|EC|DSA|ENCRYPTED) )?PRIVATE KEY-----"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{60,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
)
PRIVATE_PATTERNS = (
    re.compile(r"/home/(?!(?:operator|user|example)(?![A-Za-z0-9_.-]))[A-Za-z0-9_.-]+"),
    re.compile(r"(?<![\w.])(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?![\w.])"),
    re.compile(r"knowledge/" + r"(?:records|bus)/"),
)
VERSION = re.compile(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-rc\.[1-9]\d*)?")
REQUIRED = ("README.md", "LICENSE", "NOTICE", "VERSION", "CHANGELOG.md",
            "CONTRIBUTING.md", "docs/versioning.md")


def inspect(root: Path) -> tuple[int, list[str]]:
    """Return the inspected text count and specific findings."""
    count, findings = 0, []
    for relative in REQUIRED:
        if not (root / relative).is_file():
            findings.append(f"{relative}: missing required file")
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if any(part in SKIP for part in relative.parts):
            continue
        if path.is_symlink():
            findings.append(f"{relative}: source links are not supported")
            continue
        if not path.is_file():
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            if relative.as_posix() in REQUIRED or path.suffix in SUFFIXES | {".md", ".yml", ".yaml"}:
                findings.append(f"{relative}: text is not valid UTF-8")
            continue
        except OSError:
            findings.append(f"{relative}: file could not be read")
            continue
        count += 1
        if len(content.splitlines()) > 1000 and relative.as_posix() != "package-lock.json":
            findings.append(f"{relative}: more than 1000 lines")
        if path.suffix in SUFFIXES and "SPDX-License-Identifier: Apache-2.0" not in content[:500]:
            findings.append(f"{relative}: missing license identifier")
        for pattern in SECRET_PATTERNS + PRIVATE_PATTERNS:
            if pattern.search(content):
                findings.append(f"{relative}: restricted content ({pattern.pattern[:25]})")
        if any(character in content for character in "\u2013\u2014\u2018\u2019\u201c\u201d\u2026"):
            if path.suffix in SUFFIXES | {".md"}:
                findings.append(f"{relative}: use ASCII punctuation")
        if relative.as_posix() == "VERSION" and not VERSION.fullmatch(content.strip()):
            findings.append("VERSION: use MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH-rc.N")
    package_path = root / "package.json"
    if package_path.exists():
        try:
            version = (root / "VERSION").read_text().strip()
            package = json.loads(package_path.read_text())
            lock = json.loads((root / "package-lock.json").read_text())
            if package["version"] != version or lock["version"] != version or lock["packages"][""]["version"] != version:
                findings.append("Package and lock versions must match VERSION")
        except (OSError, ValueError, KeyError):
            findings.append("Invalid package version metadata")
    if not count:
        findings.append("No source text was inspected")
    return count, findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, nargs="?", default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    count, findings = inspect(args.root)
    for finding in findings:
        print(finding)
    print(f"Repository checks: {count} text files, {len(findings)} findings")
    paths = [str(path) for path in args.root.rglob("*")
             if path.is_file() and path.suffix in SUFFIXES | {".md"}
             and not any(part in SKIP for part in path.relative_to(args.root).parts[:-1])]
    register = subprocess.run([sys.executable, str(args.root / "tools/ste-lint.py"), *paths], check=False)
    return int(bool(findings) or register.returncode != 0)


if __name__ == "__main__":
    raise SystemExit(main())
