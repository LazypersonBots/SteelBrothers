(() => {
 const $=id=>document.getElementById(id);
 const bell=$('sb-bell'),backdrop=$('sb-notices'),close=$('sb-notice-close');
 const items=$('sb-notice-items'),compose=$('sb-notice-compose');
 const login=$('sb-notice-login'),feedback=$('sb-notice-feedback');
 if(!bell||!backdrop)return;
 let previousFocus=null;
 const text=(tag,content,klass)=>{const el=document.createElement(tag);el.textContent=content;if(klass)el.className=klass;return el;};
 const formatDate=value=>{
   const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('cs-CZ',{year:'numeric',month:'short',day:'numeric'});
 };
 const closePanel=()=>{
   backdrop.hidden=true;bell.setAttribute('aria-expanded','false');
   (previousFocus||bell).focus();
 };
 async function refresh() {
   items.replaceChildren(text('p','Načítání oznámení…'));
   compose.hidden=true;login.hidden=true;
   try{
     const [ann,me]=await Promise.all([
       fetch('/api/announcements',{cache:'no-store'}).then(r=>r.json()),
       fetch('/api/account/me',{cache:'no-store'}).then(r=>r.json())
     ]);
     const announcements=Array.isArray(ann.announcements)?ann.announcements:[];
     items.replaceChildren();
     if(ann.available===false)items.append(text('p','Klubová oznámení budou dostupná po připojení Neon.'));
     else if(!announcements.length)items.append(text('p','Zatím tu nejsou žádná oznámení.'));
     for(const item of announcements) {
       const card=document.createElement('article');card.className='sb-notice-item';
       card.append(text('small',formatDate(item.created_at)));
       card.append(text('h3',item.title));
       card.append(text('p',item.body));
       items.append(card);
     }
     compose.hidden=!(me.member&&me.member.isAdmin&&ann.available!==false);
     login.hidden=!(ann.available&& !me.member);
   }catch{
     items.replaceChildren(text('p','Oznámení se nepodařilo načíst. Zkus to znovu.'));
   }
 }
 const open=()=>{
   if(!backdrop.hidden)return;
   previousFocus=document.activeElement;
   backdrop.hidden=false;bell.setAttribute('aria-expanded','true');
   close.focus();refresh();
 };
 bell.addEventListener('click',open);
 close.addEventListener('click',closePanel);
 backdrop.addEventListener('click',e=>{if(e.target===backdrop)closePanel();});
 document.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&!backdrop.hidden)closePanel();
   if(e.key==='Tab'&&!backdrop.hidden){
     const focusable=[...backdrop.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href]')].filter(x=>x.getClientRects().length);
     if(!focusable.length)return;
     const first=focusable[0],last=focusable[focusable.length-1];
     if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
     else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   }
 });
 compose.addEventListener('submit',async e=>{
   e.preventDefault();if(!compose.reportValidity())return;
   const button=compose.querySelector('button[type=submit]');button.disabled=true;
   feedback.textContent='Publikuji oznámení…';
   try {
     const res=await fetch('/api/announcements',{
       method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
       body:JSON.stringify({
         title:$('sb-notice-subject').value.trim(),
         body:$('sb-notice-message').value.trim(),
         emailEveryone:$('sb-notice-send-email').checked
       })
     });
     const body=await res.json();
     if(!res.ok)throw Error(body.error||'Oznámení se nepodařilo zveřejnit.');
     compose.reset();feedback.textContent=body.emailsQueued
       ?'Oznámení zveřejněno. E-maily přihlášeným odběratelům se zpracovávají.'
       :'Oznámení zveřejněno.';
     await refresh(); // reload keeps the admin compose visible
     feedback.textContent='Oznámení zveřejněno.';
   }catch(err){feedback.textContent=err.message;}
   finally{button.disabled=false;}
 });
})();