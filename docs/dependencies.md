# Dependency notices

[Documentation](README.md) | [License](../LICENSE) | [Notices](../NOTICE)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

The dependency lock records exact package versions and integrity values. Keep
third-party license files when packaging the application.

| Component | License | Use |
| --- | --- | --- |
| Electron | MIT, with Chromium and Node.js notices | Desktop host |
| React and React DOM | MIT | Interface views |
| Dockview and Dockview React | MIT | Docked and floating panels |
| Vite | MIT | Interface build |
| TypeScript | Apache-2.0 | Type checks and desktop compilation |
| tsx | MIT | Test source loading |
| Playwright | Apache-2.0 | Desktop acceptance |
| Michroma | SIL Open Font License 1.1 | Application title |
| Barlow Semi Condensed | SIL Open Font License 1.1 | Interface labels |
| JetBrains Mono | SIL Open Font License 1.1 | Paths and request identifiers |

Font license files are included in `public/fonts/`. The fonts are unmodified.
Package license files are installed with the pinned dependencies. Electron's
`LICENSE` and `LICENSES.chromium.html` must accompany a packaged desktop runtime.

## Packaged notices

Installed archives retain application licenses, font notices, Electron notices and
licenses for bundled renderer dependencies. Development dependencies remain recorded
in the source lockfile; they are not all shipped as runtime packages.

The documentation header, divider and badge artwork are local repository assets.
They add no runtime network request or external font dependency.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
