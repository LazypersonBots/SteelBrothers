(() => {
 const $=id=>document.getElementById(id),form=$('auth-form');
 if(!form)return;
 const email=$('email'),password=$('password'),confirm=$('confirm-password'),
       nickname=$('nickname'),verifyField=$('verify-field'),feedback=$('auth-feedback'),
       submit=$('auth-submit'),heading=$('auth-heading'),subtitle=$('auth-subtitle'),
       notice=document.querySelector('.auth-demo-notice');
 const modes=[...document.querySelectorAll('[data-mode]')];
 let mode='register',available=false,busy=false;
 const show=(message,type='info')=>{feedback.textContent=message;feedback.dataset.status=type;};
 async function send(path,data){
   const response=await fetch(path,{
     method:'POST',headers:{'Content-Type':'application/json'},
     credentials:'same-origin',body:JSON.stringify(data),cache:'no-store'
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Požadavek se nepovedl.');
   return result;
 }
 function setMode(value){
   if(busy)return;
   mode=value==='login'?'login':'register';
   const register=mode==='register';
   modes.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
   for(const id of ['nickname-field','confirm-field','verify-field'])$(id).hidden=!register;
   nickname.required=register;confirm.required=register;
   password.autocomplete=register?'new-password':'current-password';
   heading.textContent=register?'Vytvořit účet.':'Přihlásit se.';
   subtitle.textContent=register
     ?'Ověř e-mail a přidej se do Steel Brothers.'
     :'Přihlas se ke svému klubovému účtu.';
   submit.textContent=register?'VYTVOŘIT ÚČET →':'PŘIHLÁSIT SE →';
   form.reset();confirm.setCustomValidity('');
   if(verifyField){delete verifyField.dataset.verifiedEmail;delete verifyField.dataset.verificationProof;}
   show(available?'':'Účty jsou dočasně nedostupné.','info');
 }
 modes.forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
 document.querySelectorAll('[data-toggle-password]').forEach(button=>button.addEventListener('click',()=>{
   const field=$(button.dataset.togglePassword),reveal=field.type==='password';
   field.type=reveal?'text':'password';
   button.textContent=reveal?'Skrýt':'Zobrazit';
   button.setAttribute('aria-pressed',String(reveal));
 }));
 confirm.addEventListener('input',()=>confirm.setCustomValidity(''));
 form.addEventListener('submit',async ev=>{
   ev.preventDefault();
   if(!available||busy||!form.reportValidity())return;
   if(mode==='register'&&password.value!==confirm.value){
     confirm.setCustomValidity('Hesla se neshodují.');
     confirm.reportValidity();return;
   }
   confirm.setCustomValidity('');
   const address=email.value.trim().toLowerCase();
   if(mode==='register'&&(verifyField.dataset.verifiedEmail!==address||
     !verifyField.dataset.verificationProof)){
     show('Nejdřív ověř svůj e-mail pomocí šestimístného kódu.','error');return;
   }
   busy=true;submit.disabled=true;show('Zpracovávám…');
   try{
     const payload=mode==='register'
       ? {email:address,nickname:nickname.value.trim(),password:password.value,
           verificationProof:verifyField.dataset.verificationProof}
       : {email:address,password:password.value};
     await send('/api/account/'+(mode==='register'?'register':'login'),payload);
     password.value='';confirm.value='';
     // The server has established a Secure HttpOnly cookie before redirecting.
     window.location.assign('/');
   }catch(error){
     show(error.message||'Přihlášení se nepovedlo.','error');
     busy=false;submit.disabled=!available;
   }
 });
 async function init(){
   try{
     const [status,response]=await Promise.all([
       fetch('/api/account/status',{cache:'no-store'}).then(r=>r.json()),
       fetch('/api/account/me',{cache:'no-store'}).then(r=>r.json())
     ]);
     if(response.member){window.location.replace('/');return;}
     available=status.available===true;
     if(notice)notice.textContent=available?'KLUBOVÉ ÚČTY JSOU AKTIVNÍ':'ÚČTY JSOU DOČASNĚ NEDOSTUPNÉ';
     submit.disabled=!available;
     setMode('register');
   }catch{available=false;submit.disabled=true;show('Nelze se připojit k serveru.','error');}
 }
 setMode('register');void init();
})();