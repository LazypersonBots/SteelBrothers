import test from 'node:test';
import assert from 'node:assert/strict';
import { createClubService } from '../server/club-service.mjs';

test('deleting an announcement affects shared database and rejects unauthorized accounts',async()=>{
 const announcements=new Map([['1',{id:'1',title:'Ride',body:'Meet outside'}]]);
 const deleted=[];
 const db={query:async(sql,params=[])=>{
   if(sql.startsWith('DELETE FROM sb_announcements WHERE id=$1 RETURNING id')){
     deleted.push(params[0]);
     const row=announcements.get(params[0]);
     announcements.delete(params[0]);
     return {rows:row?[row]:[]};
   }
   if(sql.startsWith('SELECT id,title,body,created_at FROM sb_announcements'))
     return {rows:[...announcements.values()]};
   throw Error('Unexpected query');
 }};
 const service=createClubService({db,secret:'long-test-only-signing-secret-1234567890',
   sendCodeEmail:async()=>{},sendClubEmail:async()=>{}});
 const owner={id:2,email:'steel.brothersmed@gmail.com',email_verified:true,verified_at:new Date()};
 assert.equal((await service.deleteAnnouncement('1',{...owner,email:'other@example.com'})).status,403);
 assert.equal((await service.deleteAnnouncement('1',{...owner,email_verified:false})).status,403);
 assert.equal((await service.deleteAnnouncement('invalid',owner)).status,400);
 assert.equal(deleted.length,0);
 assert.equal((await service.deleteAnnouncement('1',owner)).status,200);
 assert.deepEqual(deleted,['1']);
 assert.deepEqual((await service.listAnnouncements()).announcements,[]);
 assert.equal((await service.deleteAnnouncement('1',owner)).status,404);
});

test('Render route requires a fresh admin password and a permitted origin',async()=>{
 const {createSteelBrothersServer}=await import('../server/render-app.mjs');
 let deletes=0;
 const db={query:async sql=>{
   if(sql.startsWith('SELECT m.id,m.email,m.nickname,m.email_opt_in,m.avatar_data,m.verified_at,EXISTS'))
     return {rows:[{id:2,email:'steel.brothersmed@gmail.com',email_verified:true,verified_at:new Date()}]};
   if(sql.startsWith('DELETE FROM sb_announcements WHERE id=$1 RETURNING id')){
     deletes++;return {rows:[{id:'1'}]};
   }
   throw Error('Unexpected SQL: '+sql);
 }};
 const env={RENDER:'true',IS_PULL_REQUEST:'false',
   RENDER_EXTERNAL_URL:'https://steelbrothers.onrender.com',
   RESEND_API_KEY:'re_TEST',
   STEELBROTHERS_VERIFICATION_SECRET:'a-long-only-for-tests-signing-value-1234',
   STEELBROTHERS_ADMIN_PASSWORD:'correct-admin-password-for-test'};
 const server=createSteelBrothersServer({db,env});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
   const base='http://127.0.0.1:'+server.address().port;
   const send=(password,origin='https://steelbrothers.onrender.com')=>
     fetch(base+'/api/announcements/delete',{method:'POST',
       headers:{'Content-Type':'application/json',Origin:origin,Cookie:'sb_session='+'A'.repeat(43)},
       body:JSON.stringify({id:'1',password})});
   assert.equal((await send('correct-admin-password-for-test','https://attacker.example')).status,403);
   assert.equal((await send('wrong-admin-password-for-test')).status,403);
   assert.equal((await send(null)).status,403);
   assert.equal(deletes,0);
   assert.equal((await send('correct-admin-password-for-test')).status,200);
   assert.equal(deletes,1);
   assert.equal((await send(null)).status,403);
   assert.equal(deletes,1);
 }finally{
   await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 }
});
