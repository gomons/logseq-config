# Logseq customizations

Navigation, search, checklists, and property controls for Markdown file graphs.
Developed for Logseq 0.10.15 on desktop and mobile. Uses internal DOM and APIs,
so Logseq updates may require adjustments. Database graphs are not supported.

## Install

1. Copy [custom.js](logseq/custom.js) and [custom.css](logseq/custom.css) into
   your graph's `logseq/` directory.
2. Merge the settings below into your existing `logseq/config.edn` map.
   The repository's [config.edn](logseq/config.edn) also contains personal
   preferences; copy only the settings you want.
3. Enable custom JavaScript in Logseq and reload with `Cmd+R` / `Ctrl+R`.

```clojure
:notes/contents-shortcut? true
:notes/hide-unlinked-references? true
:ui/enable-tooltip? false
```

The two `:notes/` options default to `true`. Set either to `false` to disable
that behavior. Logseq's built-in `:ui/enable-tooltip?` controls hover previews.

Optional device overrides take priority over the shared Contents setting:

```clojure
:notes/desktop {:contents-shortcut? false}
:notes/mobile {:contents-shortcut? true}
```

Phones and tablets use the mobile setting, independently of window width.
Reload after changing configuration.

## Navigation

- Toolbar shortcuts open Contents and toggle the current page in native
  Favorites. The Contents shortcut is hidden on Contents itself.
- Page headings show the leaf name; clickable parent paths appear in the
  toolbar. On narrow screens, earlier parents move into a popup.
- Subpages, Tagged pages, and Linked References appear after page content,
  with search fields and locally saved fold states.
- `+` beside Subpages creates a child page: enter only its name, then press
  Enter or Create. The parent path is automatic; existing pages open without
  duplication. New pages start with `read-only:: false` so Logseq saves a file
  immediately. The button is available even when there are no children.
- Toolbar icons, spacing, property panels, and catalog cards use shared styles
  that follow the graph's theme.

## Properties

Place page properties at the start of the Markdown file, before any blocks.
Block properties apply where they are written. Boolean values appear as
checkboxes; set a custom option to `false` or remove it to disable it.

| Property | Where | Effect when `true` |
| --- | --- | --- |
| `read-only` | Page or block | Prevent text editing on the page or block and all descendants. A child `false` cannot override an ancestor lock. |
| `searchable` | Page or block | Add text search across the page or child blocks. |
| `checklist` | Page or block | Add All / Unchecked / Checked filters for `CHECK` items. Combines with search. |
| `table-editable` | Table block | Edit cells and add or delete rows in a simple Markdown table. Page and ancestor read-only locks apply. |
| `auto-contents` | Page or block | Render the Pages tree and its search. |
| `auto-favorites` | Page or block | Render native Favorites in their saved order. |
| `auto-tags` | Page or block | Render a tag cloud, sized by the number of referencing blocks. |
| `contents-pin` | Page | Move the page and its children to the top of Pages, without duplication. |
| `contents-exclude` | Page | Hide the page from Pages and its search. Children remain under the nearest visible ancestor. Favorites are unaffected. |

Reading mode preserves navigation, folding, text selection, checkboxes, and
property controls.

Built-in `tags`, `alias`, and `aliases` receive add/remove controls. Tags use
pills; aliases use dashed rectangles. Press Enter or `✓` to confirm an entry.
Plain tags gain `[[…]]`; plain aliases stay text. Explicit `#tag` and `[[Page]]`
forms are preserved and clickable. Keep aliases containing commas inside
`[[…]]` so Logseq treats each as one value. Clicking outside the controls keeps
normal property editing available.

## Contents

To make a Contents page, add these page properties:

```text
auto-favorites:: true
auto-contents:: true
auto-tags:: true
contents-exclude:: true
```

Each section can also be rendered independently on another page or block.
Sections start expanded; tree branches start collapsed. Refreshes preserve
folds, while a reload resets the automatic sections and tree.

Pages lists file-backed pages by namespace. Journals, implicit pages without
files, files under `logseq/`, `.backup/`, or `assets/`, and root `AGENTS.md` and
`README.md` are excluded. No Contents tag is required. Missing namespace levels
appear in the next visible page's path.

Pinned pages show their full path with individually clickable segments. One
horizontal line separates pins from the remaining roots; each group is
alphabetical. Tagged pages is hidden on pages already displaying this tree.

The tag cloud counts explicit hashtags in block text, excluding properties.

## Search and checklists

- Pages search matches leaf names and aliases across eligible note files.
  Results show full clickable paths without alias captions.
- Subpages and Tagged pages search also matches aliases. Linked References
  search filters the text of rendered reference groups.
- Block search includes folded descendants, opens paths to matches, and
  restores folds when cleared.
- Catalog search matches visible fields and aliases of pages linked in those
  fields, such as a book author's translated name.

Start a block with `CHECK` or `CHECKED` to render an interactive checkbox.
These controls use distinct styling from native TODO tasks.

`checklist-exclude` belongs to the custom Checklists query in the notes graph;
this repository does not implement that exclusion query.

For an editable table, put `table-editable:: true` in its block properties.
Focus a cell to edit; leaving it or pressing Enter saves. Escape cancels.
Use Add row below the table and `−` beside a row to remove it. Changes are
saved back to Markdown; conflicting edits require reviewing and retrying.
The experimental editor supports one rectangular table per block and shows
cell contents as plain text, including any Markdown markup.

## Custom catalogs

Catalog queries live in the graph. This repository supplies styling and search
for views using `.notes-catalog`, `.notes-catalog-item`, and
`.notes-catalog-field`. Hidden fields are excluded from search.

Use `.notes-catalog-title` with `data-field="page-title"` for titles and
`data-field="page-alias"` for aliases; both also need `.notes-catalog-field`.
The query controls the fields and their visibility.

## Tests

Requires Node.js 22 or newer. Install the test tools once with `npm ci`, then
run `npm test` whenever needed. Nothing runs automatically or inside Logseq.
To run one area: `node --test tests/tables.test.cjs`.

The `tests/` directory covers navigation, aliases and search, Contents,
read-only inheritance, CHECK/CHECKED, subpage persistence, and table editing.
Tests run the real script against a simulated DOM and Logseq API; they never
read or modify your notes. CSS tests check parsing and important interaction
rules. They do not replace a visual check in Logseq on desktop and mobile.

## License

[MIT](LICENSE) © 2026 Siarhei Homan.
