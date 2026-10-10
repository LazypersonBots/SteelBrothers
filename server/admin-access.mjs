import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { ADMIN_EMAILS } from './club-db.mjs';

export const ADMIN_COOKIE_NAME='sb_admin';
export const ADMIN_ACCESS_TTL_MS=20*60*1000;
export const clearAdminCookie='sb_admin=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
const b64=s=>Buffer.from(String(s)).toString('base64url');
const hash=s=>createHash('sha256').update(s).digest();
const hex=s=>createHash('sha256').update(s).digest('hex');
function equals(a,b) {
  const aa=Buffer.from(a),bb=Buffer.from(b);
  return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
export function isVerifiedClubAdmin(member) {
  return !!member && ADMIN_EMAILS.has(member.email) &&
    member.email_verified===true && !!member.verified_at &&
    member.id!=null && Number(member.id)>0 && Number.isSafeInteger(Number(member.id));
}
export function createAdminAccess({password,secret,now=Date.now}={}){
  const configured=typeof password==='string'&&password.length>=12&&
    typeof secret==='string'&&secret.length>=32;
  const sign=value=>createHmac('sha256',secret).update(value).digest('hex');
  const sessionToken=headers=>{
    const match=/(?:^|;\s*)sb_session=([a-zA-Z0-9_-]{30,64})(?:;|$)/.exec(headers||'');
    return match?.[1]||null;
  };
  const getCookie=(headers,name)=>{
    const match=new RegExp('(?:^|;\\s*)'+name+'=([a-zA-Z0-9_.-]+)(?:;|$)').exec(headers||'');
    return match?.[1]||null;
  };
  function verifyPassword(input){
    return configured&&typeof input==='string'&&input.length>=12&&input.length<=256&&
      equals(hash(input),hash(password));
  }
  function grant(member,headers) {
    const session=sessionToken(headers);
    if(!configured||!isVerifiedClubAdmin(member)||!session) return null;
    const exp=now()+ADMIN_ACCESS_TTL_MS;
    const payload=[String(member.id),String(exp),hex(session)].join('.');
    const value=b64(payload)+'.'+sign(payload);
    return ADMIN_COOKIE_NAME+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1200';
  }
  function unlocked(member,headers){
    if(!configured||!isVerifiedClubAdmin(member))return false;
    const session=sessionToken(headers);
    const ticket=getCookie(headers,ADMIN_COOKIE_NAME);
    if(!session||!ticket)return false;
    const dot=ticket.lastIndexOf('.');
    if(dot<0)return false;
    const body=ticket.slice(0,dot),mac=ticket.slice(dot+1);
    if(!/^[A-Za-z0-9_-]{40,300}$/.test(body)||!/^[a-f0-9]{64}$/.test(mac))return false;
    const payload=Buffer.from(body,'base64url').toString('utf8');
    const [id,expiry,bound]=payload.split('.');
    const expires=Number(expiry);
    if(id!==String(member.id)||!Number.isSafeInteger(expires)||expires<=now()||
       expires>now()+ADMIN_ACCESS_TTL_MS||bound!==hex(session))return false;
    return equals(Buffer.from(mac,'hex'),Buffer.from(sign(payload),'hex'));
  }
  return {configured,verifyPassword,grant,unlocked};
}
