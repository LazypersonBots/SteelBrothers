import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEmailVerification, readyForVerification, readEmailPayload, apiResponse } from './verification.mjs';
import { renderVerificationEmail } from './email-template.mjs';
import { createVerificationMemoryStore } from './render-memory-store.mjs';
import { createClubService } from './club-service.mjs';
import { ADMIN_EMAILS } from './club-db.mjs';
import { createAdminAccess, clearAdminCookie, isVerifiedClubAdmin } from './admin-access.mjs';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const routes = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'],
  ['/announcements.js', 'announcements.js'], ['/announcements.css', 'announcements.css'],
  ['/member-profile.js','member-profile.js'],['/member-profile.css','member-profile.css'],
  ['/club-admin.js', 'club-admin.js'],
  ['/gallery', 'gallery/index.html'], ['/gallery/', 'gallery/index.html'],
  ['/gallery/index.html', 'gallery/index.html'],
  ['/activity', 'activity/index.html'], ['/activity/', 'activity/index.html'],
  ['/activity/index.html', 'activity/index.html'],
  ['/signin', 'signin/index.html'], ['/signin/', 'signin/index.html'],
  ['/signin/index.html', 'signin/index.html'],
  ['/gallery-data.json', 'gallery-data.json'],
  ['/activity-data.json', 'activity-data.json'],
  ['/gallery.js', 'gallery.js'], ['/activity.js', 'activity.js'],
  ['/signin.js', 'signin.js'], ['/email-verification.js', 'email-verification.js'],
  ['/styles.css', 'styles.css'], ['/auth.css', 'auth.css'],
  ['/steel-brothers-logo.avif', 'steel-brothers-logo.avif'],
  ['/favicon.png', 'favicon.png'], ['/robots.txt', 'robots.txt']
]);
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.avif', 'image/avif'], ['.gif', 'image/gif']
]);

function makeRateLimiter(now = Date.now) {
  const records = new Map();
  return (key, limit, intervalMs) => {
    const stamp = now();
    const entry = records.get(key);
    if (records.size > 5000) {
      for (const [id, previous] of records) {
        if (stamp >= previous.reset) records.delete(id);
      }
      if (records.size > 5000) records.delete(records.keys().next().value);
    }
    if (!entry || stamp >= entry.reset) {
      records.set(key, { n:1, reset:stamp + intervalMs });
      return false;
    }
    entry.n += 1;
    return entry.n > limit;
  };
}

async function toWebRequest(req, url, maxBytes = 8192) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new Request(url, {
    method:req.method,
    headers:req.headers,
    body:Buffer.concat(chunks)
  });
  server.clubService=clubService;
  return server;
}

async function sendHttpResponse(res, webResponse) {
  res.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
  res.end(Buffer.from(await webResponse.arrayBuffer()));
}

