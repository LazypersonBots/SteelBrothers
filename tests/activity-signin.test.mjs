import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('activity homepage shows three newest entries; full page shows all', async () => {
  const dataset = JSON.parse(await read('activity-data.json'));
  assert.equal(dataset.activities.length, 6);
  const js = await read('activity.js');
  for (const mode of ['home', 'all']) {
    const root = {
      dataset: { activityList: mode },
      children: [],
      replaceChildren(...children) { this.children = children; }
    };
    function element(name) {
      return {
        tagName: name,
        children: [],
        className: '',
        textContent: '',
        append(...children) { this.children.push(...children); }
      };
    }
    const document = {
      querySelector(selector) { return selector === '[data-activity-list]' ? root : null; },
      createElement: element
    };
    runInNewContext(js, {
      document,
      fetch: async () => ({ ok: true, json: async () => dataset }),
      console,
      Date
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(root.children.length, mode === 'home' ? 3 : 6);
    assert.equal(root.children[0].children[1].textContent, 'Sobota na vedlejších silnicích');
  }
});

test('activity real dated entries sort ahead of placeholders', async () => {
  const source = await read('activity.js');
  const mockData = { activities: [
    { title:'Placeholder', category:'Other', description:'Pending', status:'Brzy', publishedAt:null },
    { title:'Newest', category:'Ride', description:'Ready', status:'Info', publishedAt:'2026-10-09T17:00:00Z' },
    { title:'Older', category:'Ride', description:'Ready', status:'Info', publishedAt:'2026-10-08T17:00:00Z' },
    { title:'Middle', category:'Ride', description:'Ready', status:'Info', publishedAt:'2026-10-08T18:00:00Z' }
  ] };
  const root = { dataset: { activityList:'home' }, children:[], replaceChildren(...args){ this.children=args; }};
  const document = {
    querySelector(){return root},
    createElement(tag){return {tag,children:[],append(...args){this.children.push(...args)}}}
  };
  runInNewContext(source,{document,fetch:async()=>({ok:true,json:async()=>mockData}),console,Date});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(root.children.map(c=>c.children[1].textContent),
    ['Newest','Middle','Older']);
});

test('both activity and gallery have working return and navigation links', async () => {
  const home = await read('index.html');
  const activity = await read('activity/index.html');
  const gallery = await read('gallery/index.html');
  assert.match(home,/href="\/activity\/">ZOBRAZIT VŠECHNY AKTIVITY/);
  assert.match(home,/href="\/signin\/">PŘIDAT SE/);
  assert.match(activity,/href="\/"[^>]*>← ZPĚT NA HLAVNÍ STRÁNKU/);
  assert.match(activity,/data-activity-list="all"/);
  assert.match(gallery,/href="\/activity\/">Aktivity/);
});

test('signin demo has required email, nickname and password, no fake email verification', async () => {
  const page = await read('signin/index.html');
  const js = await read('signin.js');
  assert.match(page,/id="email"[^>]+type="email" required/);
  assert.match(page,/id="nickname"[^>]+required/);
  assert.match(page,/id="password"[^>]+type="password" required minlength="8"/);
  assert.match(page,/id="confirm-password"[^>]+required/);
  assert.match(page,/Ověření e-mailu: TBA/);
  assert.match(page,/žádné údaje se neposílají ani neukládají/);
  assert.match(js,/event\.preventDefault\(\)/);
  assert.match(js,/reportValidity\(\)/);
  assert.doesNotMatch(js,/\bfetch\s*\(|\blocalStorage\b\s*\./);
  assert.doesNotMatch(page,/<form[^>]+action=/);
});

test('sign-in has original kinetic road and speedometer, no static hero picture', async () => {
  const page = await read('signin/index.html');
  const css = await read('auth.css');
  const js = await read('ride-motion.js');
  assert.match(page, /class="auth-drive-road-dashes"/);
  assert.match(page, /class="auth-drive-streaks"/);
  assert.match(page, /class="auth-drive-dial"/);
  assert.match(page, /id="auth-drive-speed"/);
  assert.match(page, /id="auth-drive-toggle"[^>]*aria-pressed="false"/);
  assert.match(page, /src="\/ride-motion\.js"/);
  assert.match(page, /JEDNA CESTA\./);
  assert.match(css, /@keyframes auth-drive-lanes/);
  assert.match(css, /@keyframes auth-drive-streak/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.auth-page \[hidden\]\{display:none!important\}/);
  assert.match(js, /requestAnimationFrame/);
  assert.match(js, /matchMedia/);
  assert.doesNotMatch(page, /auth-club-photo|auth-photo-scene|auth-ride-bike|<img class="auth-/);
  assert.doesNotMatch(css, /auth-photo-push|auth-club-photo|auth-motor-idle/);
});

test('motion controller animates speed and needle, pauses, resumes and respects reduced motion', async () => {
  const script = await read('ride-motion.js');
  const animations = new Map();
  const elements = new Map();
  const listeners = new Map();
  let frameId = 0;
  let reducedChange = null;
  const media = {matches:false, addEventListener(name, fn){if(name==='change') reducedChange=fn;}};
  function elem(name) {
    const item = {
      name, textContent:'', disabled:false, style:{}, attributes:{},
      classList:{paused:false,toggle(key,value){ if(key==='motion-paused') this.paused=value; }},
      addEventListener(name,fn){listeners.set(item.name + ':' + name,fn);},
      setAttribute(key,value){this.attributes[key]=value;}
    };
    elements.set(name,item);
    return item;
  }
  elem('stage');elem('speed');elem('needle');elem('arc');elem('toggle');
  const doc = {
    hidden:false,
    querySelector(selector){return elements.get(selector.includes('dial-glow') ? 'arc' : 'stage');},
    getElementById(id){return elements.get({
      'auth-drive-speed':'speed','auth-drive-needle':'needle','auth-drive-toggle':'toggle'
    }[id]);},
    addEventListener(name,fn){listeners.set('document:' + name,fn);}
  };
  const win = {
    matchMedia:()=>media,
    requestAnimationFrame(fn){animations.set(++frameId,fn);return frameId;},
    cancelAnimationFrame(id){animations.delete(id);}
  };
  runInNewContext(script,{document:doc,window:win});
  assert.equal(elements.get('speed').textContent,'082');
  assert.equal(animations.size,1);
  const [firstId,first] = animations.entries().next().value;
  animations.delete(firstId);
  first(1000);
  assert.match(elements.get('speed').textContent,/^\d{3}$/);
  assert.match(elements.get('needle').style.transform,/^rotate\(/);
  assert.equal(animations.size,1);
  listeners.get('toggle:click')();
  assert.equal(elements.get('stage').classList.paused,true);
  assert.equal(elements.get('toggle').textContent,'SPUSTIT ANIMACI');
  assert.equal(animations.size,0);
  listeners.get('toggle:click')();
  assert.equal(elements.get('stage').classList.paused,false);
  assert.equal(animations.size,1);
  media.matches=true;
  reducedChange();
  assert.equal(animations.size,0);
  assert.equal(elements.get('toggle').disabled,true);
  assert.equal(elements.get('speed').textContent,'082');
  media.matches=false;
  reducedChange();
  assert.equal(elements.get('toggle').disabled,false);
  assert.equal(animations.size,1);
  doc.hidden=true;
  listeners.get('document:visibilitychange')();
  assert.equal(animations.size,0);
});

test('Netlify and local preview serve both secondary pages', async () => {
  const netlify = await read('netlify.toml');
  const preview = await read('preview.mjs');
  const build = await read('scripts/build-gallery.mjs');
  for (const slug of ['signin','activity']) {
    assert.ok(netlify.includes('from = "/' + slug + '"'));
    assert.ok(preview.includes("['/" + slug + "', '" + slug + "/index.html']"));
    assert.ok(build.includes("join(output, '" + slug + "')"));
  }
  for (const name of ['activity.js','activity-data.json','signin.js','ride-motion.js','auth.css']) {
    assert.ok(build.includes("'" + name + "'"));
  }
});
