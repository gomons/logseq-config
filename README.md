# Logseq customizations

Navigation, search, property controls and editable Markdown tables for Logseq
0.10.15 file graphs, on desktop and mobile. Uses internal DOM and APIs;
Logseq updates may require adjustments. Database graphs are not supported.

## Install

1. Download the ZIP from GitHub Releases, or build locally as described below.
2. Back up your graph's `logseq/custom.js`, `custom.css` and `config.edn`, then close Logseq.
3. Copy the ZIP's `logseq/custom.js` and `logseq/custom.css` into your graph.
   Local builds produce the same files under `dist/logseq/`.
4. For a new graph, copy the supplied `config.edn` too. For an existing graph,
   review and merge its settings to preserve your favorites, shortcuts and queries.
5. Enable custom JavaScript in Logseq and reload with `Cmd+R` / `Ctrl+R`.

The config contains these feature switches:

```clojure
:notes/contents-shortcut? true
:notes/hide-unlinked-references? true
:ui/enable-tooltip? false
```

The two `:notes/` switches default to `true`; set either to `false` to disable it.
Logseq's `:ui/enable-tooltip?` controls hover previews. Optional device overrides
for the Contents shortcut take priority over the shared value:

```clojure
:notes/desktop {:contents-shortcut? false}
:notes/mobile {:contents-shortcut? true}
```

Device type is independent of window width. Reload after changing config.

## Navigation and search

- Toolbar buttons open Contents and toggle native Favorites. Page headings show
  leaf names; each segment of the parent path is clickable. On narrow screens,
  earlier parents move into a popup.
- Subpages, Tagged pages and Linked References have search and saved fold states.
  Subpages and Tagged pages match names and aliases; Linked References matches
  rendered text. `+` beside Subpages creates a child using only its name and
  preserves the parent's original spelling, even on an empty parent page.
- Pages lists file-backed pages by namespace, with collapsed branches. It excludes
  journals, implicit pages without files, service directories and root AGENTS/README.
  Search matches leaf names and aliases, showing full clickable paths without
  alias captions. Refresh preserves tree folds; reload resets them.
- Block search includes folded descendants, opens paths to matches and restores
  folds when cleared. Catalog search includes visible fields and linked-page aliases.
- The Tags cloud counts explicit hashtags in block text, excluding properties.

## Properties

Put page properties at the beginning of the file. Block properties apply to their
block. Boolean properties have checkboxes; set them to `false` or remove them to disable.

| Property | Scope | Effect when true |
| --- | --- | --- |
| `read-only` | Page or block | Prevent text editing, including descendants; child false does not override a lock. |
| `searchable` | Page or block | Search page or nested blocks. |
| `checklist` | Page or block | All / Unchecked / Checked filters for CHECK items. |
| `table-wrap` | Table block | `true` or omitted keeps native Logseq layout; `false` keeps content width with horizontal scrolling. Explicit line breaks remain in both modes. |
| `table-editable` | Table block | Edit existing cells, including multiline text, on read-only pages or blocks. |
| `auto-contents` | Page or block | Pages tree and search. |
| `auto-favorites` | Page or block | Native Favorites in saved order. |
| `auto-tags` | Page or block | Tag cloud. |
| `contents-pin` | Page | Promote to the top of Pages without duplication; full clickable path and one separator. |
| `contents-exclude` | Page | Hide from Pages and search; children stay under the nearest visible ancestor. |

Reading mode preserves navigation, folding, selection, checkboxes and property
controls. Built-in `tags`, `alias` and `aliases` have add/remove controls.
Plain tags become links; plain aliases remain text. Keep aliases containing
commas in `[[…]]` so Logseq treats them as one value.

For a Contents page, use:

```text
auto-favorites:: true
auto-contents:: true
auto-tags:: true
contents-exclude:: true
```

These sections start expanded and can also be used independently on other blocks.
Tagged pages is hidden where the Pages tree is displayed. Favorites are unaffected
by `contents-exclude`.

Start a block with `CHECK` or `CHECKED` for interactive checkboxes with distinct
styling from TODO tasks. `checklist-exclude` is used by a query in the notes graph;
this repository does not implement that query.

