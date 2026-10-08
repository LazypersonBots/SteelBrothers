import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readPhotoZip } from '../scripts/read-photo-zip.mjs';

function zip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, raw, method = 8] of entries) {
    const filename = Buffer.from(name, 'utf8');
    const content = Buffer.from(raw);
    const compressed = method === 8 ? deflateRawSync(content) : content;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(filename.length, 26);
    localParts.push(local, filename, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }

  const localBytes = Buffer.concat(localParts);
  const centralBytes = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, end]);
}

test('ZIP importer extracts compressed and stored photos', () => {
  const photos = readPhotoZip(zip([
    ['photos/2026-10-04-170022-motorky.jpg', 'picture-one', 8],
    ['photos/2026-10-04-204027-klub.webp', 'picture-two', 0],
    ['photos/README.md', 'not a picture', 8]
  ]), 'gallery.zip');
  assert.equal(photos.length, 2);
  assert.equal(photos[0].filename, '2026-10-04-170022-motorky.jpg');
  assert.equal(photos[0].data.toString(), 'picture-one');
  assert.equal(photos[1].data.toString(), 'picture-two');
});

test('WhatsApp filenames receive correct timestamp prefixes', () => {
  const photos = readPhotoZip(zip([
    ['SteelBrothers Image/WhatsApp Image 2026-10-04 at 20.40.27.jpeg', 'jpeg-data']
  ]), 'SteelBrothers.zip');
  assert.equal(photos[0].filename, '2026-10-04-204027-steelbrothers-001.jpeg');
});

test('unsafe archive paths are rejected', () => {
  assert.throws(() => readPhotoZip(zip([['../private.jpg', 'bad']]), 'a.zip'),
    /Unsafe ZIP filename/);
});

test('invalid archives cannot be imported', () => {
  assert.throws(() => readPhotoZip(Buffer.from('not a ZIP')), /Invalid ZIP archive/);
});
