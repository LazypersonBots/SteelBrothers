/* Existing Activities page: only confirmed, public events appear here. */
(() => {
  const container = document.querySelector('[data-activity-list]');
  if (!container) return;
  const isHome = container.dataset.activityList === 'home';
  const next = document.querySelector('[data-next-event]');
  const dateFormat = new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague'
  });

  function showMessage(message) {
    const p = document.createElement('p');
    p.className = 'activity-empty';
    p.textContent = message;
    container.replaceChildren(p);
  }
  function eligible(item) {
    if (!item || item.confirmed !== true || item.visibility !== 'public') return false;
    if (typeof item.title !== 'string' || !item.title.trim() ||
        typeof item.category !== 'string' || !item.category.trim() ||
        typeof item.description !== 'string' || !item.description.trim() ||
        typeof item.startsAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(item.startsAt) ||
        !/(?:Z|[+-]\d{2}:\d{2})$/.test(item.startsAt)) return false;
    const timestamp = Date.parse(item.startsAt);
    return Number.isFinite(timestamp) && timestamp >= Date.now();
  }
  function makeCard(item) {
    const article = document.createElement('article');
    article.className = 'activity-card';
    const meta = document.createElement('div');
    meta.className = 'activity-card-meta';
    const category = document.createElement('span');
    category.className = 'activity-category';
    category.textContent = item.category;
    const status = document.createElement('span');
    status.className = 'activity-status';
    status.textContent = 'POTVRZENO';
    meta.append(category, status);

    const date = document.createElement('time');
    date.className = 'activity-date';
    date.dateTime = item.startsAt;
    date.textContent = dateFormat.format(new Date(item.startsAt));
    const title = document.createElement('h3');
    title.textContent = item.title;
    const desc = document.createElement('p');
    desc.className = 'activity-description';
    desc.textContent = item.description;
    article.append(meta, date, title, desc);
    if (typeof item.location === 'string' && item.location.trim()) {
      const location = document.createElement('p');
      location.className = 'activity-location';
      location.textContent = 'Místo: ' + item.location.trim();
      article.append(location);
    }
    return article;
  }

  async function load() {
    try {
      const response = await fetch('/activity-data.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Events unavailable');
      const data = await response.json();
      if (!data || !Array.isArray(data.activities)) throw new Error('Invalid events list');
      const upcoming = data.activities.filter(eligible)
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      if (next) {
        next.textContent = upcoming.length
          ? 'NEJBLIŽŠÍ: ' + dateFormat.format(new Date(upcoming[0].startsAt))
          : 'ZATÍM BEZ POTVRZENÉHO TERMÍNU';
      }
      if (!upcoming.length) {
        showMessage('Zatím nejsou zveřejněné žádné potvrzené akce. Termíny doplníme po schválení klubem.');
        return;
      }
      container.replaceChildren(...(isHome ? upcoming.slice(0, 3) : upcoming).map(makeCard));
    } catch (error) {
      console.error('Steel Brothers events:', error);
      showMessage('Kalendář akcí teď nelze načíst. Zkuste stránku obnovit.');
      if (next) next.textContent = 'TERMÍNY JSOU DOČASNĚ NEDOSTUPNÉ';
    }
  }
  void load();
})();
