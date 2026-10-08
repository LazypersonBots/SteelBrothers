import test from 'node:test';
import assert from 'node:assert/strict';
import { makeManifest, photoRecord } from '../scripts/build-gallery.mjs';

test('newest photos appear first regardless of upload order', () => {
  const photos = makeManifest([
    '2026-08-01-first.jpg',
    '2026-10-08-0900-second.png',
    '2026-10-08-1730-third.webp',
    '2026-09-05-fourth.avif',
    '.gitkeep',
    'README.md'
  ]);
  assert.equal(photos.length, 4);
  assert.deepEqual(photos.map((p) => p.title), ['third', 'second', 'fourth', 'first']);
  assert.deepEqual(photos.slice(0, 3).map((p) => p.title), ['third', 'second', 'fourth']);
});

test('photo paths are encoded and captions readable', () => {
  const item = photoRecord('events/2026-10-08-Naše motorky.jpg');
  assert.equal(item.src, '/photos/events/2026-10-08-Na%C5%A1e%20motorky.jpg');
  assert.equal(item.title, 'Naše motorky');
  assert.equal(item.date, '2026-10-08');
});

test('undated files are still visible but follow dated photos', () => {
  const items = makeManifest(['DSC0002.JPG', '2026-09-03-ride.jpg']);
  assert.equal(items[0].title, 'ride');
  assert.equal(items[1].title, 'DSC0002');
  assert.equal(items[1].date, null);
});

test('invalid dates are not treated as recent', () => {
  const items = makeManifest(['2026-02-31-invalid.png', '2026-02-28-valid.jpg']);
  assert.equal(items[0].title, 'valid');
  assert.equal(items[1].date, null);
});

test('only supported image extensions become gallery entries', () => {
  const items = makeManifest(['x.svg', 'code.js', 'photos/2026-10-08-picture.gif', 'x.webp']);
  assert.equal(items.length, 2);
});
