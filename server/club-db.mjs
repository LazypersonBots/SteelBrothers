/* Persistent Steel Brothers data; only dedicated Neon PostgreSQL. */
export const ADMIN_EMAILS=new Set(['gamedriverstudio@gmail.com','steel.brothersmed@gmail.com']);
export const verificationLimit=email=>ADMIN_EMAILS.has(email)?30:1;
const schema=[
"CREATE TABLE IF NOT EXISTS sb_members (id BIGSERIAL PRIMARY KEY,email TEXT NOT NULL UNIQUE,nickname VARCHAR(32) NOT NULL,password_hash TEXT NOT NULL,email_opt_in BOOLEAN NOT NULL DEFAULT FALSE,verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
"CREATE TABLE IF NOT EXISTS sb_email_verifications (email TEXT PRIMARY KEY,code_hash TEXT,nonce TEXT,sent_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,attempts INTEGER NOT NULL DEFAULT 0,verification_count INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'unused',proof_hash TEXT,proof_expires_at TIMESTAMPTZ,CONSTRAINT sb_verification_count CHECK (verification_count BETWEEN 0 AND 30))",
"CREATE TABLE IF NOT EXISTS sb_sessions (token_hash TEXT PRIMARY KEY,member_id BIGINT NOT NULL REFERENCES sb_members(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL)",
"CREATE INDEX IF NOT EXISTS sb_sessions_member ON sb_sessions(member_id)",
"CREATE TABLE IF NOT EXISTS sb_announcements (id BIGSERIAL PRIMARY KEY,title VARCHAR(120) NOT NULL,body TEXT NOT NULL,author_id BIGINT NOT NULL REFERENCES sb_members(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
"CREATE TABLE IF NOT EXISTS sb_announcement_emails (announcement_id BIGINT NOT NULL REFERENCES sb_announcements(id) ON DELETE CASCADE,member_id BIGINT NOT NULL REFERENCES sb_members(id) ON DELETE CASCADE,status VARCHAR(16) NOT NULL DEFAULT 'queued',PRIMARY KEY (announcement_id,member_id))"
];
export async function openClubDatabase(env=process.env, logger=console) {
 const url=env.STEELBROTHERS_DATABASE_URL;
 if(!url)return null;
 if(!/^postgres(?:ql)?:\/\//.test(url)){logger.error('Invalid dedicated database URL');return null;}
 let pool;
 try{
   const {default:pg}=await import('pg');
   pool=new pg.Pool({connectionString:url,max:3,connectionTimeoutMillis:8000,idleTimeoutMillis:30000});
   for(const statement of schema)await pool.query(statement);
   logger.log('Steel Brothers persistent member database: READY');
   return {query:(sql,args)=>pool.query(sql,args),async transaction(fn){
     const client=await pool.connect();
     try{await client.query('BEGIN');const result=await fn((sql,args)=>client.query(sql,args));await client.query('COMMIT');return result;}
     catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
   },close:()=>pool.end()};
 }catch(e){
   logger.error('Steel Brothers database unavailable:',e?.code||e?.name||'unknown');
   if(pool)await pool.end().catch(()=>{});
   return null;
 }
}
