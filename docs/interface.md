# Interface structure

The application draws a frame inside the desktop window. The frame contains the
brand header, connection strip, menu, project rail and dockable workspace.
The outer silver strip is decoration. Operating-system controls remain outside it.

## Colors and type

The silver theme uses warm content surfaces, white reading panels, blue-gray
borders and amber selection marks. Metal gradients identify panel and tab headers.
The graphite theme uses the same hierarchy with darker surfaces and lighter text.

Theme colors are CSS properties in `src/style.css`. Components use these properties
instead of their own color palettes. Body text uses Tahoma or Arial. Short titles
use Michroma. Paths and identifiers use JetBrains Mono. Fonts are bundled locally.

Messages have a labeled header and a plain reading surface. Model output is shown
as exact text. The input area has square borders and a separate action strip.
Focus outlines identify keyboard controls. Status text accompanies colored marks.

## Panels and activity

Panels can float, dock, resize and maximize. Restore returns to the previous layout.
Closing a panel does not close its conversation or cancel device work.

Activity opens with readable status tiles and event lists. It has no animated visualization.

Activity reports policy counters and accessible conversation events. Event pages
are separate from the shared workspace page. Refresh keeps the selected page.

The welcome view reports the current project, connection and model. It provides
actions for project storage, connection settings and a new conversation.
