import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminAccess, isVerifiedClubAdmin, clearAdminCookie } from '../server/admin-access.mjs';

const secret='test-only-long-hmac-secret-must-be-32-bytes';
const correct='special-long-admin-password-for-test';
const member={id:'42',email:'steel.brothersmed@gmail.com',email_verified:true,verified_at:new Date()};
const cookie='sb_session=ABCDEF0123456789abcdefghijklmnopqrstuvwxyz0123456';

test('admin unlock requires strong separately configured password',()=>{
 const bad=createAdminAccess({password:'',secret});
 assert.equal(bad.configured,false);
 assert.equal(bad.verifyPassword('anything'),false);
 const admin=createAdminAccess({password:correct,secret});
 assert.equal(admin.configured,true);
 assert.equal(admin.verifyPassword('bad-password-123'),false);
 assert.equal(admin.verifyPassword(correct),true);
 assert.match(clearAdminCookie,/Max-Age=0/);
});
test('admin eligibility requires allowlisted address and actual verified evidence',()=>{
 assert.equal(isVerifiedClubAdmin(member),true);
 assert.equal(isVerifiedClubAdmin({...member,email:'other@example.com'}),false);
 assert.equal(isVerifiedClubAdmin({...member,email_verified:false}),false);
 assert.equal(isVerifiedClubAdmin({...member,verified_at:null}),false);
 assert.equal(isVerifiedClubAdmin({...member,id:null}),false);
});
test('password grant is bound to verified member, original login session and expiration',()=>{
 let now=10_000_000;
 const admin=createAdminAccess({password:correct,secret,now:()=>now});
 const grant=admin.grant(member,cookie);
 assert.match(grant,/HttpOnly; Secure; SameSite=Lax/);
 const headers=cookie+'; '+grant.split(';')[0];
 assert.equal(admin.unlocked(member,headers),true);
 assert.equal(admin.unlocked(member,cookie),false);
 assert.equal(admin.unlocked({...member,email:'regular@example.com'},headers),false);
 assert.equal(admin.unlocked({...member,id:'43'},headers),false);
 assert.equal(admin.unlocked(member,headers.replace('ABCDEF0123456789', 'XYZXYZ0123456789')),false);
 assert.equal(admin.unlocked(member,headers.replace(/.$/,'A')),false);
 now+=20*60*1000+1;
 assert.equal(admin.unlocked(member,headers),false);
});
