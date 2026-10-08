import { inflateRawSync } from 'node:zlib';
import { basename, extname } from 'node:path';

const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const MAX_FILES = 250;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;

export function readPhotoZip(buffer, archiveName = 'photos.zip') {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('Expected ZIP buffer');
  // End-of-central-directory record is within the last 65557 bytes.
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('Invalid ZIP archive');
  const count = buffer.readUInt16LE(end + 10);
  const centralSize = buffer.readUInt32LE(end + 12);
  const centralStart = buffer.readUInt32LE(end + 16);
  if (count > MAX_FILES || centralStart + centralSize > end || centralSize === 0xffffffff) {
    throw new Error('ZIP is too large or unsupported');
  }

  const archiveSlug = basename(archiveName, extname(archiveName))
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 35) || 'album';
  const photos = [];
  let cursor = centralStart;
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Invalid central ZIP entry');
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    if (cursor + 46 + nameLength + extraLength + commentLength > buffer.length) {
      throw new Error('Truncated ZIP filename');
    }
    const rawName = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (rawName.endsWith('/')) continue;
    const normalized = rawName.replace(/\\/g, '/');
    if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
      throw new Error('Unsafe ZIP filename');
    }
    const original = basename(normalized);
    const ext = extname(original).toLowerCase();
    if (!allowed.has(ext)) continue;
    if (flags & 1 || ![0, 8].includes(method) ||
        compressed > MAX_FILE_BYTES || size > MAX_FILE_BYTES ||
        total + size > MAX_TOTAL_BYTES ||
        localOffset + 30 > buffer.length ||
        buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('Encrypted, oversized, or invalid photo in ZIP');
    }

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const stop = start + compressed;
    if (stop > buffer.length) throw new Error('Truncated ZIP photo data');
    const data = method === 8
      ? inflateRawSync(buffer.subarray(start, stop), { maxOutputLength: MAX_FILE_BYTES })
      : buffer.subarray(start, stop);
    if (data.length !== size) throw new Error('Incorrect ZIP photo size');
    total += size;

    // Keep date-prefixed filenames from a prepared archive. WhatsApp's
    // default filenames are converted to sortable YYYY-MM-DD-HHMMSS prefixes.
    const whatsApp = /^WhatsApp Image (\d{4}-\d{2}-\d{2}) at (\d{2})\.(\d{2})\.(\d{2})/i.exec(original);
    let output;
    if (/^\d{4}-\d{2}-\d{2}(?:-|_)/.test(original)) {
      output = original;
    } else if (whatsApp) {
      output = whatsApp[1] + '-' + whatsApp[2] + whatsApp[3] + whatsApp[4]
        + '-' + archiveSlug + '-' + String(i + 1).padStart(3, '0') + ext;
    } else {
      output = archiveSlug + '-' + String(i + 1).padStart(3, '0') + ext;
    }
    photos.push({ filename: output, data });
  }
  if (cursor > centralStart + centralSize) throw new Error('Invalid ZIP index length');
  return photos;
}