`table-wrap` works independently of editing. `true` and an omitted property keep
Logseq's default table layout. Only `false` changes it: columns use content width
without soft wrapping, and the whole table scrolls horizontally. Explicit line
breaks remain in both modes.

For tables, add `table-editable:: true` to the table's block. This explicitly
overrides `read-only` for that table's controls; surrounding text stays locked. Cells wrap text and
expand in height. Focus to edit; blur or Enter saves; Escape cancels. Shift+Enter
inserts a line break, stored as `<p>first<br>second</p>` in Markdown so Logseq renders it natively.

On touch devices, Enter inserts a newline; leaving the cell saves it. On desktop,
Enter saves and Shift+Enter inserts a newline. Inputs overlay text-sized cells
without adding intrinsic input width or control gutters. Drag the handles to the
left of rows or above headers to reorder them; the insertion line previews the
position and Escape cancels the drag. Handles appear on hover on desktop and
remain visible on touch devices. Crosses on the right delete rows; crosses below
the table delete columns. The last row and column are kept. `Add row` appends an
empty row; `Add column` appends a column named `Column`.
With `table-wrap:: true`, drag a header boundary to resize its two adjacent
columns without changing the total width. Sizes are temporary, local to the
current device, survive Edit/View switches, and reset on reload; no properties
are saved. Resizing also works without `table-editable` and on read-only blocks.
Escape cancels resizing.

Native and editable tables share a thin grid, a uniform body background and bold,
centered headers using the theme's secondary background. Space above the table
is reserved in both modes so enabling editing does not shift it vertically.
Without `table-editable:: true`, Logseq renders the table with these shared styles.

One rectangular Markdown table per block is supported. Other markup is shown
as plain text. Conflicting edits require review and retry.

## Catalogs

Queries live in the graph. This project styles and searches `.notes-catalog`
with `.notes-catalog-item` rows and `.notes-catalog-field` searchable fields.
Hidden fields are excluded. For titles and aliases, add `.notes-catalog-title`
and `data-field="page-title"` or `data-field="page-alias"` to the field.

## Development

Requires Python 3.9+ and Node.js 22+. Run:

```sh
npm ci                       # Install test tools once
python3 build.py              # Build, test, create dist/logseq-config.zip
python3 test.py               # Build test inputs and run tests, without creating a ZIP
python3 build.py --build-only # Build files without tests or ZIP
python3 build.py --check      # Check existing outputs without writing
```

`npm run build` calls `build.py`; `npm test` calls `test.py`. Failed builds do not
leave a previous release ZIP behind. The ZIP contains JS, CSS, merged config,
this README, the license and SHA-256 checksums. `dist/` is ignored by Git.

- `src/js/`, `src/css/`: runtime features and styles; edit these sources.
- `src/config/`: unmodified [Logseq 0.10.15 defaults](https://github.com/logseq/logseq/blob/0.10.15/src/resources/templates/config.edn)
  and project overrides. Defaults are local and never downloaded during a build.
- `src/manifest.json`: ordered inputs for each output. Shared JS helpers must come
  before consumers; later CSS rules can override earlier ones. Config maps merge
  recursively in order, with later files winning; lists, sets and scalars replace.
  Add more config layers here as needed. Functions remain text and are never
  evaluated by Python; unsupported reader macros fail explicitly.

`build.py` handles config merging and packaging; `test.py` runs all checks and
contains the Python tests. Feature tests in `tests/` load modules
against a simulated DOM and Logseq API; a startup test runs the complete bundle.
CSS tests parse the stylesheet and check interaction rules. Tests do not touch
notes. They do not replace visual checks in desktop/mobile Logseq.
For a single feature: `node --test tests/tables.test.cjs`.

## Releases

GitHub Actions builds and tests pushes to main, pull requests and manual runs.
Every successful build uploads a ZIP artifact. On main, it also creates a tag
and GitHub Release named `v1.<commit-count>.0`, with the tested ZIP attached.
The count comes from `git rev-list --count HEAD` using the full commit history.
Manual runs on main can publish too; PRs and other branches do not publish.
Rerunning the same commit updates its ZIP rather than creating another release.
Existing tags are never moved to a different commit.

## License

[MIT](LICENSE) © 2026 Siarhei Homan.