export function createSteelBrothersServer({
  env = process.env,
  fetchEmail = fetch,
  store = createVerificationMemoryStore(),
  staticRoot = dist,
  db = null,
  now = Date.now,
  log = console
} = {}) {
  const siteRoot = resolve(staticRoot);
  const isRender = env.RENDER === 'true' && env.IS_PULL_REQUEST !== 'true';
  const allowedOrigins = ['https://steelbrothers.cz', 'https://www.steelbrothers.cz'];
  if (isRender && typeof env.RENDER_EXTERNAL_URL === 'string' &&
      /^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(env.RENDER_EXTERNAL_URL)) {
    allowedOrigins.push(env.RENDER_EXTERNAL_URL);
  }
  const ready = () => isRender &&
    readyForVerification({ ...env, CONTEXT:'production' });
  const rateLimit = makeRateLimiter(now);
  const sendEmail = async ({ email, code, id }) => {
    const rendered = renderVerificationEmail(code);
    const response = await fetchEmail('https://api.resend.com/emails', {
      method:'POST',
      headers: {
        Authorization:'Bearer ' + env.RESEND_API_KEY,
        'Content-Type':'application/json',
        'Idempotency-Key':'steelbrothers-otp-' + id
      },
      body:JSON.stringify({
        from:'Steel Brothers <verification@steelbrothers.cz>',
        to:[email],
        subject:'Steel Brothers — Ověřovací kód',
        html:rendered.html,
        text:rendered.text
      }),
      signal:AbortSignal.timeout(12_000)
    });
    if (!response.ok) {
      log.error('Verification provider rejected request', response.status);
      throw new Error('Email provider declined request');
    }
  };

  const codeService = ready()
    ? makeEmailVerification({
        store, secret:env.STEELBROTHERS_VERIFICATION_SECRET, sendEmail, now
      })
    : null;

  const clubService=codeService && db ? createClubService({
    db,
    secret:env.STEELBROTHERS_VERIFICATION_SECRET,
    now,
    sendCodeEmail:({email,code})=>sendEmail({email,code,id:'club-'+Date.now()+'-'+Math.random()}),
    async sendClubEmail({email,title,body,id,memberId}) {
      const escape=value=>String(value).replace(/[&<>"']/g,c=>({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
      })[c]);
      const safeTitle=escape(title),safeBody=escape(body).replace(/\n/g,'<br>');
      const response=await fetchEmail('https://api.resend.com/emails',{
        method:'POST',
        headers:{
          Authorization:'Bearer '+env.RESEND_API_KEY,
          'Content-Type':'application/json',
          'Idempotency-Key':'sb-ann-'+id+'-'+memberId
        },
        body:JSON.stringify({
          from:'Steel Brothers <verification@steelbrothers.cz>',
          to:[email],
          subject:'Steel Brothers — '+title,
          html:'<div style="background:#151515;color:#f1e9e0;padding:26px;font-family:Arial,sans-serif"><h2 style="color:#f46b35">STEEL BROTHERS</h2><h3>'+safeTitle+'</h3><p>'+safeBody+'</p><p style="color:#aaa;font-size:12px">Klubová oznámení · Pro vypnutí e-mailů otevři svůj profil na steelbrothers.cz.</p></div>',
          text:'STEEL BROTHERS\n'+title+'\n\n'+body+'\n\nOznámení z klubu Steel Brothers. Přepnutí odběru najdeš po přihlášení.'
        }),
        signal:AbortSignal.timeout(12000)
      });
      if(!response.ok)throw Error('Club email provider error: '+response.status);
    }
  }):null;
  const adminAccess=createAdminAccess({password:env.STEELBROTHERS_ADMIN_PASSWORD,secret:env.STEELBROTHERS_VERIFICATION_SECRET,now});
  const server=createServer(async (req, res) => {
    res.setHeader('X-Robots-Tag','noindex, nofollow, noimageindex, nosnippet');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      res.writeHead(400);res.end('Invalid URL');return;
    }

    if (url.pathname === '/health') {
      res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store'});
      res.end('ok');return;
    }

    if (url.pathname === '/api/email/send' || url.pathname === '/api/email/verify') {
      const isSend = url.pathname === '/api/email/send';
      if (isSend && req.method === 'GET') {
        await sendHttpResponse(res, apiResponse(200, { available:!!codeService, accountCreation:!!clubService }));
        return;
      }
      if (req.method !== 'POST') {
        await sendHttpResponse(res, apiResponse(405, { error:'Method not allowed' }));
        return;
      }
      if (!codeService) {
        await sendHttpResponse(res, apiResponse(503, { error:'Ověřování e-mailů není nakonfigurováno.' }));
        return;
      }
      // Render supplies x-forwarded-for. Use first IP only as a coarse abuse-control,
      // without placing PII into log files.
      const address = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
        .toString().split(',')[0].trim().slice(0,70);
      const limit = isSend ? 6 : 20;
      if (rateLimit((isSend?'send:':'verify:') + address, limit, 60_000)) {
        await sendHttpResponse(res, apiResponse(429, { error:'Příliš mnoho požadavků. Zkus to později.' }));
        return;
      }
      try {
        const request = await toWebRequest(req, 'https://steelbrothers.cz' + url.pathname);
        const { data, error } = await readEmailPayload(request, isSend ? ['email'] : ['email','code'], allowedOrigins);
        if (error) { await sendHttpResponse(res,error);return; }
        const result = clubService
          ? (isSend ? await clubService.sendCode(data.email) : await clubService.verifyCode(data.email,data.code))
          : (isSend ? await codeService.send(data.email) : await codeService.verify(data.email,data.code));
        await sendHttpResponse(res, apiResponse(result.status, result.status === 200
          ? { message:result.message, ...(result.verified ? { verified:true, ...(result.verificationProof ? {verificationProof:result.verificationProof} : {}) } : {}) }
          : { error:result.message }));
      } catch (err) {
        log.error('Email verification endpoint error:', err?.name || 'unknown');
        await sendHttpResponse(res, apiResponse(err?.status === 413 ? 413 : 503, {
          error:err?.status === 413 ? 'Request too large' : 'Ověřování je dočasně nedostupné.'
        }));
      }
      return;
    }

    if(url.pathname==='/api/admin/status' && req.method==='GET') {
      try {
        const member=clubService?await clubService.current(req.headers.cookie):null;
        await sendHttpResponse(res,apiResponse(200,{
          eligible:isVerifiedClubAdmin(member),
          passwordConfigured:adminAccess.configured,
          unlocked:adminAccess.unlocked(member,req.headers.cookie)
        }));
      }catch{await sendHttpResponse(res,apiResponse(503,{error:'Kontrola přístupu není dostupná.'}));}
      return;
    }
    if(url.pathname==='/api/admin/unlock' || url.pathname==='/api/admin/lock'){
      if(req.method!=='POST'){await sendHttpResponse(res,apiResponse(405,{error:'Method not allowed'}));return;}
      try{
        const member=clubService?await clubService.current(req.headers.cookie):null;
        if(!isVerifiedClubAdmin(member)){
          await sendHttpResponse(res,apiResponse(403,{error:'Přístup pouze pro ověřené správce klubu.'}));return;
        }
        if(url.pathname==='/api/admin/lock'){
          const output=apiResponse(200,{unlocked:false});
          output.headers.set('Set-Cookie',clearAdminCookie);
          await sendHttpResponse(res,output);return;
        }
        if(!adminAccess.configured){
          await sendHttpResponse(res,apiResponse(503,{error:'Heslo administrace není nastavené na serveru.'}));return;
        }
        const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').toString().split(',')[0].trim().slice(0,70);
        if(rateLimit('admin-unlock:'+ip,5,15*60_000)){
          await sendHttpResponse(res,apiResponse(429,{error:'Příliš mnoho pokusů. Zkus to za 15 minut.'}));return;
        }
        const request=await toWebRequest(req,'https://steelbrothers.cz'+url.pathname,url.pathname==='/api/account/avatar'?105000:8192);
        const {data,error}=await readEmailPayload(request,['password'],allowedOrigins);
        if(error){await sendHttpResponse(res,error);return;}
        if(!adminAccess.verifyPassword(data.password)){
          await sendHttpResponse(res,apiResponse(403,{error:'Nesprávné heslo administrace.'}));return;
        }
        const cookie=adminAccess.grant(member,req.headers.cookie);
        if(!cookie){await sendHttpResponse(res,apiResponse(403,{error:'Přihlášení vypršelo.'}));return;}
        const output=apiResponse(200,{unlocked:true});
        output.headers.set('Set-Cookie',cookie);
        await sendHttpResponse(res,output);
      }catch(e){
        log.error('Admin unlock error:',e?.name||'unknown');
        await sendHttpResponse(res,apiResponse(503,{error:'Správa účtu není dostupná.'}));
      }
      return;
    }

    if(url.pathname==='/api/account/status' && req.method==='GET') {
      await sendHttpResponse(res,apiResponse(200,{available:!!clubService}));return;
    }
    if(url.pathname==='/api/account/me' && req.method==='GET') {
      const member=clubService?await clubService.current(req.headers.cookie):null;
      await sendHttpResponse(res,apiResponse(200,{member:member?{
        email:member.email,nickname:member.nickname,emailOptIn:member.email_opt_in,avatarData:member.avatar_data||null,
        isAdmin:isVerifiedClubAdmin(member)
      }:null}));return;
    }
    if(url.pathname==='/api/announcements/delete'){
      if(req.method!=='POST'){
        await sendHttpResponse(res,apiResponse(405,{error:'Method not allowed'}));return;
      }
      if(!clubService){
        await sendHttpResponse(res,apiResponse(503,{error:'Oznámení nejsou dostupná.'}));return;
      }
      try{
        const member=await clubService.current(req.headers.cookie);
        if(!isVerifiedClubAdmin(member)){
          await sendHttpResponse(res,apiResponse(403,{error:'Přístup pouze pro ověřené správce klubu.'}));return;
        }
        if(!adminAccess.configured){
          await sendHttpResponse(res,apiResponse(503,{error:'Heslo administrace není nastavené na serveru.'}));return;
        }
        const request=await toWebRequest(req,'https://steelbrothers.cz'+url.pathname,2048);
        const {data,error}=await readEmailPayload(request,['id','password'],allowedOrigins);
        if(error){await sendHttpResponse(res,error);return;}
        // Deletion needs the actual password each time, not an unlocked admin cookie.
        if(!adminAccess.verifyPassword(data.password)){
          const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').toString().split(',')[0].trim().slice(0,70);
          const limited=rateLimit('admin-delete:'+member.id+':'+ip,5,15*60_000);
          await sendHttpResponse(res,apiResponse(limited?429:403,{error:limited
            ?'Příliš mnoho pokusů. Zkus to za 15 minut.':'Nesprávné heslo administrace.'}));return;
        }
        const action=await clubService.deleteAnnouncement(data.id,member);
        const {status,...body}=action;
        await sendHttpResponse(res,apiResponse(status,body));
      }catch(e){
        log.error('Announcement deletion failed:',e?.code||e?.name||'unknown');
        await sendHttpResponse(res,apiResponse(e?.status===413?413:503,{error:'Smazání se nepodařilo. Zkus to později.'}));
      }
      return;
    }
    if(url.pathname==='/api/announcements' && req.method==='GET') {
      try {
        await sendHttpResponse(res,apiResponse(200,clubService
          ? { ...(await clubService.listAnnouncements()),available:true }
          : {announcements:[],available:false}));
      } catch { await sendHttpResponse(res,apiResponse(503,{error:'Oznámení nejsou dostupná.'})); }
      return;
    }
    if(['/api/account/register','/api/account/login','/api/account/logout','/api/account/preferences','/api/account/avatar','/api/announcements'].includes(url.pathname)) {
      if(req.method!=='POST'){await sendHttpResponse(res,apiResponse(405,{error:'Method not allowed'}));return;}
      if(!clubService){await sendHttpResponse(res,apiResponse(503,{error:'Účty čekají na připojení databáze Neon.'}));return;}
      const address=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').toString().split(',')[0].trim().slice(0,70);
      const frequency=url.pathname==='/api/account/login'?10:5;
      if(rateLimit('members:'+url.pathname+':'+address,frequency,60_000)){
        await sendHttpResponse(res,apiResponse(429,{error:'Počkej chvíli a zkus to znovu.'}));return;
      }
      try{
        const request=await toWebRequest(req,'https://steelbrothers.cz'+url.pathname,url.pathname==='/api/account/avatar'?105000:8192);
        const fields=url.pathname.endsWith('/register')?['email','nickname','password','verificationProof']
          :url.pathname.endsWith('/login')?['email','password']
          :url.pathname.endsWith('/preferences')?['emailOptIn']
          :url.pathname.endsWith('/avatar')?['avatarData']
          :url.pathname==='/api/announcements'?['title','body','emailEveryone']:[];
        const {data,error}=await readEmailPayload(request,fields,allowedOrigins,
          url.pathname==='/api/announcements'?8192:url.pathname==='/api/account/avatar'?105000:2048);
        if(error){await sendHttpResponse(res,error);return;}
        const member=await clubService.current(req.headers.cookie);
        let action;
        if(url.pathname.endsWith('/register'))action=await clubService.register(data);
        else if(url.pathname.endsWith('/login'))action=await clubService.login(data);
        else if(url.pathname.endsWith('/logout'))action=await clubService.logout(req.headers.cookie);
        else if(url.pathname.endsWith('/preferences')){
          if(!member)action={status:401,error:'Přihlas se.'};
          else if(typeof data.emailOptIn!=='boolean')action={status:400,error:'Neplatná volba.'};
          else {
            await db.query('UPDATE sb_members SET email_opt_in=$1 WHERE id=$2',[data.emailOptIn,member.id]);
            if(!data.emailOptIn)await db.query("UPDATE sb_announcement_emails SET status='cancelled' WHERE member_id=$1 AND status='queued'",[member.id]);
            action={status:200,message:'Nastavení uloženo.'};
          }
        } else if(url.pathname.endsWith('/avatar'))action=await clubService.updateAvatar(member,data.avatarData);
        else action=adminAccess.unlocked(member,req.headers.cookie)
          ? await clubService.publish(data,member)
          : {status:403,error:'Pro zveřejnění otevři profil a odemkni administraci heslem.'};
        const {setCookie,status,...body}=action;
        const response=apiResponse(status,body);
        if(setCookie)response.headers.set('Set-Cookie',setCookie);
        if(url.pathname==='/api/account/logout')response.headers.append('Set-Cookie',clearAdminCookie);
        await sendHttpResponse(res,response);
        if(status===201&&url.pathname==='/api/announcements'&&action.emailsQueued){
          setImmediate(()=>clubService.sendPending(25).catch(()=>{}));
        }
      } catch(e) {
        log.error('Steel Brothers account request failed:',e?.code||e?.name||'unknown');
        await sendHttpResponse(res,apiResponse(e?.status===413?413:503,{error:'Služba je dočasně nedostupná.'}));
      }
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);res.end('Method not allowed');return;
    }
    let pathname;
    try {pathname = decodeURIComponent(url.pathname);} catch {
      res.writeHead(400);res.end('Invalid URL');return;
    }
    const file = routes.get(pathname) ||
      (pathname.startsWith('/photos/') && MIME.has(extname(pathname).toLowerCase())
        ? pathname.slice(1) : null);
    if (!file) {res.writeHead(404);res.end('Not found');return;}
    const target = resolve(siteRoot, file);
    const within = relative(siteRoot, target);
    if (!within || within === '..' || within.startsWith('..' + sep) || within.startsWith(sep)) {
      res.writeHead(403);res.end('Forbidden');return;
    }
    try {
      const data = await readFile(target);
      res.writeHead(200, {
        'Content-Type':MIME.get(extname(target).toLowerCase()) || 'application/octet-stream',
        'Cache-Control':'no-cache'
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404);res.end('Not found');
    }
  });
  server.clubService=clubService;
  return server;
}
