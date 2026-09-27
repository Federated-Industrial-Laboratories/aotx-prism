# Dependency notices

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
