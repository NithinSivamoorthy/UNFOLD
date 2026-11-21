// Unit tests for pure API logic. Run: npm test  (Node >= 22.18 strips TS types natively)
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { parseGenerationRecord } = await import('../src/api/contract.ts');
const { normalizeBaseUrl, validateBaseUrl, isGlbHeader } = await import('../src/api/url.ts');

test('parses a bare generation record', () => {
  assert.deepEqual(parseGenerationRecord({ id: 'g1', status: 'processing', progress: 40 }), {
    id: 'g1', status: 'processing', progress: 40, error: undefined, createdAt: undefined,
  });
});

test('parses a wrapped record and server error message', () => {
  const r = parseGenerationRecord({ generation: { id: 'g2', status: 'failed', message: 'bad image' } });
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'bad image');
});

test('rejects missing id and unknown status', () => {
  assert.throws(() => parseGenerationRecord({ status: 'queued' }), /missing a generation id/);
  assert.throws(() => parseGenerationRecord({ id: 'x', status: 'done' }), /unknown status/);
  assert.throws(() => parseGenerationRecord(null), /missing a generation id/);
});

test('normalizes base URLs', () => {
  assert.equal(normalizeBaseUrl(' 192.168.1.20:8787/ '), 'http://192.168.1.20:8787');
  assert.equal(normalizeBaseUrl('https://unfold.example.com/api/'), 'https://unfold.example.com');
  assert.equal(normalizeBaseUrl(''), '');
});

test('rejects localhost and empty URLs, accepts LAN/HTTPS', () => {
  for (const bad of ['', 'http://localhost:8787', 'http://127.0.0.1:8787', 'http://0.0.0.0:3000', 'ftp://10.0.0.2']) {
    assert.notEqual(validateBaseUrl(bad), null, bad);
  }
  assert.equal(validateBaseUrl('http://192.168.1.20:8787'), null);
  assert.equal(validateBaseUrl('https://unfold.trycloudflare.com'), null);
});

test('detects GLB magic bytes', () => {
  assert.equal(isGlbHeader(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0])), true);
  assert.equal(isGlbHeader(new TextEncoder().encode('<!doctype html>')), false);
  assert.equal(isGlbHeader(new Uint8Array([0x67])), false);
});
