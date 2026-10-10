import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ADMIN_EMAILS, verificationLimit } from './club-db.mjs';
import { normalizeEmail } from './verification.mjs';

const scrypt=promisify(scryptCb);
const hex=v=>createHash('sha256').update(v).digest('hex');
const secretHmac=(secret,value)=>createHmac('sha256',secret).update(value).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const goodPassword=v=>typeof v==='string' && v.length>=10 && v.length<=128;
const result=(status,data)=>({status,...data});
const fail=(status,error)=>result(status,{error});
const cooldown=60_000;
const otpLife=600_000;
const sessionLife=7*24*60*60*1000;
const cookie=value=>'sb_session='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+Math.floor(sessionLife/1000);
export const clearCookie='sb_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

async function hashPassword(value) {
  const salt=randomBytes(16).toString('hex');
  const hashed=await scrypt(value,salt,64);
  return 'scrypt$'+salt+'$'+hashed.toString('hex');
}
async function passwordMatches(password,saved) {
  const [kind,salt,hash]=typeof saved==='string'?saved.split('$'):[];
  if(kind!=='scrypt'||!(/^[a-f0-9]{32}$/.test(salt||''))||!(/^[a-f0-9]{128}$/.test(hash||'')))return false;
  const candidate=await scrypt(password,salt,64);
  return timingSafeEqual(candidate,Buffer.from(hash,'hex'));
}
const publicMember=member=>member?{
  nickname:member.nickname,email:member.email,emailOptIn:member.email_opt_in,avatarData:member.avatar_data||null,
  isAdmin:ADMIN_EMAILS.has(member.email) && member.email_verified===true && !!member.verified_at
}:null;
const codeHash=(secret,email,nonce,value)=>secretHmac(secret,'otp:'+email+':'+nonce+':'+value);

