const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {parseHTML} = require('linkedom');
const storage = new Map();
function start() {
  const {window, document} = parseHTML('<html><body><div id="main-content-container"><div class="cp__sidebar-main-content"></div></div></body></html>');
  window.location = {hash: '#/page/health'};
  window.localStorage = {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)};
  window.logseq = {api: {get_state_from_store: () => 'graph'}};
  vm.runInNewContext(fs.readFileSync('src/js/tabs.js', 'utf8'), {window, document, AbortController, setInterval: () => 1, clearInterval() {}});
  return {window, document};
}
let {window, document} = start();
document.querySelector('.notes-tab-open-next').click();
window.location.hash = '';
window.dispatchEvent(new window.Event('notes-route-change'));
assert.equal(document.querySelector('[aria-current="true"]').textContent, 'Home');
document.querySelectorAll('.notes-tab-label')[0].click();
assert.equal(window.location.hash, '#/page/health');
document.querySelectorAll('.notes-tab-label')[1].click();
assert.equal(window.location.hash, '#/');
window.notesDesktopTabs.abort();
({window, document} = start());
assert.equal(window.location.hash, '#/');
assert.equal(document.querySelectorAll('.notes-tab-label').length, 2);
assert.equal(document.querySelector('[aria-current="true"]').textContent, 'Home');
console.log('Home route stays in its tab across switching and restart');
