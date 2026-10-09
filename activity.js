(() => {
  const container = document.querySelector('[data-activity-list]');
  if (!container) return;

  function showMessage(message) {
    const p = document.createElement('p');
    p.className = 'activity-empty';
    p.textContent = message;
    container.replaceChildren(p);
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
    status.textContent = item.status;
    meta.append(category, status);

    const title = document.createElement('h3');
    title.textContent = item.title;
    const desc = document.createElement('p');
    desc.className = 'activity-description';
    desc.textContent = item.description;
    article.append(meta, title, desc);
    return article;
  }

  async function load() {
    try {
      const response = await fetch('/activity-data.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Activity data unavailable');
      const json = await response.json();
      if (!json || !Array.isArray(json.activities)) throw new Error('Invalid activities');
      const items = json.activities.filter(item =>
        item && typeof item.title === 'string' && typeof item.category === 'string' &&
        typeof item.description === 'string' && typeof item.status === 'string'
      );
      // Entries are curated newest-first; future real posts can carry a publishedAt date.
      items.sort((a,b) => {
        const aTime = a.publishedAt ? Date.parse(a.publishedAt) || 0 : 0;
        const bTime = b.publishedAt ? Date.parse(b.publishedAt) || 0 : 0;
        return bTime - aTime;
      });
      if (!items.length) {
        showMessage('Aktivity zatím připravujeme.');
        return;
      }
      container.replaceChildren(...(container.dataset.activityList === 'home' ? items.slice(0,3) : items).map(makeCard));
    } catch (error) {
      console.error('Steel Brothers activities:', error);
      showMessage('Aktivity teď nelze načíst. Zkuste to prosím později.');
    }
  }
  load();
})();
