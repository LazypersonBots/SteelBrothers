import test from 'node:test';
import assert from 'node:assert/strict';
import { createClubService } from '../server/club-service.mjs';
import { ADMIN_EMAILS, verificationLimit } from '../server/club-db.mjs';

function memoryDB() {
  const verification=new Map(),members=new Map(),sessions=new Map(),announcements=[];
  let sequence=0;
  async function query(sql,p=[]){
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
    if(sql.startsWith('SELECT * FROM sb_email_verifications'))return {rows:verification.has(p[0])?[{...verification.get(p[0])}]:[]};
    if(sql.startsWith('SELECT state,proof_hash'))return {rows:verification.has(p[0])?[{...verification.get(p[0])}]:[]};
    if(sql.startsWith('SELECT id FROM sb_members'))return {rows:members.has(p[0])?[{id:members.get(p[0]).id}]:[]};
    if(sql.startsWith('SELECT m.id,m.email,m.nickname,m.email_opt_in,m.password_hash')) {
      const row=members.get(p[0]);
      return {rows:row?[{...row,email_verified:(verification.get(row.email)?.verification_count||0)>0}]:[]};
    }
    if(sql.startsWith('INSERT INTO sb_email_verifications')){
      const old=verification.get(p[0]);
      verification.set(p[0],{
        email:p[0],nonce:p[1],code_hash:p[2],sent_at:p[3],expires_at:p[4],
        attempts:0,state:'pending',verification_count:old?.verification_count||0
      });return {rows:[]};
    }
    if(sql.startsWith("UPDATE sb_email_verifications SET state='unused'")){
      Object.assign(verification.get(p[0]),{state:'unused',expires_at:new Date(0)});return {rows:[]};
    }
    if(sql.startsWith('UPDATE sb_email_verifications SET attempts=attempts+1')){
      verification.get(p[0]).attempts++;return {rows:[]};
    }
    if(sql.startsWith("UPDATE sb_email_verifications SET state='verified'")){
      const record=verification.get(p[0]);Object.assign(record,{state:'verified',verification_count:record.verification_count+1,
        proof_hash:p[1],proof_expires_at:p[2],code_hash:null});return {rows:[]};
    }
    if(sql.startsWith("UPDATE sb_email_verifications SET state='consumed'")){
      Object.assign(verification.get(p[0]),{state:'consumed',proof_hash:null});return {rows:[]};
    }
    if(sql.startsWith('INSERT INTO sb_members')){
      const person={id:++sequence,email:p[0],nickname:p[1],password_hash:p[2],email_opt_in:false,verified_at:new Date()};
      members.set(p[0],person);return {rows:[person]};
    }
    if(sql.startsWith('INSERT INTO sb_sessions')){
      sessions.set(p[0],{memberId:p[1],expiresAt:p[2]});return {rows:[]};
    }
    if(sql.startsWith('SELECT m.id,m.email,m.nickname,m.email_opt_in FROM sb_sessions')){
      const session=sessions.get(p[0]);
      const member=[...members.values()].find(x=>x.id===session?.memberId);
      return {rows:member?[{...member,email_verified:(verification.get(member.email)?.verification_count||0)>0}]:[]};
    }
    if(sql.startsWith('DELETE FROM sb_sessions')){sessions.delete(p[0]);return {rows:[]};}
    if(sql.startsWith('INSERT INTO sb_announcements')){
      const item={id:++sequence,title:p[0],body:p[1],author_id:p[2],created_at:new Date()};
      announcements.push(item);return {rows:[item]};
    }
    if(sql.startsWith('SELECT id,title,body,created_at FROM sb_announcements'))return {rows:[...announcements].reverse()};
    if(sql.startsWith('INSERT INTO sb_announcement_emails'))return {rows:[]};
    throw Error('Unmocked query: '+sql.slice(0,95));
  }
  return {query,transaction:fn=>fn(query),verification,members};
}

test('verification limits are based on actual email, not client-supplied role',()=>{
  assert.equal(verificationLimit('normal@example.com'),1);
  assert.equal(verificationLimit('gamedriverstudio@gmail.com'),30);
  assert.equal(verificationLimit('steel.brothersmed@gmail.com'),30);
  assert.equal(verificationLimit('fake.admin@gmail.com'),1);
  assert.deepEqual([...ADMIN_EMAILS].sort(),['gamedriverstudio@gmail.com','steel.brothersmed@gmail.com'].sort());
});

