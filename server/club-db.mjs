/* Independent Steel Brothers PostgreSQL storage; never uses personal Supabase. */
export const CLUB_ADMINS=new Set(['gamedriverstudio@gmail.com','steel.brothersmed@gmail.com']);
export const verificationLimit=email=>CLUB_ADMINS.has(email)?30:1;

const SCHEMA=[
'CREATE TABLE IF NOT EXISTS club_members (id BIGSERIAL PRIMARY KEY,email TEXT NOT NULL UNIQUE,nickname VARCHAR(32) NOT NULL,password_hash TEXT NOT NULL,verified_at TIMESTAMPTZ,verification_count INTEGER NOT NULL DEFAULT 0 CHECK (verification_count BETWEEN 0 AND 30),email_opt_in BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT now())',
'CREATE TABLE IF NOT EXISTS club_sessions (token_hash TEXT PRIMARY KEY,member_id BIGINT NOT NULL REFERENCES club_members(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL)',
'CREATE INDEX IF NOT EXISTS club_sessions_member ON club_sessions(member_id)',
'CREATE TABLE IF NOT EXISTS club_announcements (id BIGSERIAL PRIMARY KEY,title VARCHAR(120) NOT NULL,body TEXT NOT NULL,author_id BIGINT NOT NULL REFERENCES club_members(id),sent_email BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT now())',
"CREATE TABLE IF NOT EXISTS club_announcement_deliveries (announcement_id BIGINT NOT NULL REFERENCES club_announcements(id) ON DELETE CASCADE, member_id BIGINT NOT NULL REFERENCES club_members(id) ON DELETE CASCADE, status VARCHAR(16) NOT NULL DEFAULT 'claimed', PRIMARY KEY (announcement_id,member_id))"
];
export async function openClubDB(env=process.env,logger=console){
 const url=env.STEELBROTHERS_DATABASE_URL;
 if(!url)return null;
 if(!/^postgres(ql)?:\/\//.test(url)){logger.error('Invalid Steel Brothers database URL');return null;}
 let pool;
 try{
   const {default:pg}=await import('pg');
   pool=new pg.Pool({connectionString:url,max:3,idleTimeoutMillis:30000,connectionTimeoutMillis:8000});
   for(const statement of SCHEMA)await pool.query(statement);
   logger.info('Steel Brothers database: READY');
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
