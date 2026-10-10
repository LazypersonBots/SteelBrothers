import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSteelBrothersServer } from '../server/render-app.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const pagePaths=['index.html','gallery/index.html','activity/index.html','signin/index.html'];

test('all public HTML pages opt out of Google and other search engines',async()=>{
 for(const path of pagePaths){
   const html=await read(path);
   assert.match(html,/<meta name="robots" content="[^"]*noindex[^"]*">/i,path);
   assert.match(html,/<meta name="googlebot" content="[^"]*noindex[^"]*">/i,path);
   assert.match(html,/<meta name="robots" content="[^"]*noimageindex[^"]*">/i,path);
 }
});

test('both hosting environments retain noindex on every resource',async()=>{
 const netlify=await read('_headers');
 const render=await read('server/render-app.mjs');
 const preview=await read('preview.mjs');
 for(const source of [netlify,render,preview]){
   assert.match(source,/X-Robots-Tag/);
   assert.match(source,/noindex, nofollow, noimageindex, nosnippet/);
 }
 assert.match(netlify,/\/\*/);
 const build=await read('scripts/build-gallery.mjs');
 assert.match(build,/['"]robots\.txt['"]/);
 assert.match(render,/\['\/robots\.txt', 'robots\.txt'\]/);
 assert.match(preview,/\['\/robots\.txt', 'robots\.txt'\]/);
});

test('robots policy blocks Google image crawling but never hides page noindex from Googlebot',async()=>{
 const robots=await read('robots.txt');
 assert.match(robots,/User-agent:\s*Googlebot-Image\s*Disallow:\s*\//);
 assert.match(robots,/User-agent:\s*\*\s*Allow:\s*\//);
 assert.doesNotMatch(robots,/User-agent:\s*(?:Googlebot|\*)\s*Disallow:\s*\//i);
 assert.doesNotMatch(robots,/Sitemap:/i);
});

test('Render returns noindex on HTML, photo, JSON and missing resources',async()=>{
 const root=await mkdtemp(join(tmpdir(),'steel-noindex-'));
 const server=null;
 await mkdir(join(root,'gallery'));
 await mkdir(join(root,'activity'));
 await mkdir(join(root,'signin'));
 await mkdir(join(root,'photos'));
 try{
   await writeFile(join(root,'index.html'),'<title>Test</title>');
   await writeFile(join(root,'gallery/index.html'),'<title>Gallery</title>');
   await writeFile(join(root,'activity/index.html'),'<title>Activity</title>');
   await writeFile(join(root,'signin/index.html'),'<title>Sign in</title>');
   await writeFile(join(root,'robots.txt'),await read('robots.txt'));
   await writeFile(join(root,'photos/test.webp'),Buffer.from('fake image for header test'));
   const app=createSteelBrothersServer({env:{},staticRoot:root});
   await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
   try{
     const base='http://127.0.0.1:'+app.address().port;
     for(const path of ['/','/index.html','/gallery/','/activity/','/signin/',
       '/photos/test.webp','/api/account/status','/robots.txt','/nonexistent']){
       const response=await fetch(base+path);
       const header=response.headers.get('x-robots-tag')||'';
       assert.match(header,/noindex/,path);
       assert.match(header,/nofollow/,path);
       assert.match(header,/noimageindex/,path);
     }
     const robots=await fetch(base+'/robots.txt');
     assert.equal(robots.status,200);
     assert.match(robots.headers.get('content-type')||'',/text\/plain/);
     assert.match(await robots.text(),/Googlebot-Image/);
   }finally{
     await new Promise((resolve,reject)=>app.close(e=>e?reject(e):resolve()));
   }
 }finally{
   await rm(root,{recursive:true,force:true});
 }
});
