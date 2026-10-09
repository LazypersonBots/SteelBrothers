(() => {
  const form = document.getElementById('auth-form');
  if (!form) return;
  const buttons = [...document.querySelectorAll('[data-mode]')];
  const nickname = document.getElementById('nickname');
  const nicknameField = document.getElementById('nickname-field');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const confirm = document.getElementById('confirm-password');
  const confirmField = document.getElementById('confirm-field');
  const verifyField = document.getElementById('verify-field');
  const acknowledge = document.getElementById('demo-agree');
  const acknowledgeField = document.getElementById('demo-acknowledge');
  const heading = document.getElementById('auth-heading');
  const subtitle = document.getElementById('auth-subtitle');
  const submit = document.getElementById('auth-submit');
  const feedback = document.getElementById('auth-feedback');
  let mode = 'register';

  function setMode(next) {
    mode = next === 'login' ? 'login' : 'register';
    const registration = mode === 'register';
    buttons.forEach(button => button.setAttribute('aria-pressed',
      String(button.dataset.mode === mode)));
    nicknameField.hidden = !registration;
    confirmField.hidden = !registration;
    verifyField.hidden = !registration;
    acknowledgeField.hidden = !registration;
    nickname.required = registration;
    confirm.required = registration;
    acknowledge.required = registration;
    password.autocomplete = registration ? 'new-password' : 'current-password';
    heading.textContent = registration ? 'Vytvořit účet.' : 'Přihlásit se.';
    subtitle.textContent = registration
      ? 'Připoj se ke Steel Brothers. Účty a ověřování zatím připravujeme.'
      : 'Vítej zpět. Přihlášení je prozatím jen interaktivní ukázka.';
    submit.textContent = registration ? 'ZKONTROLOVAT REGISTRACI →' : 'VYZKOUŠET PŘIHLÁŠENÍ →';
    feedback.textContent = '';
    feedback.removeAttribute('data-status');
    form.reset();
    password.type = 'password';
    confirm.type = 'password';
    document.querySelectorAll('[data-toggle-password]').forEach(button => {
      button.textContent = 'Zobrazit';
      button.setAttribute('aria-pressed', 'false');
    });
  }

  buttons.forEach(button =>
    button.addEventListener('click', () => setMode(button.dataset.mode)));
  document.querySelectorAll('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
      const field = document.getElementById(button.dataset.togglePassword);
      const show = field.type === 'password';
      field.type = show ? 'text' : 'password';
      button.textContent = show ? 'Skrýt' : 'Zobrazit';
      button.setAttribute('aria-pressed', String(show));
      button.setAttribute('aria-label', show ? 'Skrýt heslo' : 'Zobrazit heslo');
    });
  });
  confirm.addEventListener('input', () => confirm.setCustomValidity(''));
  password.addEventListener('input', () => confirm.setCustomValidity(''));

  form.addEventListener('submit', event => {
    event.preventDefault(); // Demo only: never send credentials to any server.
    feedback.textContent = '';
    if (mode === 'register' && confirm.value !== password.value) {
      confirm.setCustomValidity('Hesla se musí shodovat.');
      confirm.reportValidity();
      return;
    }
    confirm.setCustomValidity('');
    if (!form.reportValidity()) return;
    // Never persist personal data or passwords, even in localStorage.
    feedback.dataset.status = 'demo';
    feedback.textContent = mode === 'register'
      ? 'Formulář je vyplněný správně. Toto je pouze demo — účet nebyl vytvořen a e-mail se neodeslal.'
      : 'Toto je pouze demo — nepřihlásili jsme tě a heslo se nikam neodeslalo.';
    // Clear secrets promptly; preserve only the informational success state.
    password.value = '';
    confirm.value = '';
  });
  setMode('register');
})();
