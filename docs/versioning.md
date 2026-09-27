# Version and release rules

[Documentation](README.md) | [Changes](../CHANGELOG.md) | [Contributing](../CONTRIBUTING.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

PRISM has its own version sequence. Its version does not follow the AOTX backend
version. Record supported backend versions separately when integration is tested.

[VERSION](../VERSION) is the source version. Package metadata and the application
version display agree with it.
The initial development version is `0.1.0`. It is not a released application.

## Version changes

Use `MAJOR.MINOR.PATCH` version numbers.

- Increase PATCH for compatible fixes.
- Increase MINOR for features. Before version 1.0, use MINOR for incompatible changes too.
- After version 1.0, increase MAJOR for incompatible changes.
- Use a suffix such as `-rc.1` for a release candidate when needed.

Keep pending changes under `Unreleased` in [the changelog](../CHANGELOG.md).
Group changes by usable behavior. Do not publish development records or estimates.

## Release sequence

1. Prepare the version and changelog on a working branch.
2. Complete the relevant checks and independent review.
3. Merge the release pull request into master.
4. Verify the accepted source commit and package contents.
5. Create an annotated tag such as `v0.1.0` on that commit.
6. Publish the release with matching versioned artifacts and checksums.

Tags and publication require explicit release authorization.
Do not move a published tag or replace published artifacts with different bytes.
Publish a new version for a correction.

Packages include their source identity, dependency notices and checksums. Test installation and upgrade behavior before publication.
Release status must distinguish source checks from complete application acceptance.

Repository visibility is private. Publication to a public audience requires a
separate authorization and release review.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
