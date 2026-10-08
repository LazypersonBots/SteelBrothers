import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../gallery.js', import.meta.url), 'utf8');

async function render(mode, count) {
  function element(tag) {
    return {
      tag,
      children: [],
      attributes: {},
      hidden: false,
      dataset: {},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(name, value) { this.attributes[name] = value; }
    };
  }
  const grid = element('div');
  grid.dataset.galleryGrid = mode;
  const more = element('a');
  more.hidden = true;
  const photos = Array.from({ length: count }, (_, i) => ({
    src: '/photos/' + String(i) + '.jpg',
    title: 'Photo ' + String(i),
    date: '2026-10-08'
  }));
  const document = {
    querySelector(selector) { return selector === '[data-gallery-grid]' ? grid : null; },
    getElementById(id) { return id === 'gallery-see-more' && mode === 'home' ? more : null; },
    createElement: element
  };
  const fetch = async () => ({ ok: true, json: async () => ({ photos }) });
  runInNewContext(script, { document, fetch, console });
  // The script uses two await points: fetch and response.json.
  await new Promise((resolve) => setImmediate(resolve));
  return { grid, more };
}

test('homepage shows exactly three of five and exposes view more', async () => {
  const { grid, more } = await render('home', 5);
  assert.equal(grid.children.length, 3);
  assert.equal(grid.children[0].children[1].children[0].textContent, 'Photo 0');
  assert.equal(more.hidden, false);
});

test('homepage hides view more with three photos', async () => {
  const { grid, more } = await render('home', 3);
  assert.equal(grid.children.length, 3);
  assert.equal(more.hidden, true);
});

test('homepage displays an empty message when no photos exist', async () => {
  const { grid, more } = await render('home', 0);
  assert.equal(grid.children.length, 1);
  assert.equal(grid.children[0].className, 'gallery-empty');
  assert.equal(more.hidden, true);
});

test('full gallery lists all photos', async () => {
  const { grid } = await render('all', 5);
  assert.equal(grid.children.length, 5);
});

test('all gallery links are safe and open original photos', async () => {
  const { grid } = await render('home', 1);
  const link = grid.children[0].children[0];
  assert.equal(link.href, '/photos/0.jpg');
  assert.equal(link.rel, 'noopener noreferrer');
});

test('full gallery contains return-home link and homepage has gallery CTA', async () => {
  const page = await readFile(new URL('../gallery/index.html', import.meta.url), 'utf8');
  const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(page, /href="\/"[^>]*>← ZPĚT NA HLAVNÍ STRÁNKU/);
  assert.match(home, /id="gallery-see-more"[^>]*href="\/gallery\/"/);
});
