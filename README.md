# Logseq customizations

Custom CSS and JavaScript for Markdown file graphs.

Developed for Logseq 0.10.15. Uses Logseq's internal DOM and API; updates may
require adjustments. Database graphs are not supported.

## Features

- Star beside Contents in the toolbar adds or removes the page from Favorites.
- Contents icon in the top toolbar, on desktop and mobile; hidden on Contents.
- Short page titles with clickable parent paths in the toolbar.
- On mobile, the nearest parent is visible; earlier levels open in a popup.
- Search for Subpages, Tagged pages, and Linked References, arranged below page
  content.
- Contents, Subpages, and Tagged pages match page aliases without displaying
  alias captions in search results.
- Saved collapse state for these sections, with search hidden while collapsed.
- Hide Unlinked References and disable page previews on hover.
- Collapsible Contents trees, tag clouds, and Favorites lists via block
  properties.
- Block search and checklist filters: All, Unchecked, and Checked.
- `CHECK` / `CHECKED` rendered as interactive checkboxes with a distinct color.
- Boolean properties displayed as checkboxes, including in reading mode.
- Tag properties displayed as pills with add and remove buttons.
- Aliases displayed as text with add and remove buttons.
- Reading mode prevents text editing while preserving navigation, folding, and
  checkboxes.
- Shared catalog styling and search across visible fields.

## Global settings

Add these entries inside the existing map in your graph's `logseq/config.edn`:

```clojure
:notes/contents-shortcut? true
:notes/hide-unlinked-references? true
:ui/enable-tooltip? false
```

Set `contents-shortcut?` to `false` to hide the Contents icon. Set
`hide-unlinked-references?` to `false` to show Unlinked References. These custom
options default to `true`.

The Contents shortcut can also be configured per device:

```clojure
:notes/desktop {:contents-shortcut? false}
:notes/mobile {:contents-shortcut? true}
```

Device values override the shared settings. Omitted keys use the shared value.
Phones and tablets use `:notes/mobile`; desktop uses `:notes/desktop`.
Window width does not affect this. Both sections live in the same synced file.

Logseq's built-in `:ui/enable-tooltip?` controls hover previews; set it to
`true` to restore them. Each option works independently. Reload after changes.

## Properties

Page properties belong at the top of the Markdown file, before the first block.
Other properties can be placed on individual blocks.

Automatic sections render in the block holding their property. Favorites, Pages,
and Tags can each be folded by clicking their heading. Updates preserve the fold
state; reloading resets these sections to expanded.

- `read-only:: true`

  In page properties, lock the whole page. On a block, lock that block and all
  descendants. A `false` value cannot override a locked page or ancestor.
  Navigation, folding, checkboxes, and property switches remain available.

- `tags:: [[Page]], [[Another page]]`

  Show tags as pills in the property panel. Use `−` to remove a tag or `+` to
  enter a page name, then press Enter or `✓`. Clicking outside these controls
  keeps
  Logseq's normal property editing behavior. Plain names gain `[[…]]`; existing
  `#tag` and `[[Page]]` forms are preserved. Buttons also work in reading mode.

- `alias:: Name, Another name`

  Show aliases with `−` to remove and `+` to add. Enter or `✓` confirms a new
  alias. Plain names stay text; explicit `#tag` and `[[Page]]` forms are
  preserved and clickable. The same controls support `aliases::` and work in
  reading mode.

- `searchable:: true`

  Search child blocks, or the entire page when set in page properties.

- `checklist:: true`

  Filter `CHECK` / `CHECKED` among child blocks, or across the page when set in
  page properties. Works independently of search; combines with it when both are
  enabled.

- `auto-contents:: true`

  Render file-backed graph pages inside this block, grouped by namespace.
  No `Contents` tag is required. Search matches leaf names and aliases. Results
  show clickable paths without alias captions. Clearing search restores
  the Contents tree.
  Entries without note files are omitted. Missing namespace levels appear in
  the next real page's label, without creating extra navigation entries.
  Journal entries, including files in `journals/`, are excluded from this tree
  and its search.
  Files under `logseq/`, `.backup/`, `assets/`, and root `AGENTS.md` or `README.md`
  are excluded too.
  Tree branches start collapsed; updates preserve manually opened branches.

- `contents-ignore:: true` (page property)

  Hide this page from the Pages tree and its search. Its children remain
  available under the nearest visible namespace ancestor. Set `false` or
  remove the property to show the page again. Favorites are unaffected.

- `contents-pin:: true` (page property)

  Move this page to the top of Pages, from any namespace depth. It keeps its
  children and is not duplicated in its former branch. Set `false` or remove
  the property to restore its namespace position. Each group is alphabetical.
  One horizontal divider separates pinned pages from the rest; pages appear
  once. Pinned labels show the full page path with `›` between namespace levels.
  Each path segment is a separate link to that page.
  This uses the existing page query and adds no per-page reads or pin buttons.

- `auto-favorites:: true`

  Render Favorites inside this block, in the order saved in the graph
  configuration. Works on any page, independently of the Contents shortcut
  setting.

- `auto-tags:: true`

  Render a tag cloud inside this block from explicit hashtags across the entire
  graph, excluding properties. Size reflects the number of blocks referencing
  each tag.

## Catalog views

Custom query views use `.notes-catalog`, `.notes-catalog-item`, and
`.notes-catalog-field` to share styling and search. Only visible fields are
searched, including aliases of pages linked in those fields. Field selection
belongs to the query; catalog queries remain in the graph.

Titles use `.notes-catalog-title` and `data-field="page-title"`.
Aliases use `data-field="page-alias"`. Both must also use
`.notes-catalog-field` to be searchable. Aliases appear below titles, followed
by the configured attributes, such as author, director, release year, or series.
The same view can be used for other catalogs.

## Installation

1. Copy [custom.js](logseq/custom.js) and [custom.css](logseq/custom.css) into
   your graph's `logseq/` directory.
2. Merge the desired settings from [config.edn](logseq/config.edn) into your
   graph configuration.
3. Enable custom JavaScript in Logseq and reload with `Cmd+R` / `Ctrl+R`.

Add the properties above to enable optional features. Set boolean properties to
`false` to disable them; their checkboxes update the stored values directly.

## License

[MIT](LICENSE) © 2026 Siarhei Homan.
