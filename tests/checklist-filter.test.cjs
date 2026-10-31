const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const {parseHTML} = require('linkedom');
const root = {uuid:'root', content:'checklist:: true', properties:{checklist:true}, children:[
 {uuid:'parent', content:'Heading', children:[{uuid:'hit',content:'check task',children:[
  {uuid:'detail',content:'Explanation'}, {uuid:'wrong',content:'cHeCkEd other',children:[{uuid:'wrong-detail',content:'Other explanation'}]}
 ]}]}, {uuid:'off',content:'checklist:: false\nAlways visible'}, {uuid:'plain',content:'Unrelated text'}
]};
const render = n => `<div class="ls-block" blockid="${n.uuid}"><div class="block-content">${n.content}</div>${(n.children||[]).map(render).join('')}</div>`;
const {window,document} = parseHTML(`<html><body>${render(root)}</body></html>`);
window.logseq={api:{datascript_query:async()=>[[root]], get_block:async()=>root, set_block_collapsed(){}}};
vm.runInNewContext(fs.readFileSync('src/js/inherited-properties.js','utf8')+fs.readFileSync('src/js/subtree-search.js','utf8'),{
 window,document,Node:window.Node,AbortController,MutationObserver:class{observe(){} disconnect(){}},setTimeout,clearTimeout,console
});
(async()=>{
 await new Promise(r=>setTimeout(r,160));
 document.querySelector('[data-filter="unchecked"]').dispatchEvent(new window.Event('click',{bubbles:true}));
 await new Promise(setImmediate);
 const visible=id=>!document.querySelector(`[blockid="${id}"]`).classList.contains('notes-subtree-hidden');
 for(const id of ['parent','hit','detail','off']) assert(visible(id),id);
 for(const id of ['wrong','wrong-detail','plain']) assert(!visible(id),id);
 document.querySelector('[data-filter="checked"]').dispatchEvent(new window.Event('click',{bubbles:true}));
 await new Promise(setImmediate);
 for(const id of ['parent','hit','wrong','wrong-detail','off']) assert(visible(id),id);
 assert(!visible('detail'));
 window.notesSubtreeSearch.abort();
})().catch(e=>{console.error(e);process.exitCode=1;});
