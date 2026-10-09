/* Steel Brothers sign-in motion controller.
   Scenic movement is CSS; live telemetry and accessible pause use JS.
   This script does not read or submit any registration data. */
(() => {
  const stage = document.querySelector('.auth-drive-scene');
  const speedText = document.getElementById('auth-drive-speed');
  const needle = document.getElementById('auth-drive-needle');
  const arc = document.querySelector('.auth-drive-dial-glow');
  const button = document.getElementById('auth-drive-toggle');
  if (!stage || !speedText || !needle || !arc || !button) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let userPaused = false;
  let animationFrame = 0;
  let elapsed = 0;
  let lastTime = 0;
  let currentSpeed = 82;

  function draw(speed) {
    currentSpeed = Math.max(0, Math.min(160, speed));
    const fraction = Math.max(0, Math.min(1, (currentSpeed - 30) / 120));
    speedText.textContent = String(Math.round(currentSpeed)).padStart(3, '0');
    needle.style.transform = 'rotate(' + (-75 + fraction * 150).toFixed(1) + 'deg)';
    arc.style.strokeDashoffset = String((100 - fraction * 100).toFixed(1));
  }

  function animate(now) {
    if (lastTime) elapsed += Math.min(50, Math.max(0, now - lastTime));
    lastTime = now;
    // A smooth, continuous road-trip speed profile rather than random numbers.
    const speed = 87 + 21 * Math.sin(elapsed / 2400) + 5 * Math.sin(elapsed / 750);
    draw(speed);
    animationFrame = window.requestAnimationFrame(animate);
  }

  function syncMotion() {
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
    lastTime = 0;
    const inactive = document.hidden || reducedMotion.matches || userPaused;
    stage.classList.toggle('motion-paused', inactive);
    button.setAttribute('aria-pressed', String(userPaused));
    if (reducedMotion.matches) {
      button.textContent = 'OMEZENÝ POHYB';
      button.disabled = true;
      draw(82);
      return;
    }
    button.disabled = false;
    button.textContent = userPaused ? 'SPUSTIT ANIMACI' : 'POZASTAVIT ANIMACI';
    if (!inactive) animationFrame = window.requestAnimationFrame(animate);
  }

  button.addEventListener('click', () => {
    if (reducedMotion.matches) return;
    userPaused = !userPaused;
    syncMotion();
  });
  document.addEventListener('visibilitychange', syncMotion);
  if (typeof reducedMotion.addEventListener === 'function') {
    reducedMotion.addEventListener('change', syncMotion);
  } else if (typeof reducedMotion.addListener === 'function') {
    reducedMotion.addListener(syncMotion);
  }
  draw(82);
  syncMotion();
})();
