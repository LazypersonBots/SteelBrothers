(() => {
 const $=id=>document.getElementById(id), form=$('auth-form');
 if(!form)return;
 const buttons=[...document.querySelectorAll('[data-mode]')];
 const email=$('email'),password=$('password'),confirm=$('confirm-password');
 const nickname=$('nickname'),nickField=$('nickname-field'),verifyField=$('verify-field');
 const confirmField=$('confirm-field');
 const submit=$('auth-submit'),feedback=$('auth-feedback'),heading=$('auth-heading');
 const subtitle=$('auth-subtitle'),notice=document.querySelector('.auth-demo-notice');
 const summary=$('account-summary'),accountName=$('account-name'),accountOpt=$('account-email-opt-in');
 const logout=$('account-logout'),footer=document.querySelector('.auth-footer-note');
 const mailStatus=$('account-mail-status');
 let optedIn=false;
 let mode='register',available=false,busy=false;
 const show=(text,kind='info')=>{feedback.textContent=text;feedback.dataset.status=kind;};
 async function request(path,data) {
   const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify(data),credentials:'same-origin'});
   const body=await response.json();
   if(!response.ok)throw Error(body.error||'Request failed');
   return body;
 }
 function showMember(member) {
   form.hidden=true;summary.hidden=false;
   accountName.textContent=member.nickname+' ('+member.email+')';
   optedIn=member.emailOptIn===true;
   syncMailButton();
   document.dispatchEvent(new CustomEvent('sb:member-ready',{detail:{admin:member.isAdmin===true}}));
   heading.textContent='Vítej v klubu.';
   subtitle.textContent='Tvůj klubový účet je aktivní.';
   show('');
 }
 function syncMailButton(){
   accountOpt.textContent=optedIn?'VYPNOUT E-MAILY':'ZAPNOUT E-MAILY';
   accountOpt.setAttribute('aria-pressed',String(optedIn));
   mailStatus.textContent=optedIn?'Dostáváš klubové e-maily.':'Klubové e-maily jsou vypnuté.';
 }
 function setMode(next) {
   if(busy)return;
   mode=next==='login'?'login':'register';
   const reg=mode==='register';
   buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
   nickField.hidden=!reg;confirmField.hidden=!reg;verifyField.hidden=!reg;
   nickname.required=reg;confirm.required=reg;
   password.autocomplete=reg?'new-password':'current-password';
   heading.textContent=reg?'Vytvořit účet.':'Přihlásit se.';
   subtitle.textContent=reg?'Ověř e-mail a vytvoř si účet Steel Brothers.':'Přihlas se svým e-mailem a heslem.';
   submit.textContent=reg?'VYTVOŘIT ÚČET →':'PŘIHLÁSIT SE →';
   form.reset();password.type='password';confirm.type='password';confirm.setCustomValidity('');
   if(verifyField){delete verifyField.dataset.verifiedEmail;delete verifyField.dataset.verificationProof;}
   show('');
   if(!available) show('Registrace čeká na připojení samostatné databáze Neon. Účet zatím nelze vytvořit.','error');
 }
 buttons.forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
 document.querySelectorAll('[data-toggle-password]').forEach(b=>b.addEventListener('click',()=>{
   const field=$(b.dataset.togglePassword),visible=field.type==='password';
   field.type=visible?'text':'password';b.textContent=visible?'Skrýt':'Zobrazit';
   b.setAttribute('aria-pressed',String(visible));
 }));
 confirm.addEventListener('input',()=>confirm.setCustomValidity(''));
 form.addEventListener('submit',async e=>{
   e.preventDefault();
   if(!available||busy)return;
   show('');
   if(mode==='register'&&password.value!==confirm.value) {
     confirm.setCustomValidity('Hesla se musí shodovat.');confirm.reportValidity();return;
   }
   confirm.setCustomValidity('');
   if(!form.reportValidity())return;
   if(mode==='register' && (verifyField.dataset.verifiedEmail!==email.value.trim().toLowerCase()
       || !verifyField.dataset.verificationProof)) {
     show('Nejdřív ověř e-mail šestimístným kódem.','error');return;
   }
   busy=true;submit.disabled=true;
   try {
     const payload=mode==='register'
       ? {email:email.value.trim(),nickname:nickname.value.trim(),password:password.value,
          verificationProof:verifyField.dataset.verificationProof}
       : {email:email.value.trim(),password:password.value};
     const data=await request('/api/account/'+(mode==='register'?'register':'login'),payload);
     password.value='';confirm.value='';
     delete verifyField.dataset.verificationProof;
     showMember(data.member);
   }catch(err){show(err.message,'error');}
   finally{busy=false;submit.disabled=false;}
 });
 logout.addEventListener('click',async()=>{
   try{
     await request('/api/account/logout',{});
     summary.hidden=true;form.hidden=false;
     document.dispatchEvent(new CustomEvent('sb:member-ready',{detail:{admin:false}}));
     setMode('login');
   }catch(err){show(err.message,'error');}
 });
 accountOpt.addEventListener('click',async()=>{
   const next=!optedIn;
   accountOpt.disabled=true;
   try{await request('/api/account/preferences',{emailOptIn:next});optedIn=next;syncMailButton();}
   catch(err){mailStatus.textContent=err.message;}
   finally{accountOpt.disabled=false;}
 });
 async function init() {
   try {
     const [state,res]=await Promise.all([fetch('/api/account/status').then(r=>r.json()),
       fetch('/api/account/me').then(r=>r.json())]);
     available=state.available===true;
     if(notice)notice.textContent=available?'KLUBOVÉ ÚČTY JSOU AKTIVNÍ':'REGISTRACE ČEKÁ NA DATABÁZI NEON';
     if(footer)footer.textContent=available
       ? 'Klubové e-maily můžeš kdykoli zapnout v nastavení svého účtu.'
       : 'Registrace zatím není dostupná. Nejprve připoj databázi Neon k Render.';
     submit.disabled=!available;
     if(res.member)showMember(res.member); else setMode('register');
   }catch{available=false;submit.disabled=true;show('Nelze se spojit se službou účtů.','error');}
 }
 setMode('register');init();
})();