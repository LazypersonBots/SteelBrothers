import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supported = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const datePrefix = /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{4}))?(?:[-_]|$)/;

export function photoRecord(relativePath) {
  const file = basename(relativePath);
  const stem = file.slice(0, -extname(file).length);
  const match = datePrefix.exec(stem);
  let date = null;
  let timestamp = 0;

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const clock = match[4] || '0000';
    const hours = Number(clock.slice(0, 2));
    const minutes = Number(clock.slice(2, 4));
    const candidate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
    if (year >= 1900 && hours < 24 && minutes < 60 &&
        candidate.getUTCFullYear() === year &&
        candidate.getUTCMonth() === month - 1 &&
        candidate.getUTCDate() === day) {
      date = match[1] + '-' + match[2] + '-' + match[3];
      timestamp = candidate.getTime();
    }
  }

  const readable = (date ? stem.slice(match[0].length) : stem)
    .replace(/[-_]+/g, ' ').trim();
  return {
    src: '/photos/' + relativePath.split('/').map(encodeURIComponent).join('/'),
    title: readable || 'Fotografie Steel Brothers',
    date,
    timestamp,
    path: relativePath
  };
}

export function makeManifest(relativePaths) {
  return relativePaths
    .filter((item) => supported.has(extname(item).toLowerCase()))
    .map(photoRecord)
    .sort((a, b) => b.timestamp - a.timestamp || b.path.localeCompare(a.path, 'en'))
    .map(({ src, title, date }) => ({ src, title, date }));
}

async function collectImages(directory, prefix = '') {
  const results = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return results;
    throw error;
  }
  for (const entry of entries) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectImages(full, rel));
    } else if (entry.isFile() && supported.has(extname(entry.name).toLowerCase())) {
      results.push(rel);
    }
  }
  return results;
}

export async function buildGallery() {
  const output = join(root, 'dist');
  const images = await collectImages(join(root, 'photos'));
  const manifest = makeManifest(images);
  await rm(output, { recursive: true, force: true });
  await mkdir(join(output, 'gallery'), { recursive: true });
  await mkdir(join(output, 'photos'), { recursive: true });

  for (const file of ['index.html', 'styles.css', 'gallery.js', 'steel-brothers-logo.avif', '_headers']) {
    await cp(join(root, file), join(output, file));
  }
  await cp(join(root, 'gallery', 'index.html'), join(output, 'gallery', 'index.html'));

  for (const image of images) {
    const destination = join(output, 'photos', image);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(root, 'photos', image), destination);
  }
  await writeFile(join(output, 'gallery-data.json'),
    JSON.stringify({ photos: manifest }, null, 2) + '\n');
  console.log('Gallery build complete: ' + manifest.length + ' photo(s)');
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildGallery().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
