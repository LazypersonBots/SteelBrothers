/* Profile-avatar cropper. Reuses the existing 128px WebP API payload. */
(() => {
  'use strict';
  const PREVIEW = 320;
  const DIAMETER = 288;
  const OUTPUT = 128;
  const minZoom = 1;
  const maxZoom = 4;
  let active = null;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  // The circle is always completely covered, including at minimum zoom.
  function layout(width, height, zoom = 1, offsetX = 0, offsetY = 0) {
    if (!(width > 0 && height > 0) || !Number.isFinite(width + height)) {
      throw Error('Obrázek nelze načíst.');
    }
    zoom = clamp(zoom, minZoom, maxZoom);
    const scale = DIAMETER / Math.min(width, height) * zoom;
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const maxX = Math.max(0, (drawWidth - DIAMETER) / 2);
    const maxY = Math.max(0, (drawHeight - DIAMETER) / 2);
    offsetX = clamp(offsetX, -maxX, maxX);
    offsetY = clamp(offsetY, -maxY, maxY);
    return {
      zoom, offsetX, offsetY, drawWidth, drawHeight,
      x: (PREVIEW - drawWidth) / 2 + offsetX,
      y: (PREVIEW - drawHeight) / 2 + offsetY,
      maxX, maxY
    };
  }
  function drawPreview(canvas, img, state) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Nelze zpracovat obrázek.');
    ctx.clearRect(0, 0, PREVIEW, PREVIEW);
    ctx.fillStyle = '#161514';
    ctx.fillRect(0, 0, PREVIEW, PREVIEW);
    ctx.save();
    ctx.beginPath();
    ctx.arc(PREVIEW / 2, PREVIEW / 2, DIAMETER / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, state.x, state.y, state.drawWidth, state.drawHeight);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(PREVIEW / 2, PREVIEW / 2, DIAMETER / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  function exportAvatar(img, state) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Nelze zpracovat obrázek.');
    const ratio = OUTPUT / DIAMETER;
    ctx.drawImage(img,
      (OUTPUT - state.drawWidth * ratio) / 2 + state.offsetX * ratio,
      (OUTPUT - state.drawHeight * ratio) / 2 + state.offsetY * ratio,
      state.drawWidth * ratio, state.drawHeight * ratio);
    for (const quality of [.8, .66, .5, .38]) {
      const data = canvas.toDataURL('image/webp', quality);
      if (data.startsWith('data:image/webp;base64,') && data.length <= 85000) return data;
    }
    throw Error('Obrázek je příliš velký.');
  }

  function open(img, onSave) {
    if (!img || !img.naturalWidth || !img.naturalHeight || typeof onSave !== 'function') {
      throw Error('Obrázek nelze načíst.');
    }
    if (active) active();
    const previousFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'sb-crop-overlay';
    overlay.innerHTML = [
      '<section class="sb-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="sb-crop-title" aria-describedby="sb-crop-help">',
      '<div class="sb-crop-header"><div><span class="sb-crop-kicker">STEEL BROTHERS · PROFILE</span>',
      '<h2 id="sb-crop-title">UPRAVIT PROFILOVOU FOTKU</h2></div>',
      '<button type="button" class="sb-crop-close" aria-label="Zavřít úpravu fotky">×</button></div>',
      '<p id="sb-crop-help" class="sb-crop-help">Posuň fotku tažením nebo šipkami. Přibliž kolečkem, dvěma prsty nebo posuvníkem.</p>',
      '<div class="sb-crop-preview"><canvas width="320" height="320" tabindex="0" role="img" aria-label="Náhled výřezu profilové fotky. Šipky posouvají fotku."></canvas></div>',
      '<div class="sb-crop-controls"><span class="sb-crop-zoom-label">PŘIBLÍŽENÍ</span>',
      '<div class="sb-crop-zoom-row">',
      '<button type="button" class="sb-crop-minus" aria-label="Oddálit fotku">−</button>',
      '<input type="range" min="100" max="400" step="1" value="100" aria-label="Přiblížení fotografie">',
      '<button type="button" class="sb-crop-plus" aria-label="Přiblížit fotku">+</button>',
      '</div></div>',
      '<p class="sb-crop-error" role="alert" aria-live="polite"></p>',
      '<div class="sb-crop-actions"><button type="button" class="sb-crop-cancel">ZRUŠIT</button>',
      '<button type="button" class="sb-crop-save">ULOŽIT FOTKU</button></div>',
      '</section>'
    ].join('');
    const dialog = overlay.querySelector('.sb-crop-dialog');
    const canvas = overlay.querySelector('canvas');
    const slider = overlay.querySelector('input[type=range]');
    const save = overlay.querySelector('.sb-crop-save');
    const error = overlay.querySelector('.sb-crop-error');
    const closeButton = overlay.querySelector('.sb-crop-close');
    const cancelButton = overlay.querySelector('.sb-crop-cancel');
    const minus = overlay.querySelector('.sb-crop-minus');
    const plus = overlay.querySelector('.sb-crop-plus');
    let state = layout(img.naturalWidth, img.naturalHeight);
    let busy = false;
    const pointers = new Map();
    let pinchDistance = 0, pinchZoom = 1;

    function repaint() {
      state = layout(img.naturalWidth, img.naturalHeight,
        state.zoom, state.offsetX, state.offsetY);
      slider.value = String(Math.round(state.zoom * 100));
      drawPreview(canvas, img, state);
    }
    function setZoom(value) {
      state = layout(img.naturalWidth, img.naturalHeight,
        value, state.offsetX, state.offsetY);
      repaint();
    }
    function pointerDistance() {
      const points = [...pointers.values()];
      return points.length < 2 ? 0
        : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    }
    function resetPinch() {
      if (pointers.size < 2) return;
      pinchDistance = pointerDistance();
      pinchZoom = state.zoom;
    }
    function release() {
      if (active !== release) return;
      active = null;
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.classList.remove('sb-avatar-editing');
      overlay.remove();
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
    }
    function cancel() { if (!busy) release(); }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      } else if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),canvas[tabindex]')];
        const visible = controls.filter(node => node.getClientRects().length);
        if (!visible.length) return;
        const first = visible[0], last = visible[visible.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    }
    slider.addEventListener('input', () => setZoom(Number(slider.value) / 100));
    minus.addEventListener('click', () => setZoom(state.zoom - .2));
    plus.addEventListener('click', () => setZoom(state.zoom + .2));
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      setZoom(state.zoom + (event.deltaY < 0 ? .12 : -.12));
    }, {passive:false});
    canvas.addEventListener('pointerdown', event => {
      if (busy) return;
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
      if (pointers.size >= 2) resetPinch();
    });
    canvas.addEventListener('pointermove', event => {
      if (busy || !pointers.has(event.pointerId)) return;
      const previous = pointers.get(event.pointerId);
      pointers.set(event.pointerId, {x:event.clientX, y:event.clientY});
      if (pointers.size >= 2) {
        if (!pinchDistance) resetPinch();
        if (pinchDistance) setZoom(pinchZoom * pointerDistance() / pinchDistance);
      } else {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        state = layout(img.naturalWidth, img.naturalHeight, state.zoom,
          state.offsetX + (event.clientX - previous.x) * PREVIEW / rect.width,
          state.offsetY + (event.clientY - previous.y) * PREVIEW / rect.height);
        repaint();
      }
    });
    function pointerEnd(event) {
      pointers.delete(event.pointerId);
      if (pointers.size >= 2) resetPinch();
      else pinchDistance = 0;
    }
    canvas.addEventListener('pointerup', pointerEnd);
    canvas.addEventListener('pointercancel', pointerEnd);
    canvas.addEventListener('keydown', event => {
      const step = event.shiftKey ? 24 : 8;
      const moves = {
        ArrowLeft:[-step,0], ArrowRight:[step,0],
        ArrowUp:[0,-step], ArrowDown:[0,step]
      };
      if (!moves[event.key]) return;
      event.preventDefault();
      state = layout(img.naturalWidth, img.naturalHeight,
        state.zoom, state.offsetX + moves[event.key][0],
        state.offsetY + moves[event.key][1]);
      repaint();
    });
    overlay.addEventListener('pointerdown', event => {
      if (event.target === overlay) cancel();
    });
    closeButton.addEventListener('click', cancel);
    cancelButton.addEventListener('click', cancel);
    save.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      save.disabled = cancelButton.disabled = closeButton.disabled = true;
      error.textContent = '';
      try {
        const data = exportAvatar(img, state);
        await onSave(data);
        release();
      } catch (exception) {
        error.textContent = exception?.message || 'Fotku se nepodařilo uložit.';
        busy = false;
        save.disabled = cancelButton.disabled = closeButton.disabled = false;
      }
    });
    document.body.append(overlay);
    document.body.classList.add('sb-avatar-editing');
    document.addEventListener('keydown', onKeyDown, true);
    active = release;
    repaint();
    closeButton.focus();
  }
  window.SteelAvatarEditor = {open, layout};
})();
