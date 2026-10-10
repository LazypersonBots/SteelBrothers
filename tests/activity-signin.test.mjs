import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('an empty calendar shows no invented club events', async () => {
  const dataset = JSON.parse(await read('activity-data.json'));
  assert.deepEqual(dataset.activities, []);
  const js = await read('activity.js');
  const root = { dataset:{activityList:'home'}, children:[],
    replaceChildren(...children){this.children=children;} };
  const next = {textContent:''};
  const document = {
    querySelector(selector) {
      return selector==='[data-activity-list]'?root:
        selector==='[data-next-event]'?next:null;
    },
    createElement(tag) {
      return {tag,children:[],textContent:'',append(...children){this.children.push(...children);}};
    }
  };
  runInNewContext(js,{document,fetch:async()=>({ok:true,json:async()=>dataset}),console,Date,Intl});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(root.children.length,1);
  assert.match(root.children[0].textContent,/Zatím nejsou zveřejněné žádné potvrzené akce/);
  assert.match(next.textContent,/BEZ POTVRZENÉHO/);
});

test('calendar displays only approved future public events in nearest-first order', async () => {
  const source = await read('activity.js');
  const event = (title,startsAt) => ({
    title,startsAt,category:'Vyjížďka',description:'Potvrzeno klubem',
    confirmed:true,visibility:'public'
  });
  const mockData = { activities:[
    event('Distant','2099-06-20T10:00:00+02:00'),
    event('Nearest','2099-01-02T10:00:00+01:00'),
    event('Fourth','2099-04-20T10:00:00+02:00'),
    event('Middle','2099-03-20T10:00:00+01:00'),
    {...event('Private','2099-01-01T10:00:00+01:00'),visibility:'members'},
    {...event('Draft','2099-01-01T10:00:00+01:00'),confirmed:false},
    {...event('Past','2020-01-01T10:00:00+01:00')}
  ]};
  const roots=[];
  const script=source;
  for(const mode of ['home','all']){
    const root={dataset:{activityList:mode},children:[],
      replaceChildren(...items){this.children=items;}};
    const document={
      querySelector(selector){return selector==='[data-activity-list]'?root:null;},
      createElement(tag){return {tag,textContent:'',children:[],
        append(...children){this.children.push(...children);}};}
    };
    runInNewContext(script,{document,fetch:async()=>({ok:true,json:async()=>mockData}),console,Date,Intl});
    await new Promise(resolve=>setImmediate(resolve));
    roots.push(root);
  }
  assert.equal(roots[0].children.length,3);
  assert.equal(roots[1].children.length,4);
  assert.deepEqual(roots[0].children.map(c=>c.children[2].textContent),
    ['Nearest','Middle','Fourth']);
});

test('both activity and gallery have working return and navigation links', async () => {
  const home = await read('index.html');
  const activity = await read('activity/index.html');
  const gallery = await read('gallery/index.html');
  assert.match(home,/href="\/activity\/">ZOBRAZIT VŠECHNY AKTIVITY/);
  assert.match(home,/href="\/signin\/">PŘIDAT SE/);
  assert.match(activity,/href="\/"[^>]*>← ZPĚT NA HLAVNÍ STRÁNKU/);
  assert.match(activity,/data-activity-list="all"/);
  assert.match(gallery,/href="\/activity\/">Akce \/ Events/);
});

test('signup and login redirect home and club messages default to on',async()=>{
 const page=await read('signin/index.html'),js=await read('signin.js');
 assert.match(page,/id="email"[^>]+type="email" required/);
 assert.match(page,/id="nickname"[^>]+required/);
 assert.match(page,/id="send-email-code"/);
 assert.match(page,/Vytvořením účtu budeš dostávat klubové e-maily/);
 assert.doesNotMatch(page,/id="account-summary"|id="club-admin"|src="\/club-admin\.js"/);
 assert.match(js,/verificationProof/);
 assert.match(js,/window\.location\.assign\('\/'\)/);
 assert.match(js,/window\.location\.replace\('\/'\)/);
 assert.match(js,/\/api\/account\//);
});
test('three public pages keep publishing in the profile while the bell offers admin-only deletion',async()=>{
 for(const path of ['index.html','gallery/index.html','activity/index.html']){
   const html=await read(path);
   assert.match(html,/src="\/member-profile\.js"/);
   assert.match(html,/href="\/member-profile\.css"/);
   assert.match(html,/id="sb-bell"/);
   assert.doesNotMatch(html,/id="sb-notice-compose"/);
 }
 const profile=await read('member-profile.js');
 const bell=await read('announcements.js');
 assert.match(profile,/sb-member-trigger/);
 assert.match(profile,/sb-profile-settings/);
 assert.match(profile,/sb-admin-unlock-form/);
 assert.match(profile,/\/api\/admin\/unlock/);
 assert.match(profile,/\/api\/account\/avatar/);
 assert.match(profile,/\/api\/account\/preferences/);
 assert.match(profile,/\/api\/account\/logout/);
 assert.match(profile,/\/api\/announcements/);
 assert.match(profile,/user\.isAdmin/);
 assert.doesNotMatch(bell,/\/api\/admin\/unlock|sb-admin-compose/);
 assert.match(bell,/\/api\/announcements\/delete/);
 assert.doesNotMatch(bell,/innerHTML/);
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
  assert.match(js, /\/api\/account\/status/);
  assert.doesNotMatch(js, /supabase/i);
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
  for (const name of ['activity.js','activity-data.json','signin.js','email-verification.js','auth.css','announcements.js','announcements.css','club-admin.js','member-profile.js','member-profile.css','favicon.png']) {
    assert.ok(build.includes("'" + name + "'"));
  }
});