test('ordinary email can verify only once, verified proof can create one real account',async()=>{
  const db=memoryDB(),sent=[];
  let time=1_000_000;
  const service=createClubService({db,secret:'secret-string-with-32-or-more-characters',
    now:()=>time,sendCodeEmail:async({email,code})=>sent.push({email,code}),sendClubEmail:async()=>{}});
  assert.equal((await service.sendCode(' MEMBER@example.com ')).status,200);
  const wrong=await service.verifyCode('member@example.com','000000');
  assert.equal(wrong.status,400);
  const verified=await service.verifyCode('member@example.com',sent[0].code);
  assert.equal(verified.verified,true);
  assert.equal((await service.verifyCode('member@example.com',sent[0].code)).status,400);
  const invalid=await service.register({email:'member@example.com',nickname:'Rider',
    password:'correct-password-123',verificationProof:'unverified'.repeat(4)});
  assert.equal(invalid.status,403);
  const account=await service.register({email:'member@example.com',nickname:'Rider',
    password:'correct-password-123',verificationProof:verified.verificationProof,emailOptIn:true});
  assert.equal(account.status,201);
  assert.equal(account.member.emailOptIn,false);
  assert.match(db.members.get('member@example.com').password_hash,/^scrypt\$/);
  assert.doesNotMatch(db.members.get('member@example.com').password_hash,/correct-password/);
  assert.equal((await service.register({email:'member@example.com',nickname:'Other',
    password:'correct-password-123',verificationProof:verified.verificationProof})).status,403);
  time+=61_000;
  assert.equal((await service.sendCode('member@example.com')).status,409);
  const badLogin=await service.login({email:'member@example.com',password:'wrongwrong'});
  assert.equal(badLogin.status,401);
  const signed=await service.login({email:'member@example.com',password:'correct-password-123'});
  assert.equal(signed.status,200);
  const session=await service.current(signed.setCookie);
  assert.equal(session.email,'member@example.com');
  assert.equal((await service.publish({title:'New ride!',body:'Saturday at noon'},session)).status,403);
  assert.equal((await service.logout(signed.setCookie)).status,200);
  assert.equal(await service.current(signed.setCookie),null);
});

test('the two verified admin emails may reverify 30 times, not 31',async()=>{
  const db=memoryDB(),sent=[];
  let time=0;
  const service=createClubService({db,secret:'really-random-long-signing-key-for-tests',
    now:()=>time,sendCodeEmail:async({code})=>sent.push(code),sendClubEmail:async()=>{}});
  for(let i=0;i<30;i++){
    assert.equal((await service.sendCode('GameDriverStudio@GMAIL.com')).status,200);
    assert.equal((await service.verifyCode('gamedriverstudio@gmail.com',sent.at(-1))).status,200);
    time+=61_000;
  }
  assert.equal(db.verification.get('gamedriverstudio@gmail.com').verification_count,30);
  assert.equal((await service.sendCode('gamedriverstudio@gmail.com')).status,409);
});

test('publishing requires verified admin, not merely an admin email string',async()=>{
  const db=memoryDB(),sent=[];
  const service=createClubService({db,secret:'really-random-long-signing-key-for-tests',
    sendCodeEmail:async({code})=>sent.push(code),sendClubEmail:async()=>{}});
  const forged={id:999,email:'gamedriverstudio@gmail.com'};
  assert.equal((await service.publish({title:'New meeting',body:'Come along',emailEveryone:true},forged)).status,403);
  assert.equal((await service.publish({title:'New meeting',body:'Come along'},null)).status,403);
  const verifiedButNotLoggedIn={id:999,email:'gamedriverstudio@gmail.com',verified_at:new Date(),email_verified:false};
  assert.equal((await service.publish({title:'New meeting',body:'Come along'},verifiedButNotLoggedIn)).status,403);

  assert.equal((await service.sendCode('gamedriverstudio@gmail.com')).status,200);
  const verified=await service.verifyCode('gamedriverstudio@gmail.com',sent[0]);
  assert.equal(verified.status,200);
  const registered=await service.register({
    email:'gamedriverstudio@gmail.com',nickname:'ClubAdmin',
    password:'correct-password-123',verificationProof:verified.verificationProof
  });
  assert.equal(registered.status,201);
  assert.equal(registered.member.isAdmin,true);
  const member=await service.current(registered.setCookie);
  assert.equal(member.email_verified,true);
  assert.equal((await service.publish({title:'New meeting',body:'Come along',emailEveryone:true},member)).status,201);
  assert.equal((await service.publish({title:'New meeting',body:'Come along'},{
    ...member,email:'other@example.com'
  })).status,403);
  assert.equal((await service.logout(registered.setCookie)).status,200);
  assert.equal(await service.current(registered.setCookie),null);
  const all=await service.listAnnouncements();
  assert.equal(all.announcements.length,1);
});
