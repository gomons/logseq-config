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
- Saved collapse state for these sections, with search hidden while collapsed.
- Hide Unlinked References and disable page previews on hover.
- Collapsible Contents trees, tag clouds, and Favorites lists via block
  properties.
- Block search and checklist filters: All, Unchecked, and Checked.
- `CHECK` / `CHECKED` rendered as interactive checkboxes with a distinct color.
- Boolean properties displayed as checkboxes, including in reading mode.
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

  Enable reading mode. Store in the page properties.

- `searchable:: true`

  Search child blocks, or the entire page when set in page properties.

- `checklist:: true`

  Filter `CHECK` / `CHECKED` among child blocks, or across the page when set in
  page properties. Works independently of search; combines with it when both are
  enabled.

- `auto-contents:: true`

  Render a page tree inside this block, starting with pages tagged
  `[[Contents]]` and following namespace children. Search matches the final page
  name and shows clickable paths.

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
searched. Field selection belongs to the query; catalog queries remain in the
graph.

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
