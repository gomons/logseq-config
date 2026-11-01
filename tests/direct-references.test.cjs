const fs=require("fs"),vm=require("vm"),assert=require("assert/strict");
const {parseHTML}=require("linkedom");
const {window,document}=parseHTML(`<html><body><div class="page"><div class="ls-page-title"><span class="title" data-ref="area/topic">Topic</span></div><div class="references page-linked"><div class="foldable-title"><h2>9 Linked References</h2></div>
<div id="mixed" class="references-blocks-item"><div class="foldable-title"><a data-ref="source">Source</a></div><div class="ls-block" blockid="indirect"></div><div class="ls-block" blockid="alias"></div><div class="ls-block" blockid="plain"></div><div class="ls-block" blockid="code"></div><div class="ls-block" blockid="context"><div class="ls-block" blockid="child"></div></div></div>
<div id="folded-indirect" class="references-blocks-item"><div class="foldable-title"><a data-ref="other">Other</a></div></div>
<div id="folded-direct" class="references-blocks-item"><div class="foldable-title"><a data-ref="folded">Folded</a></div></div>
</div></div></body></html>`);
const candidate=(id,uuid,content,page="source",properties={},parent={id:100})=>({id,uuid,content,page:{name:page},properties,parent,refs:[{name:"area/topic"},{name:"topic alias"},{name:"area/topic/child"}]});
let graph="graph",filtered=false,resolveSlow=null;
const rows=[
 candidate(1,"indirect","series:: [[Area/Topic/Child]]"),
 candidate(2,"alias","#Topic Alias? [[Topic alias]]"),
 candidate(3,"plain","tags:: Area/Topic","source",{tags:["Area/Topic"]}),
 candidate(4,"code","`[[Area/Topic]]`\n[[Area/Topic/Child]]"),
 candidate(5,"context","[[Area/Topic/Child]]"),
 candidate(6,"child","[caption]([[Area/Topic]])","source",{}, {id:5,parent:{id:100}}),
 candidate(7,"other","[[Area/Topic/Child]]","other"),
 candidate(8,"folded","#[[Topic alias]]","folded"),
 candidate(9,"self","alias:: Topic alias","area/topic",{alias:["Topic alias"]}),
];
let scheduled, interval, now=0;
class Clock extends Date { static now(){return now;} }
window.logseq={api:{
 get_state_from_store:()=>graph,
 get_page:async()=>({name:"area/topic",properties:{alias:["Topic alias"],...(filtered?{filters:"native-filters"}:{})}}),
 datascript_query:async query=>{assert(query.includes('"area/topic"'));assert(query.includes('"topic alias"'));return resolveSlow?await new Promise(r=>resolveSlow=r):rows.map(row=>[row]);},
}};
class Observer{constructor(fn){}observe(){}disconnect(){}}
vm.runInNewContext(fs.readFileSync("src/js/direct-references.js","utf8"),{window,document,AbortController,MutationObserver:Observer,Date:Clock,console,
 setTimeout:fn=>(scheduled=fn,1),clearTimeout(){},setInterval:fn=>(interval=fn,1),clearInterval(){}});
const hidden=id=>document.getElementById(id)?.classList.contains("notes-indirect-reference")||document.querySelector(`[blockid="${id}"]`)?.classList.contains("notes-indirect-reference");
(async()=>{
 await scheduled();
 assert(hidden("indirect"));assert(hidden("code"));assert(hidden("folded-indirect"));
 for(const id of ["mixed","alias","plain","context","child","folded-direct"])assert(!hidden(id),id);
 assert.equal(document.querySelector("h2").textContent,"4 Linked References");
 // Native filters remain authoritative; don't substitute an unfiltered count.
 filtered=true;now=3001;interval();await scheduled();assert.equal(document.querySelector("h2").textContent,"Linked References");
 // Editing a reference is picked up without remounting the panel.
 rows[0].content="[[Area/Topic]]";now=6002;interval();await scheduled();assert(!hidden("indirect"));
 // Ignore results for a graph that changed during the asynchronous query.
 resolveSlow=true;now=9003;interval();const pending=scheduled();await new Promise(setImmediate);graph="other";rows[0].content="[[Area/Topic/Child]]";resolveSlow(rows.map(row=>[row]));await pending;assert(!hidden("indirect"));
 window.notesDirectReferences.abort();assert(!hidden("folded-indirect"));
 console.log("Direct references: exact targets, aliases, properties, code, ancestor context, folded groups, filters, updates and stale graph responses passed.");
})().catch(error=>{console.error(error);process.exitCode=1;});
