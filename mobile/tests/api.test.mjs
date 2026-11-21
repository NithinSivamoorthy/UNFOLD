// Unit tests for pure API logic. Run: npm test  (Node >= 22.18 strips TS types natively)
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { parseGenerationRecord } = await import('../src/api/contract.ts');
const { normalizeBaseUrl, validateBaseUrl, isGlbHeader } = await import('../src/api/url.ts');

test('maps backend statuses and fields from shared/contracts', () => {
  assert.deepEqual(parseGenerationRecord({ id: 'g1', status: 'running', progress: 40, createdAt: 't' }), {
    id: 'g1', status: 'processing', progress: 40, error: undefined, createdAt: 't',
  });
  assert.equal(parseGenerationRecord({ id: 'g0', status: 'queued', progress: 0 }).status, 'queued');
  const done = parseGenerationRecord({ id: 'g2', status: 'succeeded', progress: 100, modelUrl: '/api/generations/g2/model' });
  assert.equal(done.status, 'succeeded');
  assert.equal(done.progress, 100);
});

test('failed and expired generations surface the server errorMessage', () => {
  const failed = parseGenerationRecord({ id: 'g3', status: 'failed', progress: 10, errorMessage: 'Tripo task banned.' });
  assert.deepEqual([failed.status, failed.error], ['failed', 'Tripo task banned.']);
  const expired = parseGenerationRecord({ id: 'g4', status: 'expired', progress: 0, errorMessage: 'Generation record expired after 24 hours.' });
  assert.deepEqual([expired.status, expired.error], ['failed', 'Generation record expired after 24 hours.']);
});

test('rejects missing id and statuses outside the contract', () => {
  assert.throws(() => parseGenerationRecord({ status: 'queued' }), /missing a generation id/);
  assert.throws(() => parseGenerationRecord({ id: 'x', status: 'processing' }), /unknown status/);
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
  assert.equal(validateBaseUrl('http://10.0.0.5:3000'), null);
});

test('rejects the Expo Metro tunnel and dev-server ports as the API address', () => {
  assert.match(validateBaseUrl('https://c-abc-1jerm6-mwqt1lh7q9oupqrm.on.expo.app'), /Metro/);
  assert.match(validateBaseUrl('https://abc.exp.direct'), /Metro/);
  assert.match(validateBaseUrl('http://10.245.176.18:8082'), /Expo dev server port/);
});

test('detects GLB magic bytes', () => {
  assert.equal(isGlbHeader(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0])), true);
  assert.equal(isGlbHeader(new TextEncoder().encode('<!doctype html>')), false);
  assert.equal(isGlbHeader(new Uint8Array([0x67])), false);
});
