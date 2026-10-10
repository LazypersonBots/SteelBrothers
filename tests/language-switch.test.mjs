import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const get=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('every public page includes the language switch and stays excluded from Google',async()=>{
 for(const path of ['index.html','history/index.html','gallery/index.html','activity/index.html','signin/index.html']){
   const html=await get(path);
   assert.match(html,/<script src="\/language\.js" defer><\/script>/,path);
   assert.match(html,/<meta name="robots" content="noindex, nofollow, noimageindex">/,path);
   assert.match(html,/<meta name="googlebot" content="noindex, nofollow, noimageindex">/,path);
 }
 const source=await get('language.js');
 assert.match(source,/sb-language/);
 assert.match(source,/MutationObserver/);
 assert.match(source,/Language \/ Jazyk/);
 assert.match(source,/CREATE ACCOUNT/);
 assert.match(source,/SIGN IN/);
});

test('CZ/EN switch translates actual text and remembers language without changing forms',async()=>{
 const source=await get('language.js'),storage=new Map();
 function scenario(){
   function element(tag){
     const node={
       nodeType:1,tag,children:[],attrs:new Map(),dataset:{},listeners:{},className:'',
       matches(selector){return ['script','style','textarea'].includes(this.tag)&&selector.includes(this.tag);},
       append(child){child.parentElement=this;this.children.push(child);},
       setAttribute(key,value){this.attrs.set(key,value);},
       getAttribute(key){return this.attrs.get(key)||null;},
       hasAttribute(key){return this.attrs.has(key);},
       addEventListener(name,fn){this.listeners[name]=fn;},
       querySelectorAll(selector){
         return selector==='button[data-lang]'?this.children.filter(n=>n.tag==='button'):[];
       }
     };
     return node;
   }
   const textNode=value=>({nodeType:3,nodeValue:value});
   const body=element('body'),header=element('header'),heading=element('h1');
   const text=textNode('VÍC NEŽ STROJE.');heading.append(text);body.append(header);body.append(heading);
   const doc={
     body,title:'Steel Brothers — Jedna cesta. Jedna parta.',
     documentElement:{lang:'cs'},dispatchEvent(){},
     querySelector(selector){return selector==='.header'?header:null;},
     createElement:element,
     createTreeWalker(root){
       const nodes=[];
       function scan(parent){for(const child of parent.children||[]){
         nodes.push(child);if(child.children)scan(child);
       }}
       scan(root);let position=0;
       return {nextNode(){return nodes[position++]||null;}};
     }
   };
   const sandbox={
     document:doc,
     NodeFilter:{SHOW_ELEMENT:1,SHOW_TEXT:4},
     MutationObserver:class{observe(){}},
     CustomEvent:class{constructor(name,payload){this.name=name;this.payload=payload;}},
     localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,val)=>storage.set(key,val)},
     window:{}
   };
   runInNewContext(source,sandbox);
   return {doc,text,host:header,api:sandbox.window.SteelI18n};
 }
 let first=scenario();
 assert.equal(first.text.nodeValue,'VÍC NEŽ STROJE.');
 assert.equal(first.doc.documentElement.lang,'cs');
 assert.equal(first.host.children.length,1);
 first.api.setLang('en');
 assert.equal(first.text.nodeValue,'MORE THAN MACHINES.');
 assert.equal(first.doc.documentElement.lang,'en');
 assert.equal(storage.get('sb-language'),'en');
 assert.equal(first.host.children[0].children[1].attrs.get('aria-pressed'),'true');
 const second=scenario();
 assert.equal(second.text.nodeValue,'MORE THAN MACHINES.');
 second.api.setLang('cs');
 assert.equal(second.text.nodeValue,'VÍC NEŽ STROJE.');
 assert.equal(second.doc.documentElement.lang,'cs');
});
