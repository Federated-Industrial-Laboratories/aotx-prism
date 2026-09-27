# Contributing

Use a working branch for each coherent change. Submit a pull request to master.
Do not update master directly after the initial repository setup.
The repository is private. Branch rules are applied manually on the current
hosting plan. GitHub does not enforce branch protection for this repository.

Stage files explicitly. Use a short imperative commit subject that states the
change. Use American English and short technical sentences in repository text.
Do not add personal names or co-author trailers to commit messages.
Pull requests describe the resulting behavior and relevant validation.

Keep credentials, local development records and private machine details outside
the repository. Samples and captures must contain only approved example data.
Preserve third-party licenses and notices.

## Checks and review

Run these commands before a commit:

```sh
npm run check
npm run test:desktop
node --import tsx tests/setup-desktop.mjs
git diff --check
git diff --cached --check
```

The hosted `Repository checks` job runs for each branch push and pull requests to master.
It checks source size, license identifiers, common secret patterns and version
metadata. It also builds the application and runs focused tests. A passing job does not establish application acceptance.

Add focused tests with application features. Test the complete affected workflow.
Run visible desktop checks for interface changes.

Target fewer than 400 lines per source file. The file ceiling is 1,000 lines.
Add an Apache-2.0 SPDX identifier to source files. Generated dependency lockfiles
retain their package-manager format and are excluded only from the line ceiling.
Build outputs are excluded from source checks.

Substantial code receives one independent review after author checks pass.
Resolve findings and run the affected checks again. Small changes receive an
author review. Review outside GitHub does not count as a GitHub account approval.

The repository owner merges the pull request after checks and review are complete.
Use a squash merge with a concise description of the final change.
Automatic merging is disabled. Do not force-push master.

## Dependencies and releases

Pin CI actions to verified commit IDs. Commit dependency lockfiles when packages
are added. Keep runtime assets local to the application.

Follow [version and release rules](docs/versioning.md).
Repository creation does not authorize tags, releases or changes to visibility.
