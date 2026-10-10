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

 function showDeleteForm(card,item){
   const old=card.querySelector('.sb-notice-delete-form');
   if(old){old.remove();return;}
   for(const form of items.querySelectorAll('.sb-notice-delete-form'))form.remove();
   const form=document.createElement('form');form.className='sb-notice-delete-form';
   const intro=el('p','Smazat toto oznámení všem? Akci nelze vrátit. Zadej admin heslo.');
   const label=el('label','Heslo administrace');
   const field=document.createElement('input');
   field.type='password';field.required=true;field.minLength=12;field.maxLength=256;field.autocomplete='off';
   label.append(field);
   const actions=document.createElement('div');actions.className='sb-notice-delete-actions';
   const cancel=el('button','ZRUŠIT');cancel.type='button';
   const submit=el('button','SMAZAT VŠEM');submit.type='submit';submit.className='sb-notice-delete-submit';
   const error=el('p','');error.className='sb-notice-delete-error';error.setAttribute('role','alert');
   actions.append(cancel,submit);form.append(intro,label,actions,error);card.append(form);
   cancel.addEventListener('click',()=>form.remove());
   form.addEventListener('submit',async event=>{
     event.preventDefault();if(submit.disabled||!form.reportValidity())return;
     submit.disabled=true;cancel.disabled=true;error.textContent='';
     const password=field.value;field.value='';
     try{
       const response=await fetch('/api/announcements/delete',{
         method:'POST',credentials:'same-origin',cache:'no-store',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({id:String(item.id),password})
       });
       const data=await response.json();
       if(!response.ok)throw Error(data.error||'Smazání se nepodařilo.');
       const scroll=items.scrollTop;
       await load();items.scrollTop=scroll;
     }catch(e){
       error.textContent=e.message||'Smazání se nepodařilo.';
       submit.disabled=false;cancel.disabled=false;field.focus();
     }
   });
   field.focus();
 }
 function deleteIcon(){
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   for(const [name,value] of Object.entries({viewBox:'0 0 24 24',width:'16',height:'16',
     fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round',
     'stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(name,value);
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');
   path.setAttribute('d','M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v6m4-6v6');
   svg.append(path);return svg;
 }
 async function load(){
   items.replaceChildren(el('p','Načítání klubových aktualit…','sb-notice-empty'));
   try{
     const [response,adminResponse]=await Promise.all([
       fetch('/api/announcements',{cache:'no-store'}),
       fetch('/api/admin/status',{credentials:'same-origin',cache:'no-store'}).catch(()=>null)
     ]);
     if(!response.ok)throw Error('Temporary error');
     const payload=await response.json();
     const admin=adminResponse?.ok?await adminResponse.json().catch(()=>null):null;
     const canDelete=admin?.eligible===true;
     if(!payload.available){
       items.replaceChildren(el('p','Klubová oznámení budou brzy dostupná.','sb-notice-empty'));return;
     }
     const announcements=Array.isArray(payload.announcements)?payload.announcements:[];
     items.replaceChildren();
     if(!announcements.length)items.append(el('p','Zatím nejsou žádná oznámení. Sleduj nás!','sb-notice-empty'));
     for(const announcement of announcements){
       const card=document.createElement('article');card.className='sb-notice-item';
       const top=document.createElement('div');top.className='sb-notice-item-top';
       top.append(el('small',dateLabel(announcement.created_at)));
       if(canDelete){
         const remove=el('button','');remove.type='button';remove.className='sb-notice-delete';
         remove.title='Smazat oznámení';
         remove.setAttribute('aria-label','Smazat oznámení: '+announcement.title);
         remove.append(deleteIcon());
         remove.addEventListener('click',()=>showDeleteForm(card,announcement));
         top.append(remove);
       }
       card.append(top);
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