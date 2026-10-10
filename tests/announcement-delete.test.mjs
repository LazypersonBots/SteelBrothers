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
