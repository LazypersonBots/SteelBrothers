/* Persistent Resend codes. Registration proof is server-issued and consumed once. */
(() => {
  const $ = id => document.getElementById(id);
  const email = $('email');
  const send = $('send-email-code');
  const verify = $('verify-email-code');
  const panel = $('email-code-panel');
  const field = $('verify-field');
  const code = $('email-code');
  const status = $('email-code-status');
  if (!email || !send || !verify || !panel || !field || !code || !status) return;

  let available = false;
  let pendingEmail = '';
  let busy = false;

  function show(message, type = 'info') {
    status.textContent = message;
    status.dataset.status = type;
  }

  function clear() {
    pendingEmail = '';
    code.value = '';
    panel.hidden = true;
    delete field.dataset.verifiedEmail;
    delete field.dataset.verificationProof;
    send.textContent = 'POSLAT KÓD →';
    send.disabled = !available;
    verify.disabled = false;
    if (available) show('Začni zadáním e-mailu a kliknutím na „Poslat kód“.');
  }

  async function callApi(path, payload) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Požadavek selhal.');
    return data;
  }

  email.addEventListener('input', clear);
  document.querySelectorAll('[data-mode]').forEach(button =>
    button.addEventListener('click', clear));

  send.addEventListener('click', async () => {
    if (!available || busy) return;
    if (!email.checkValidity()) {
      email.reportValidity();
      return;
    }
    busy = true;
    send.disabled = true;
    const target = email.value.trim().toLowerCase();
    try {
      const result = await callApi('/api/email/send', { email: target });
      pendingEmail = target;
      delete field.dataset.verifiedEmail;
      panel.hidden = false;
      code.value = '';
      code.focus();
      show(result.message, 'info');
    } catch (error) {
      show(error.message || 'Odeslání se nepovedlo.', 'error');
    } finally {
      busy = false;
      send.disabled = !available;
    }
  });

  verify.addEventListener('click', async () => {
    if (busy || !pendingEmail) return;
    const token = code.value.trim();
    if (!/^\d{6}$/.test(token)) {
      show('Zadej všech šest číslic kódu.', 'error');
      code.focus();
      return;
    }
    busy = true;
    verify.disabled = true;
    try {
      const result = await callApi('/api/email/verify', { email: pendingEmail, code: token });
      if (!result.verified) throw new Error('Ověření se nepodařilo.');
      field.dataset.verifiedEmail = pendingEmail;
      if(result.verificationProof)field.dataset.verificationProof=result.verificationProof;
      panel.hidden = true;
      code.value = '';
      send.disabled = true;
      send.textContent = 'E-MAIL OVĚŘEN ✓';
      show('✓ E-mail ověřen. Teď můžeš vytvořit účet.', 'success');
    } catch (error) {
      code.value = '';
      show(error.message || 'Nesprávný kód.', 'error');
    } finally {
      busy = false;
      verify.disabled = false;
    }
  });

  fetch('/api/email/send', { cache: 'no-store' })
    .then(response => response.json())
    .then(data => {
      available = data.available === true && data.accountCreation === true;
      send.disabled = !available;
      show(available
        ? 'Ověřování e-mailu je připravené. Zadej adresu a klikni „Poslat kód“.'
        : 'Ověřování pro klubové účty čeká na připojení databáze Neon v Render.',
        available ? 'success' : 'info');
    })
    .catch(() => {
      available = false;
      send.disabled = true;
      show('Ověřování se teď nepodařilo načíst. Zkus obnovit stránku.', 'error');
    });
})();
