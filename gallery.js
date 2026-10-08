(() => {
  const grid = document.querySelector('[data-gallery-grid]');
  if (!grid) return;

  const isHome = grid.dataset.galleryGrid === 'home';
  const more = document.getElementById('gallery-see-more');

  function showMessage(message) {
    grid.replaceChildren();
    const text = document.createElement('p');
    text.className = 'gallery-empty';
    text.textContent = message;
    grid.append(text);
    if (more) more.hidden = true;
  }

  function makeCard(photo, index) {
    const figure = document.createElement('figure');
    figure.className = 'gallery-figure' + (isHome && index === 0 ? ' wide' : '');

    const link = document.createElement('a');
    link.className = 'gallery-photo-link';
    link.href = photo.src;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Otevřít fotografii: ' + photo.title);

    const image = document.createElement('img');
    image.className = 'gallery-photo';
    image.src = photo.src;
    image.alt = photo.title;
    image.loading = index === 0 && isHome ? 'eager' : 'lazy';
    image.decoding = 'async';
    link.append(image);

    const caption = document.createElement('figcaption');
    caption.className = 'gallery-caption';
    const title = document.createElement('span');
    title.textContent = photo.title;
    caption.append(title);
    if (photo.date) {
      const date = document.createElement('time');
      date.dateTime = photo.date;
      const parts = photo.date.split('-');
      date.textContent = parts[2] + '. ' + parts[1] + '. ' + parts[0];
      caption.append(date);
    }
    figure.append(link, caption);
    return figure;
  }

  async function load() {
    try {
      const response = await fetch('/gallery-data.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Gallery data unavailable');
      const data = await response.json();
      if (!data || !Array.isArray(data.photos)) throw new Error('Invalid gallery data');
      const photos = data.photos.filter((item) =>
        item && typeof item.src === 'string' && item.src.startsWith('/photos/') &&
        typeof item.title === 'string' && (item.date === null || typeof item.date === 'string')
      );
      if (photos.length === 0) {
        showMessage('Fotografie zatím připravujeme. Brzy tu uvidíte naše společné zážitky.');
        return;
      }

      const visible = isHome ? photos.slice(0, 3) : photos;
      grid.replaceChildren(...visible.map(makeCard));
      if (more) more.hidden = photos.length <= 3;
    } catch (error) {
      console.error('Steel Brothers gallery:', error);
      showMessage('Galerii se nepodařilo načíst. Zkuste stránku obnovit.');
    }
  }

  load();
})();
