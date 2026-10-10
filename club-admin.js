/* Admin tools live on the authenticated account page, never in the bell. */
(() => {
 const $=id=>document.getElementById(id);
 const panel=$('club-admin'), form=$('club-admin-compose'),status=$('club-admin-status');
 const button=$('club-admin-submit');
 if(!panel||!form||!button||!status)return;
 let sending=false;
 const show=(message,kind='info')=>{
   status.textContent=message;
   status.dataset.status=kind;
 };
 async function verifyAdmin() {
   try{
     const response=await fetch('/api/account/me',{cache:'no-store',credentials:'same-origin'});
     if(!response.ok)throw Error('Login check failed');
     const member=(await response.json()).member;
     panel.hidden=!(member?.isAdmin===true);
   }catch{ panel.hidden=true; }
 }
 form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(sending||!form.reportValidity())return;
   const title=$('club-admin-title').value.trim();
   const body=$('club-admin-message').value.trim();
   if(title.length<4||body.length<5) {show('Zkontroluj nadpis a text oznámení.','error');return;}
   const emailEveryone=$('club-admin-email').checked;
   if(emailEveryone&&!window.confirm('Odeslat oznámení také e-mailem členům, kteří mají e-maily zapnuté?'))return;
   sending=true;button.disabled=true;show('Zveřejňuji oznámení…');
   try{
     const res=await fetch('/api/announcements',{
       method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'Content-Type':'application/json'},
       body:JSON.stringify({title,body,emailEveryone})
     });
     const data=await res.json();
     if(!res.ok)throw Error(data.error||'Oznámení se nepodařilo zveřejnit.');
     form.reset();
     show(emailEveryone
       ?'Hotovo! Oznámení je zveřejněné, e-maily se odesílají přihlášeným odběratelům.'
       :'Hotovo! Oznámení je zveřejněné pod zvonečkem.','success');
   }catch(err){show(err.message||'Zveřejnění se nepodařilo.','error');}
   finally{sending=false;button.disabled=false;}
 });
 document.addEventListener('sb:member-ready',event=>{
   if(event.detail?.admin===true) void verifyAdmin();
   else panel.hidden=true;
 });
 void verifyAdmin();
})();