export function createClubService({db,secret,sendCodeEmail,sendClubEmail,now=Date.now}){
 if(!db||!secret||secret.length<32)throw new Error('Persistent store and strong secret required');
 const date=()=>new Date(now());
 const expires=ms=>new Date(now()+ms);
 const lockEmail=(q,email)=>q('SELECT pg_advisory_xact_lock(hashtext($1))',[email]);
 const findMember=(email)=>db.query('SELECT m.id,m.email,m.nickname,m.email_opt_in,m.password_hash,m.avatar_data,m.verified_at,EXISTS(SELECT 1 FROM sb_email_verifications v WHERE v.email=m.email AND v.verification_count>0) AS email_verified FROM sb_members m WHERE m.email=$1',[email]);

 async function sendCode(address) {
   const email=normalizeEmail(address);
   if(!email)return fail(400,'Zadej platný e-mail.');
   const generated=String(randomInt(0,1000000)).padStart(6,'0'),nonce=token();
   const hashed=codeHash(secret,email,nonce,generated);
   const outcome=await db.transaction(async q=>{
     await lockEmail(q,email);
     const old=(await q('SELECT * FROM sb_email_verifications WHERE email=$1 FOR UPDATE',[email])).rows[0];
     const count=old?.verification_count||0;
     if(count>=verificationLimit(email))return fail(409,'Tento e-mail už dosáhl svého limitu ověření.');
     const existing=(await q('SELECT id FROM sb_members WHERE email=$1',[email])).rows[0];
     if(existing && !ADMIN_EMAILS.has(email))return fail(409,'Tento e-mail už má vytvořený účet.');
     if(old?.sent_at && (now()-new Date(old.sent_at).getTime())<cooldown)
       return fail(429,'Počkej 60 sekund před dalším kódem.');
     await q("INSERT INTO sb_email_verifications(email,nonce,code_hash,sent_at,expires_at,attempts,state,proof_hash,proof_expires_at) VALUES($1,$2,$3,$4,$5,0,'pending',NULL,NULL) ON CONFLICT(email) DO UPDATE SET nonce=$2,code_hash=$3,sent_at=$4,expires_at=$5,attempts=0,state='pending',proof_hash=NULL,proof_expires_at=NULL",
       [email,nonce,hashed,date(),expires(otpLife)]);
     return result(200,{message:'Ověřovací kód odeslán. Platí 10 minut.'});
   });
   if(outcome.status!==200)return outcome;
   try {await sendCodeEmail({email,code:generated});}
   catch(error) {
     await db.query("UPDATE sb_email_verifications SET state='unused',expires_at=now() WHERE email=$1 AND nonce=$2",[email,nonce]).catch(()=>{});
     return fail(502,'E-mail se nepodařilo odeslat. Zkus to později.');
   }
   return outcome;
 }

 async function verifyCode(address,code) {
   const email=normalizeEmail(address);
   if(!email||typeof code!=='string'||!/^\d{6}$/.test(code))return fail(400,'Zadej platný e-mail a 6 číslic.');
   return db.transaction(async q=>{
     await lockEmail(q,email);
     const entry=(await q('SELECT * FROM sb_email_verifications WHERE email=$1 FOR UPDATE',[email])).rows[0];
     if(!entry||entry.state!=='pending'||new Date(entry.expires_at).getTime()<=now())
       return fail(400,'Kód vypršel nebo není platný.');
     if(entry.attempts>=5)return fail(429,'Příliš mnoho pokusů. Vyžádej si nový kód.');
     if(entry.verification_count>=verificationLimit(email))return fail(409,'Limit ověření byl vyčerpán.');
     const predicted=Buffer.from(codeHash(secret,email,entry.nonce,code),'hex');
     const actual=Buffer.from(entry.code_hash,'hex');
     const ok=predicted.length===actual.length && timingSafeEqual(predicted,actual);
     if(!ok){
       await q('UPDATE sb_email_verifications SET attempts=attempts+1 WHERE email=$1',[email]);
       return fail(400,'Nesprávný ověřovací kód.');
     }
     const proof=token();
     await q("UPDATE sb_email_verifications SET state='verified',verification_count=verification_count+1,proof_hash=$2,proof_expires_at=$3,code_hash=NULL WHERE email=$1",
       [email,hex(proof),expires(otpLife)]);
     return result(200,{verified:true,verificationProof:proof,message:'E-mail ověřen.'});
   });
 }

 async function sessionFor(memberId,q=db.query){
   const value=token();
   await q('INSERT INTO sb_sessions(token_hash,member_id,expires_at) VALUES($1,$2,$3)',[hex(value),memberId,expires(sessionLife)]);
   return cookie(value);
 }
 async function register(input) {
   const email=normalizeEmail(input?.email);
   const nickname=typeof input?.nickname==='string'?input.nickname.trim():'';
   if(!email||nickname.length<3||nickname.length>32||!goodPassword(input?.password))
     return fail(400,'Zadej e-mail, přezdívku (3–32 znaků) a heslo (10+ znaků).');
   if(typeof input?.verificationProof!=='string'||input.verificationProof.length<30)
     return fail(403,'Nejdřív ověř e-mail.');
   const hash=await hashPassword(input.password);
   return db.transaction(async q=>{
     await lockEmail(q,email);
     const proof=(await q('SELECT state,proof_hash,proof_expires_at FROM sb_email_verifications WHERE email=$1 FOR UPDATE',[email])).rows[0];
     if(!proof||proof.state!=='verified'||proof.proof_hash!==hex(input.verificationProof)
         ||new Date(proof.proof_expires_at).getTime()<=now())
       return fail(403,'Ověření e-mailu vypršelo. Pošli nový kód.');
     const exists=(await q('SELECT id FROM sb_members WHERE email=$1',[email])).rows[0];
     if(exists)return fail(409,'Tento e-mail už má účet. Přihlas se.');
     const created=(await q('INSERT INTO sb_members(email,nickname,password_hash,email_opt_in) VALUES($1,$2,$3,TRUE) RETURNING id,email,nickname,email_opt_in,avatar_data,verified_at',
       [email,nickname,hash])).rows[0];
     created.email_verified=true;
     await q("UPDATE sb_email_verifications SET state='consumed',proof_hash=NULL WHERE email=$1",[email]);
     const setCookie=await sessionFor(created.id,q);
     return result(201,{member:publicMember(created),setCookie});
   });
 }

 async function login(input) {
   const email=normalizeEmail(input?.email);
   if(!email||typeof input.password!=='string'||input.password.length>128)
     return fail(400,'Neplatné přihlašovací údaje.');
   const row=(await findMember(email)).rows[0];
   const matched=row && await passwordMatches(input.password,row.password_hash);
   if(!matched)return fail(401,'Nesprávný e-mail nebo heslo.');
   return result(200,{member:publicMember(row),setCookie:await sessionFor(row.id)});
 }
 async function current(cookieHeader) {
   const match=/(?:^|;\s*)sb_session=([a-zA-Z0-9_-]{30,64})(?:;|$)/.exec(cookieHeader||'');
   if(!match)return null;
   const response=await db.query('SELECT m.id,m.email,m.nickname,m.email_opt_in,m.avatar_data,m.verified_at,EXISTS(SELECT 1 FROM sb_email_verifications v WHERE v.email=m.email AND v.verification_count>0) AS email_verified FROM sb_sessions s JOIN sb_members m ON m.id=s.member_id WHERE s.token_hash=$1 AND s.expires_at>now()',[hex(match[1])]);
   return response.rows[0]||null;
 }
 async function logout(cookieHeader) {
   const match=/(?:^|;\s*)sb_session=([a-zA-Z0-9_-]{30,64})(?:;|$)/.exec(cookieHeader||'');
   if(match)await db.query('DELETE FROM sb_sessions WHERE token_hash=$1',[hex(match[1])]);
   return result(200,{message:'Odhlášeno.',setCookie:clearCookie});
 }
 async function listAnnouncements(){
   const r=await db.query('SELECT id,title,body,created_at FROM sb_announcements ORDER BY id DESC LIMIT 30');
   return result(200,{announcements:r.rows});
 }
 async function publish(input,member){
   if(!member||!ADMIN_EMAILS.has(member.email)||member.email_verified!==true||!member.verified_at)
     return fail(403,'Oznámení mohou zveřejňovat pouze ověření správci klubu.');
   const title=typeof input?.title==='string'?input.title.trim():'';
   const body=typeof input?.body==='string'?input.body.trim():'';
   if(title.length<4||title.length>120||body.length<5||body.length>3000)
     return fail(400,'Nadpis musí mít 4–120 znaků a zpráva 5–3000 znaků.');
   // Publishing a club update notifies every member whose account setting remains enabled.
   const notify=true;
   const created=await db.transaction(async q=>{
     const item=(await q('INSERT INTO sb_announcements(title,body,author_id) VALUES($1,$2,$3) RETURNING id,title,body,created_at',
       [title,body,member.id])).rows[0];
     if(notify)await q("INSERT INTO sb_announcement_emails(announcement_id,member_id) SELECT $1,id FROM sb_members WHERE email_opt_in=true",
       [item.id]);
     return item;
   });
   return result(201,{announcement:created,emailsQueued:notify});
 }
 async function sendPending(limit=25) {
   let delivered=0;
   for(let i=0;i<limit;i++){
     // Claim a single message with a DB lock. One Render instance is expected.
     const claim=await db.transaction(async q=>{
       const row=(await q("SELECT d.announcement_id,d.member_id,m.email,a.title,a.body FROM sb_announcement_emails d JOIN sb_members m ON m.id=d.member_id JOIN sb_announcements a ON a.id=d.announcement_id WHERE d.status='queued' AND m.email_opt_in=true ORDER BY d.announcement_id,d.member_id LIMIT 1 FOR UPDATE OF d SKIP LOCKED")).rows[0];
       if(row)await q("UPDATE sb_announcement_emails SET status='sending' WHERE announcement_id=$1 AND member_id=$2",[row.announcement_id,row.member_id]);
       return row;
     });
     if(!claim)break;
     try{
       await sendClubEmail({email:claim.email,title:claim.title,body:claim.body,id:claim.announcement_id,memberId:claim.member_id});
       await db.query("UPDATE sb_announcement_emails SET status='sent' WHERE announcement_id=$1 AND member_id=$2",[claim.announcement_id,claim.member_id]);
       delivered++;
     }catch{
       await db.query("UPDATE sb_announcement_emails SET status='queued' WHERE announcement_id=$1 AND member_id=$2",[claim.announcement_id,claim.member_id]);
       break; // Retry later, no busy loop.
     }
   }
   return delivered;
 }
 async function updateAvatar(member,avatarData) {
   if(!member)return fail(401,'Přihlas se.');
   if(avatarData!==null) {
     if(typeof avatarData!=='string'||avatarData.length>85000||
        !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatarData))
       return fail(400,'Profilový obrázek musí být malý obrázek WebP.');
     const binary=Buffer.from(avatarData.slice('data:image/webp;base64,'.length),'base64');
     if(binary.length>60000||binary.length<16||
        binary.toString('ascii',0,4)!=='RIFF'||binary.toString('ascii',8,12)!=='WEBP')
       return fail(400,'Neplatný obrázek.');
   }
   await db.query('UPDATE sb_members SET avatar_data=$1 WHERE id=$2',[avatarData,member.id]);
   return result(200,{avatarData});
 }
 return {sendCode,verifyCode,register,login,current,logout,listAnnouncements,publish,sendPending,updateAvatar};
}
