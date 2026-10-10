(() => {
 const header=document.querySelector('.header');
 if(!header)return;
 const mount=document.createElement('div');mount.className='sb-member-slot';
 mount.innerHTML=[
 "<button id='sb-member-trigger' type='button' class='sb-member-trigger' aria-expanded='false' aria-haspopup='dialog' hidden><span class='sb-avatar sb-trigger-avatar'></span><span class='sb-trigger-name'></span><span aria-hidden='true'>▾</span></button>",
 "<section id='sb-profile-popover' class='sb-profile-popover' role='dialog' aria-label='Můj profil' hidden>",
 "<div class='sb-profile-top'><span class='sb-avatar sb-profile-avatar'></span><div><strong class='sb-profile-nickname'></strong><span class='sb-profile-email'></span></div><button type='button' id='sb-profile-close' aria-label='Zavřít'>×</button></div>",
 "<div class='sb-profile-tabs'><button type='button' data-panel='profile' aria-pressed='true'>PROFIL</button><button type='button' data-panel='settings' aria-pressed='false'>NASTAVENÍ</button><button type='button' data-panel='admin' aria-pressed='false' hidden>ADMIN</button></div>",
 "<div id='sb-profile-profile' class='sb-profile-body'><p>Vítej v klubu Steel Brothers!</p><p>Svou fotku a klubové e-maily změníš v nastavení.</p></div>",
 "<div id='sb-profile-settings' class='sb-profile-body' hidden><h3>Nastavení profilu</h3><label for='sb-avatar-upload'>Změnit profilovou fotku</label><input id='sb-avatar-upload' type='file' accept='image/png,image/jpeg,image/webp'><button id='sb-avatar-remove' class='sb-profile-secondary' type='button'>ODEBRAT FOTKU</button><hr><p>Klubové e-maily (po registraci zapnuté)</p><p class='sb-profile-muted'>Můžeš je kdykoli vypnout. Členství ti zůstane.</p><button type='button' class='sb-profile-secondary' id='sb-email-toggle'></button></div>",
 "<div id='sb-profile-admin' class='sb-profile-body' hidden><h3>Administrace klubu</h3><div id='sb-admin-locked'><p class='sb-profile-muted'>Pro vstup do administrace zadej samostatné heslo.</p><form id='sb-admin-unlock-form'><label for='sb-admin-password'>Heslo administrace</label><input id='sb-admin-password' type='password' required minlength='12' autocomplete='off' placeholder='Admin heslo'><button class='sb-profile-primary' type='submit'>ODEMKNOUT ADMIN →</button></form></div><div id='sb-admin-unlocked' hidden><div class='sb-admin-ready'>✓ ODEMČENO <button id='sb-admin-lock' type='button'>ZAMKNOUT</button></div><form id='sb-admin-compose'><label for='sb-admin-title'>Nadpis oznámení</label><input id='sb-admin-title' required minlength='4' maxlength='120' placeholder='Např. Sobotní vyjížďka'><label for='sb-admin-message'>Zpráva pro členy</label><textarea id='sb-admin-message' required minlength='5' maxlength='3000' rows='4'></textarea><p class='sb-profile-muted'>Oznámení uvidí všichni pod zvonečkem. Členům se zapnutými e-maily přijde také e-mail.</p><button class='sb-profile-primary' type='submit'>ZVEŘEJNIT A ROZESLAT →</button></form></div></div>",
 "<p id='sb-profile-feedback' role='status' aria-live='polite'></p><button id='sb-member-logout' class='sb-profile-logout' type='button'>ODHLÁSIT SE</button></section>"
 ].join('');
 header.append(mount);
 const $=id=>document.getElementById(id),trigger=$('sb-member-trigger'),
       popover=$('sb-profile-popover'),feedback=$('sb-profile-feedback');
 let member=null,busy=false;
 const feedbackMessage=(msg,status='info')=>{feedback.textContent=msg;feedback.dataset.status=status;};
 async function api(path,data={}){
   const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify(data),credentials:'same-origin',cache:'no-store'});
   const result=await res.json();if(!res.ok)throw Error(result.error||'Požadavek se nepovedl.');return result;
 }
 function avatar(user){
   for(const node of [trigger.querySelector('.sb-trigger-avatar'),popover.querySelector('.sb-profile-avatar')]){
     node.replaceChildren();
     if(user.avatarData&&/^data:image\/webp;base64,/.test(user.avatarData)){
       const image=document.createElement('img');image.src=user.avatarData;image.alt='';
       node.append(image);
     }else node.textContent=Array.from(user.nickname.trim()).slice(0,2).join('').toUpperCase();
   }
 }
 function refreshMember(user){
   member=user;trigger.hidden=false;
   trigger.querySelector('.sb-trigger-name').textContent=user.nickname;
   popover.querySelector('.sb-profile-nickname').textContent=user.nickname;
   popover.querySelector('.sb-profile-email').textContent=user.email;
   popover.querySelector('[data-panel=admin]').hidden=user.isAdmin!==true;
   for(const link of header.querySelectorAll('a.header-action'))link.hidden=true;
   avatar(user);
   $('sb-email-toggle').textContent=user.emailOptIn?'VYPNOUT KLUBOVÉ E-MAILY':'ZAPNOUT KLUBOVÉ E-MAILY';
   $('sb-email-toggle').setAttribute('aria-pressed',String(user.emailOptIn));
   const join=document.querySelector('a.join-demo-link');
   if(join){join.textContent='MŮJ PROFIL →';join.href='/signin/';
      join.addEventListener('click',ev=>{ev.preventDefault();open('profile');});}
 }
 function close(){popover.hidden=true;trigger.setAttribute('aria-expanded','false');}
 function tab(name){
   if(name==='admin'&&!member?.isAdmin)return;
   for(const button of popover.querySelectorAll('[data-panel]'))button.setAttribute('aria-pressed',String(button.dataset.panel===name));
   for(const id of ['profile','settings','admin'])$('sb-profile-'+id).hidden=id!==name;
   feedbackMessage('');
   if(name==='admin')void checkAdmin();
 }
 function open(name='profile'){popover.hidden=false;trigger.setAttribute('aria-expanded','true');tab(name);popover.querySelector('[data-panel='+name+']')?.focus();}
 trigger.addEventListener('click',()=>popover.hidden?open():close());
 $('sb-profile-close').addEventListener('click',()=>{close();trigger.focus();});
 for(const button of popover.querySelectorAll('[data-panel]'))button.addEventListener('click',()=>tab(button.dataset.panel));
 document.addEventListener('pointerdown',ev=>{if(!popover.hidden&&!mount.contains(ev.target))close();});
 document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!popover.hidden){close();trigger.focus();}});
 $('sb-email-toggle').addEventListener('click',async()=>{
   if(busy||!member)return;busy=true;const next=!member.emailOptIn;
   try{await api('/api/account/preferences',{emailOptIn:next});member.emailOptIn=next;refreshMember(member);feedbackMessage('Nastavení uloženo.','success');}
   catch(e){feedbackMessage(e.message,'error');}finally{busy=false;}
 });
 async function loadImage(file){
   return new Promise((resolve,reject)=>{
     const image=new Image(),url=URL.createObjectURL(file);
     image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
     image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Obrázek nelze načíst.'));};
     image.src=url;
   });
 }
 async function setAvatar(avatarData){
   const r=await api('/api/account/avatar',{avatarData});
   member.avatarData=r.avatarData;avatar(member);feedbackMessage('Fotka uložena.','success');
 }
 $('sb-avatar-upload').addEventListener('change',async ev=>{
   const file=ev.target.files?.[0];if(!file)return;
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){
     feedbackMessage('Vyber PNG, JPG nebo WebP do 5 MB.','error');ev.target.value='';return;
   }
   try{
     const img=await loadImage(file),canvas=document.createElement('canvas');canvas.width=canvas.height=128;
     const ctx=canvas.getContext('2d');if(!ctx)throw Error('Nelze zpracovat obrázek.');
     const side=Math.min(img.naturalWidth,img.naturalHeight);
     ctx.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,128,128);
     const data=canvas.toDataURL('image/webp',.7);
     if(data.length>85000||!data.startsWith('data:image/webp;base64,'))throw Error('Obrázek je příliš velký.');
     await setAvatar(data);
   }catch(e){feedbackMessage(e.message,'error');}finally{ev.target.value='';}
 });
 $('sb-avatar-remove').addEventListener('click',async()=>{try{await setAvatar(null);}catch(e){feedbackMessage(e.message,'error');}});
 async function checkAdmin(){
   try{
     const response=await fetch('/api/admin/status',{cache:'no-store',credentials:'same-origin'});
     if(!response.ok)throw Error('Přístup nelze ověřit.');
     const status=await response.json(),ok=status.eligible===true&&status.unlocked===true;
     $('sb-admin-locked').hidden=ok;$('sb-admin-unlocked').hidden=!ok;
     if(!status.passwordConfigured)feedbackMessage('Admin heslo musí být nejprve nastavené na Renderu.','error');
   }catch(e){feedbackMessage(e.message,'error');}
 }
 $('sb-admin-unlock-form').addEventListener('submit',async ev=>{
   ev.preventDefault();const button=ev.currentTarget.querySelector('button');button.disabled=true;
   try{await api('/api/admin/unlock',{password:$('sb-admin-password').value});$('sb-admin-password').value='';
     await checkAdmin();feedbackMessage('Administrace odemčena na 20 minut.','success');}
   catch(e){feedbackMessage(e.message,'error');}finally{button.disabled=false;}
 });
 $('sb-admin-lock').addEventListener('click',async()=>{
   try{await api('/api/admin/lock');await checkAdmin();feedbackMessage('Administrace zamčena.');}
   catch(e){feedbackMessage(e.message,'error');}
 });
 $('sb-admin-compose').addEventListener('submit',async ev=>{
   ev.preventDefault();if(busy||!ev.currentTarget.reportValidity())return;
   if(!window.confirm('Zveřejnit oznámení a poslat e-mail všem členům, kteří mají klubové e-maily zapnuté?'))return;
   busy=true;const form=ev.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;
   try{await api('/api/announcements',{title:$('sb-admin-title').value.trim(),body:$('sb-admin-message').value.trim()});
     form.reset();feedbackMessage('Oznámení zveřejněno a e-maily zařazeny k odeslání.','success');}
   catch(e){feedbackMessage(e.message,'error');}finally{busy=false;button.disabled=false;}
 });
 $('sb-member-logout').addEventListener('click',async()=>{
   try{await api('/api/account/logout');window.location.assign('/');}
   catch(e){feedbackMessage(e.message,'error');}
 });
 async function init(){
   try{const r=await fetch('/api/account/me',{cache:'no-store',credentials:'same-origin'});
     if(!r.ok)return;const data=await r.json();if(data.member)refreshMember(data.member);}
   catch{ /* Public site stays usable while account service is offline. */ }
 }
 void init();
})();