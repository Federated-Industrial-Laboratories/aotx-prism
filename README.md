# AOTX-PRISM

Project Runtime Interface and Session Manager.

AOTX-PRISM is a desktop client project for AOTX conversations, project files and
CCIR runtime files. It uses the existing AOTX interfaces.

The repository is in development. No application or installable release is
available yet.

## Scope

The first application is planned to support these workflows:

- Start ordinary model conversations and organize project files.
- Create or open CCIR runtime files through existing AOTX interfaces.
- Inspect conversation sources, available controls and save state.
- Open an optional CCIR activity window from the menu.

These workflows are planned. Model-driven file changes and command execution
are outside the first release.

## Development

The development version is `0.1.0`, stored in [VERSION](VERSION).
No version tag or application package is published.

Run the repository checks with Python 3.12 or later:

```sh
python3 tools/check_source.py
git diff --check
```

These checks inspect source files and version metadata. They do not establish
application or runtime acceptance.

See [contribution rules](CONTRIBUTING.md), [version and release rules](docs/versioning.md),
and [changes](CHANGELOG.md).

## License

The source uses the [Apache License 2.0](LICENSE).
See [NOTICE](NOTICE) for attribution.
