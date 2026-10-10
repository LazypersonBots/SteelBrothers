import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('existing homepage and gallery contain new content without replacing the layout',async()=>{
  const home=await read('index.html');
  const gallery=await read('gallery/index.html');
  for(const original of ['class="hero"','class="section about"','class="section rides"',
    'class="section gallery"','class="join section"','id="sb-bell"']){
    assert.ok(home.includes(original),original);
  }
  assert.match(home,/data-club-history/);
  assert.match(home,/data-club-news/);
  assert.match(home,/data-next-event/);
  assert.match(home,/data-merch-list/);
  assert.match(home,/data-public-contact/);
  assert.match(home,/data-memorials[^>]*hidden/);
  assert.match(gallery,/data-gallery-grid="all"/);
  assert.match(gallery,/data-approved-videos/);
  assert.match(gallery,/GALERIE &amp; MEDIA/);
  assert.doesNotMatch(home,/id="buy"|href="\/checkout"/i);
  for(const html of [home,gallery])
    assert.match(html,/<meta name="googlebot" content="noindex, nofollow, noimageindex">/);
});

test('unapproved editorial content defaults to empty and there are no invented events',async()=>{
  const editorial=JSON.parse(await read('club-content.json'));
  const events=JSON.parse(await read('activity-data.json'));
  assert.equal(editorial.history,null);
  assert.deepEqual(editorial.chapters,[]);
  assert.deepEqual(editorial.videos,[]);
  assert.deepEqual(editorial.merch,[]);
  assert.deepEqual(editorial.memorials,[]);
  assert.equal(editorial.contact.email,null);
  assert.equal(editorial.contact.address,null);
  assert.deepEqual(events.activities,[]);
});

test('approved content is safely rendered; unapproved people and unsafe videos are omitted',async()=>{
  const source=await read('club-content.js');
  function node(tag='div'){
    return {tag,children:[],hidden:true,textContent:'',className:'',
      append(...items){this.children.push(...items);},
      replaceChildren(...items){this.children=items;},
      addEventListener(){},getAttribute(){return null;}};
  }
  const history=node(),chapters=node(),contact=node(),memorials=node(),memorialList=node();
  const videos=node(),merch=node(),pending=node(),news=node(),open=node();
  const registry={
    '[data-club-history]':history,'[data-club-chapters]':chapters,
    '[data-public-contact]':contact,'[data-memorials]':memorials,
    '[data-memorial-list]':memorialList,
    '[data-approved-videos]':videos,'[data-merch-list]':merch,
    '[data-merch-pending]':pending,'[data-club-news]':news,
    '[data-open-announcements]':open
  };
  const document={
    querySelector:selector=>registry[selector]||null,
    createElement:tag=>node(tag),
    getElementById:()=>({click(){}})
  };
  const content={
    history:'Schválená historie',
    chapters:['Oficiální chapter'],
    videos:[
      {approved:true,title:'Oficiální video',url:'https://www.youtube.com/watch?v=example'},
      {approved:true,title:'Unsafe',url:'https://youtube.com.evil.example/watch'},
      {approved:false,title:'Unapproved',url:'https://www.youtube.com/watch?v=example'}
    ],
    merch:[{approved:true,title:'Support předmět',description:'Schválený popis'}],
    contact:{email:'contact@example.com',phone:null,address:null,publicClubhouse:null},
    memorials:[
      {approved:true,name:'Schválená vzpomínka',tribute:'Text odsouhlasen klubem'},
      {approved:false,name:'Not approved',tribute:'Not public'}
    ]
  };
  const fetch=async url=>({
    ok:true,json:async()=>url==='/club-content.json'?content:
      {available:true,announcements:[{title:'Oznámení',body:'Novinka klubu'}]}
  });
  runInNewContext(source,{document,fetch,URL,console});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(history.textContent,'Schválená historie');
  assert.equal(chapters.hidden,false);
  assert.equal(chapters.children.length,1);
  assert.equal(contact.children[0].href,'mailto:contact@example.com');
  assert.equal(memorials.hidden,false);
  assert.equal(memorialList.children.length,1);
  assert.equal(memorialList.children[0].children[0].textContent,'Schválená vzpomínka');
  assert.equal(merch.hidden,false);
  assert.equal(merch.children.length,1);
  assert.equal(pending.hidden,true);
  assert.equal(videos.children.length,1);
  assert.equal(videos.children[0].children[1].href,'https://www.youtube.com/watch?v=example');
  assert.equal(news.children[0].children[0].textContent,'Oznámení');
});

test('new assets use current Render/preview routing and existing build, not new services',async()=>{
  const build=await read('scripts/build-gallery.mjs');
  const render=await read('server/render-app.mjs');
  const preview=await read('preview.mjs');
  for(const file of ['club-content.json','club-content.js']){
    for(const source of [build,render,preview])assert.ok(source.includes(file),file);
  }
  assert.match(render,/X-Robots-Tag/);
  assert.match(render,/noindex/);
});
