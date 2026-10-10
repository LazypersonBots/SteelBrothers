(() => {
 const $=id=>document.getElementById(id);
 const bell=$('sb-bell'),backdrop=$('sb-notices'),close=$('sb-notice-close'),items=$('sb-notice-items');
 if(!bell||!backdrop||!close||!items)return;
 let previousFocus=null;
 const el=(tag,content,cls)=>{
   const node=document.createElement(tag);node.textContent=content;
   if(cls)node.className=cls;return node;
 };
 const dateLabel=value=>{
   const d=new Date(value);return Number.isNaN(d.getTime())?''
     :d.toLocaleDateString('cs-CZ',{year:'numeric',month:'long',day:'numeric'});
 };
 async function load(){
   items.replaceChildren(el('p','Načítání klubových aktualit…','sb-notice-empty'));
   try{
     const response=await fetch('/api/announcements',{cache:'no-store'});
     if(!response.ok)throw Error('Temporary error');
     const payload=await response.json();
     if(!payload.available){
       items.replaceChildren(el('p','Klubová oznámení budou brzy dostupná.','sb-notice-empty'));return;
     }
     const announcements=Array.isArray(payload.announcements)?payload.announcements:[];
     items.replaceChildren();
     if(!announcements.length)items.append(el('p','Zatím nejsou žádná oznámení. Sleduj nás!','sb-notice-empty'));
     for(const announcement of announcements){
       const card=document.createElement('article');card.className='sb-notice-item';
       card.append(el('small',dateLabel(announcement.created_at)));
       card.append(el('h3',announcement.title));
       card.append(el('p',announcement.body));
       items.append(card);
     }
     const newest=announcements[0]?.id||0;
     if(newest) {
       try { localStorage.setItem('sb-last-announcement',String(newest)); }
       catch { /* Reading still works if browser storage is disabled. */ }
     }
     const badge=bell.querySelector('.sb-bell-count');
     if(badge){badge.hidden=true;badge.textContent='';}
   }catch {
     items.replaceChildren(el('p','Aktuality se teď nepodařilo načíst. Zkus to později.','sb-notice-empty'));
   }
 }
 function hide(){
   backdrop.hidden=true;
   bell.setAttribute('aria-expanded','false');
   (previousFocus||bell).focus();
 }
 function show(){
   if(!backdrop.hidden)return;
   previousFocus=document.activeElement;
   backdrop.hidden=false;bell.setAttribute('aria-expanded','true');
   close.focus();void load();
 }
 // Indicate announcements newer than the last viewed item without opening the popup.
 async function checkUnread() {
   const badge=bell.querySelector('.sb-bell-count');
   if(!badge)return;
   try{
     const res=await fetch('/api/announcements',{cache:'no-store'});
     if(!res.ok)return;
     const data=await res.json();
     if(!Array.isArray(data.announcements))return;
     let lastRead=0;
     try{lastRead=Number(localStorage.getItem('sb-last-announcement')||0);}
     catch{ return; }
     const unread=data.announcements.filter(item=>Number(item.id)>lastRead).length;
     badge.hidden=unread===0;
     badge.textContent=unread>9?'9+':String(unread);
   }catch { /* An offline badge must not prevent opening the popup. */ }
 }
 void checkUnread();
 bell.addEventListener('click',show);
 close.addEventListener('click',hide);
 backdrop.addEventListener('click',ev=>{if(ev.target===backdrop)hide();});
 document.addEventListener('keydown',ev=>{
   if(backdrop.hidden)return;
   if(ev.key==='Escape'){hide();return;}
   if(ev.key!=='Tab')return;
   const candidates=[...backdrop.querySelectorAll('button:not([disabled]),a[href]')]
     .filter(e=>e.getClientRects().length>0);
   if(candidates.length===0)return;
   const first=candidates[0],last=candidates[candidates.length-1];
   if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}
   else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}
 });
})();