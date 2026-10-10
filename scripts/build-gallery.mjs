import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPhotoZip } from './read-photo-zip.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supported = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const datePrefix = /^(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2})(\d{2})?)?(?:[-_]|$)/;

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
    const hours = Number(match[4] || '0');
    const minutes = Number(match[5] || '0');
    const seconds = Number(match[6] || '0');
    const candidate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
    if (year >= 1900 && hours < 24 && minutes < 60 && seconds < 60 &&
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

async function collectImages(directory, prefix = '', extensions = supported) {
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
      results.push(...await collectImages(full, rel, extensions));
    } else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
      results.push(rel);
    }
  }
  return results;
}

export async function buildGallery() {
  const output = join(root, 'dist');
  const images = await collectImages(join(root, 'photos'));
  const archives = await collectImages(join(root, 'photos'), '', new Set(['.zip']));
  const allPhotos = [...images];
  await rm(output, { recursive: true, force: true });
  await mkdir(join(output, 'gallery'), { recursive: true });
  await mkdir(join(output, 'activity'), { recursive: true });
  await mkdir(join(output, 'signin'), { recursive: true });
  await mkdir(join(output, 'photos'), { recursive: true });

  for (const file of ['index.html', 'styles.css', 'gallery.js', 'activity.js', 'activity-data.json', 'signin.js', 'email-verification.js', 'auth.css', 'announcements.js', 'announcements.css', 'steel-brothers-logo.avif', 'favicon.png', '_headers']) {
    await cp(join(root, file), join(output, file));
  }
  await cp(join(root, 'gallery', 'index.html'), join(output, 'gallery', 'index.html'));
  await cp(join(root, 'activity', 'index.html'), join(output, 'activity', 'index.html'));
  await cp(join(root, 'signin', 'index.html'), join(output, 'signin', 'index.html'));

  for (const image of images) {
    const destination = join(output, 'photos', image);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(root, 'photos', image), destination);
  }
  for (const archive of archives) {
    const entries = readPhotoZip(await readFile(join(root, 'photos', archive)), archive);
    for (const photo of entries) {
      if (allPhotos.includes(photo.filename)) {
        throw new Error('Duplicate gallery photo filename: ' + photo.filename);
      }
      allPhotos.push(photo.filename);
      await writeFile(join(output, 'photos', photo.filename), photo.data);
    }
  }
  const manifest = makeManifest(allPhotos);
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
