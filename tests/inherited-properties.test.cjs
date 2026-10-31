const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const keys = ['read-only', 'search-show', 'checklist-show', 'table-wrap', 'table-editable'];
const props = value => Object.fromEntries(keys.map(key => [key, value]));
const page = {name: 'page', properties: props(true)};
const leaf = {uuid: 'leaf', page: {id: 1}};
const parent = {uuid: 'parent', properties: props(false), children: [leaf]};
const window = {logseq: {api: {
  get_page: async () => page,
  get_page_blocks_tree: async () => [parent],
  get_block: async () => parent,
}}};
vm.runInNewContext(fs.readFileSync('src/js/inherited-properties.js', 'utf8'), {window});
(async () => {
  const resolve = () => window.notesInheritedProperties(leaf, keys);
  for (const key of keys) assert.equal((await resolve())[key], false, key);
  leaf.content = keys.map(key => `${key}:: true`).join('\n');
  for (const key of keys) assert.equal((await resolve())[key], true, key);
  delete leaf.content; parent.properties = {};
  for (const key of keys) assert.equal((await resolve())[key], true, key);
  parent.properties = props(false); leaf.parent = {id: 2};
  for (const key of keys) assert.equal((await resolve())[key], false, key);
  assert.equal(window.notesBooleanProperty({content: 'table-wrap:: false'}, 'table-wrap'), false);
  assert.equal(window.notesBooleanProperty({content: 'text'}, 'table-wrap'), undefined);
  console.log('Five properties: page, nearest ancestor, explicit false, own true, tree and parent API paths passed.');
})().catch(e => {console.error(e); process.exitCode = 1;});
