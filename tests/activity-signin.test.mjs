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

test('all four pages use the official PNG favicon, never SB letter artwork', async () => {
  const pages = ['index.html', 'gallery/index.html', 'activity/index.html', 'signin/index.html'];
  for (const path of pages) {
    const html = await read(path);
    assert.match(html, /<link rel="icon" href="\/favicon\.png" type="image\/png" sizes="64x64">/);
    assert.doesNotMatch(html, /data:image\/svg\+xml|%3ESB%3C/);
  }
});

test('sign-in design has the official crest, clear hierarchy, and restrained CSS motion', async () => {
  const html = await read('signin/index.html');
  const css = await read('auth.css');
  const js = await read('signin.js');
  assert.match(html, /class="auth-story"/);
  assert.match(html, /class="auth-story-crest"/);
  assert.match(html, /src="\/steel-brothers-logo\.avif"/);
  assert.match(html, /class="auth-story-diagonal"/);
  assert.match(html, /class="auth-story-motion"/);
  assert.match(html, /JEDNA CESTA\./);
  assert.match(html, /JEDNA PARTA\./);
  assert.match(css, /@keyframes auth-story-float/);
  assert.match(css, /@keyframes auth-story-speed/);
  assert.match(css, /@keyframes auth-story-enter/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.auth-story-motion i\{opacity:0!important\}/);
  assert.doesNotMatch(html, /ride-motion\.js|auth-drive-road|auth-drive-dial|auth-simple-panel|auth-ride-bike/);
  assert.doesNotMatch(css, /auth-drive-road|auth-drive-dial|auth-simple-slide|auth-ride-bike/);
  assert.doesNotMatch(js, /fetch\s*\(|supabase/i);
});

test('sign-in and other pages retain the official Steel Brothers favicon', async () => {
  for (const path of ['index.html','activity/index.html','gallery/index.html','signin/index.html']) {
    const html = await read(path);
    assert.match(html, /<link rel="icon" href="\/favicon\.png" type="image\/png"/);
    assert.doesNotMatch(html, /data:image\/svg\+xml/);
  }
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
  for (const name of ['activity.js','activity-data.json','signin.js','auth.css','favicon.png']) {
    assert.ok(build.includes("'" + name + "'"));
  }
});
