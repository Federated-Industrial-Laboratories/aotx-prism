# Testing

Use checks that cover the changed behavior. Source checks, HTTP fixtures, visible
desktop tests and native runtime acceptance establish different results.
A passing client fixture does not establish GPU inference or model quality.

[Documentation](README.md) | [Contributing](../CONTRIBUTING.md) | [Support](support.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

## Source and protocol checks

From the repository root, install locked dependencies with `npm ci`, then run:

```sh
npm run check
git diff --check
```

The check command applies source and register gates, type checks, the application
build, client tests and package tests. It requires Python, Node.js and npm.
The hosted **Repository checks** job runs this command on branch pushes and pull requests.

Client tests cover request identities, byte cursors, UTF-8 boundaries, permissions,
project transactions, saved request recovery, prompts and revision-bound settings.
Batch fixtures exercise distinct identities at N=1 and N=64 where applicable.

## Visible desktop checks

Build the application first. In a local graphical session, run the tests for the
changed interface:

```sh
npm run build
npm run test:desktop
node --import tsx tests/setup-desktop.mjs
node --import tsx tests/shared-desktop.mjs
node --import tsx tests/evidence-desktop.mjs
node --import tsx tests/conversation-controls-desktop.mjs
```

These tests use isolated state and local HTTP fixtures. They drive real sandboxed
Electron windows for project setup, docking, controls, recovery and presentation.
Keep their state separate from personal projects and active runtimes.

A presentation change needs visible inspection in both themes and at the supported
window sizes. Documentation changes need source gates, link checks and a rendered
reading pass. They do not require an unrelated GPU or model acceptance run.

## Package checks

```sh
npm run test:package
npm run package:linux
```

Package creation requires a clean source commit. It rebuilds a temporary copy of
committed files and produces an archive, manifest and checksum in `out/`.
Ignored local files are excluded.

Before release, verify the extracted package and exercise installation, upgrade,
removal and reopening with isolated project data. Check the package source identity
and retain the corresponding command results. Uninstall must preserve user data.

## Native integration

A native acceptance run needs a compatible AOTX build, qualified model assets,
a GPU and a separate runtime file or journal. Use synthetic inputs and a bounded
run. Read actual admission, completion and saved-state receipts.

Exercise the complete affected path, including stop and recovery when storage
changes. Do not treat a fixture server's response as evidence from a GPU runtime.
Reuse backend and exact-model acceptance when their code and assets are unchanged.

## Review and release

Substantial code receives one independent review after author checks pass.
The author fixes findings and reruns the affected checks. Documentation-only
changes receive an author reading, link and presentation check.

A release also verifies source/package identity and installation behavior.
[Version rules](versioning.md) define the tag and publication sequence.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
