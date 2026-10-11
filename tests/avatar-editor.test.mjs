import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const editorSource = await read('avatar-editor.js');

function harness() {
  const calls=[];
  const handlers=new Map();
  const classes=new Set();
  const doc={activeElement:{isConnected:true,focus(){}},
    body:{append(node){doc.overlay=node;},classList:{
      add(value){classes.add(value);},remove(value){classes.delete(value);}
    }},
    createElement(tag){
      if(tag==='div')return overlay;
      if(tag==='canvas')return output;
      throw Error('Unexpected tag '+tag);
    },
    addEventListener(name,fn){handlers.set(name,fn);},
    removeEventListener(name){handlers.delete(name);}
  };
  function el(tag='button'){
    return {tag,disabled:false,textContent:'',events:{},value:'100',
      addEventListener(name,handler){this.events[name]=handler;},
      focus(){doc.activeElement=this;},getClientRects(){return [{width:1}];},
      getBoundingClientRect(){return {width:320,height:320};}};
  }
  const ctx={fillRect(){},clearRect(){},beginPath(){},arc(){},clip(){},save(){},
    restore(){},stroke(){},drawImage(...args){calls.push(args);}};
  const canvas=el('canvas');canvas.getContext=()=>ctx;
  canvas.setPointerCapture=()=>{};
  const output=el('canvas');output.getContext=()=>ctx;
  output.toDataURL=()=>('data:image/webp;base64,'+'A'.repeat(40));
  const elements={
    '.sb-crop-dialog':el('section'),
    'canvas':canvas,
    'input[type=range]':el('input'),
    '.sb-crop-save':el(),
    '.sb-crop-error':el('p'),
    '.sb-crop-close':el(),
    '.sb-crop-cancel':el(),
    '.sb-crop-minus':el(),
    '.sb-crop-plus':el()
  };
  elements['.sb-crop-dialog'].querySelectorAll=()=>Object.values(elements).filter(x=>x.events);
  const overlay={className:'',removed:false,
    querySelector:selector=>elements[selector]||null,
    addEventListener(name,fn){this.events[name]=fn;},
    events:{},remove(){this.removed=true;}};
  const sandbox={window:{},document:doc,Math};
  runInNewContext(editorSource,sandbox);
  return {doc,classes,handlers,calls,overlay,elements,canvas,api:sandbox.window.SteelAvatarEditor};
}

test('crop geometry always covers circular area and clamps pan and zoom',()=>{
  const {api}=harness();
  assert.ok(api);
  const wide=api.layout(800,400);
  assert.equal(wide.drawHeight,288);
  assert.equal(wide.drawWidth,576);
  assert.equal(wide.maxX,144);
  assert.equal(wide.maxY,0);
  assert.equal(wide.x,(320-576)/2);
  assert.equal(api.layout(800,400,.1,999,10).offsetX,144);
  assert.equal(api.layout(800,400,.1,999,10).offsetY,0);
  const tall=api.layout(400,800,3,-900,900);
  assert.equal(tall.zoom,3);
  assert.ok(tall.drawWidth>=288&&tall.drawHeight>=288);
  assert.equal(tall.offsetX,-tall.maxX);
  assert.equal(tall.offsetY,tall.maxY);
  assert.equal(api.layout(400,400,10).zoom,4);
  assert.throws(()=>api.layout(0,400));
});

test('selecting a file opens non-destructive editor; drag, zoom and Save upload cropped WebP',async()=>{
  const h=harness();let saved=null,count=0;
  h.api.open({naturalWidth:800,naturalHeight:400},async data=>{saved=data;count++;});
  assert.ok(h.doc.overlay);
  assert.ok(h.classes.has('sb-avatar-editing'));
  assert.equal(count,0,'must not upload before pressing Save');
  assert.equal(h.elements['input[type=range]'].value,'100');
  h.elements['.sb-crop-plus'].events.click();
  assert.equal(h.elements['input[type=range]'].value,'120');
  const stateBefore=h.calls.length;
  h.canvas.events.pointerdown({pointerId:1,clientX:150,clientY:150,preventDefault(){}});
  h.canvas.events.pointermove({pointerId:1,clientX:95,clientY:150});
  h.canvas.events.pointerup({pointerId:1});
  assert.ok(h.calls.length>stateBefore,'pan must render another preview');
  await h.elements['.sb-crop-save'].events.click();
  assert.match(saved,/^data:image\/webp;base64,/);
  assert.equal(count,1);
  assert.ok(h.overlay.removed);
  assert.equal(h.classes.has('sb-avatar-editing'),false);
  assert.equal(h.handlers.has('keydown'),false);
  assert.ok(h.calls.some(args=>args.length===5&&args[0].naturalWidth===800));
});

test('Cancel discards crop, and failed upload leaves dialog open for retry',async()=>{
  const h=harness();let calls=0;
  h.api.open({naturalWidth:500,naturalHeight:800},async()=>{
    calls++;throw Error('Server temporarily unavailable');
  });
  await h.elements['.sb-crop-save'].events.click();
  assert.equal(calls,1);
  assert.equal(h.overlay.removed,false);
  assert.equal(h.elements['.sb-crop-error'].textContent,'Server temporarily unavailable');
  assert.equal(h.elements['.sb-crop-save'].disabled,false);
  h.elements['.sb-crop-cancel'].events.click();
  assert.ok(h.overlay.removed);
  assert.equal(calls,1);
});

test('editor is shipped on all profile pages and reuses secure avatar endpoint',async()=>{
  const profile=await read('member-profile.js');
  const build=await read('scripts/build-gallery.mjs');
  const render=await read('server/render-app.mjs');
  const preview=await read('preview.mjs');
  const css=await read('member-profile.css');
  const langs=await read('language.js');
  assert.match(profile,/SteelAvatarEditor\.open\(img, data=>setAvatar\(data\)\)/);
  assert.match(profile,/\/api\/account\/avatar/);
  assert.doesNotMatch(profile,/ctx\.drawImage\(img,/,'no immediate crop/upload without confirmation');
  for(const source of [build,render,preview]) assert.match(source,/avatar-editor\.js/);
  for(const path of ['index.html','activity/index.html','gallery/index.html','history/index.html']){
    const html=await read(path);
    assert.ok(html.indexOf('src="/avatar-editor.js"')<html.indexOf('src="/member-profile.js"'),path);
    assert.match(html,/<meta name="robots" content="noindex, nofollow, noimageindex">/);
  }
  assert.match(css,/touch-action:none/);
  assert.match(css,/\.sb-crop-overlay/);
  assert.match(editorSource,/pointermove/);
  assert.match(editorSource,/pointercancel/);
  assert.match(editorSource,/keydown/);
  assert.match(langs,/"ULOŽIT FOTKU": "SAVE PHOTO"/);
});
