# Interface and windows

PRISM draws a frame inside the desktop window. It contains the brand header,
connection strip, menu, project rail and dockable workspace. The outer silver cap
is decoration; operating-system window controls remain outside it.

[Documentation](README.md) | [First use](first-use.md) | [Affect and controls](controls.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

## Workspace regions

| Region | Purpose |
| --- | --- |
| Header and connection strip | Product identity, version and observed gateway connection. |
| Menu | Project, connection, models, affect, runtime and supporting windows. |
| Project rail | Current folder, ordinary conversation list and file access. |
| Workspace | Conversation views and movable utility panels. |
| Footer | Request readiness and local history save state. |

The welcome view reports the current project, connection and model. Its actions
open project storage, connection settings and conversation setup.
It does not claim an active connection before one exists.

## Arrange panels

Panels can float, dock, resize and maximize. Drag a tab to arrange it with other
panels, or use the panel's **Float**, **Dock** and **Maximize** controls.
**Restore** returns to the preceding layout. Theme and layout are saved separately
from project content. Invalid saved geometry returns to the default workspace.

Closing a panel does not close its conversation or cancel device work.
Closing the application stops runtimes owned by PRISM, while external runtimes
continue under their operator's control.

## Keyboard controls

| Key | Action |
| --- | --- |
| Tab / Shift+Tab | Move through controls in keyboard order. |
| Enter / Space | Activate a focused button. |
| Ctrl+Enter | Send from the ordinary conversation message box. |
| Escape | Close an open Windows menu. |

Focus outlines identify the active control. Status text accompanies colored marks.
The theme selector switches between silver and graphite.

## Reading and status

Messages use labeled headers and plain reading surfaces. Model output remains
exact text, including its whitespace. Input areas use square borders and a separate
action strip. Request details expose the recorded identity and state.

A completed request, saved local history and durable CCIR result have different
meanings. Read [request recovery](shared.md#request-recovery-and-durability) for
shared receipts and [troubleshooting](troubleshooting.md) for interrupted ordinary work.

Activity presents readable counters and event lists. It contains no animated view.
The Affect window separates new-input controls from runtime-wide settings.

## Visual reference

The silver theme uses warm content surfaces, white reading panels, blue-gray rules
and amber selection marks. Metal gradients identify panel and tab headers.
Graphite retains the hierarchy with darker surfaces and lighter text.

Theme colors are CSS properties in `src/style.css`. Body text uses Tahoma or Arial.
Michroma identifies short titles, Barlow labels, and JetBrains Mono paths and identifiers.
Local font files support the application without a network font dependency.

Documentation uses the same silver and amber accents. Its header character is a
documentation asset; the application's rendered prism mark remains its launcher identity.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
