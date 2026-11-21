#!/usr/bin/env node
// End-to-end contract check against the REAL UNFOLD server (no mocks).
//   npm run check:backend -- http://<laptop-LAN-IP>:<port> path/to/photo.jpg [out.glb]
// Uses the same response parser and GLB check as the app, so a pass here means the app's client
// will accept the server's responses.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const { parseGenerationRecord, IMAGE_FIELD } = await import('../src/api/contract.ts');
const { normalizeBaseUrl, validateBaseUrl, isGlbHeader } = await import('../src/api/url.ts');

const [rawUrl, imagePath, out = 'generated.glb'] = process.argv.slice(2);
if (!rawUrl || !imagePath) {
  console.error('usage: npm run check:backend -- <baseUrl> <image.jpg> [out.glb]');
  process.exit(2);
}
const base = normalizeBaseUrl(rawUrl);
const problem = validateBaseUrl(base);
if (problem && !/localhost/.test(problem)) throw new Error(problem); // localhost is fine from the laptop itself

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
async function json(res, label) {
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${text.slice(0, 300)}`);
  if (!type.includes('json')) throw new Error(`${label}: expected JSON, got "${type}"`);
  return parseGenerationRecord(JSON.parse(text));
}

log(`server ${base}`);
const health = await fetch(`${base}/api/health`).then((r) => r.status, (e) => `unreachable (${e.cause?.code ?? e.message})`);
log(`GET /api/health -> ${health}`);
if (typeof health !== 'number') process.exit(1);

const bytes = readFileSync(imagePath);
const type = /\.png$/i.test(imagePath) ? 'image/png' : 'image/jpeg';
const form = new FormData();
form.append(IMAGE_FIELD, new Blob([bytes], { type }), basename(imagePath));
let rec = await json(await fetch(`${base}/api/generations`, { method: 'POST', body: form }), 'POST /api/generations');
log(`POST /api/generations -> id=${rec.id} status=${rec.status}`);

while (rec.status === 'queued' || rec.status === 'processing') {
  await new Promise((r) => setTimeout(r, 2500));
  rec = await json(await fetch(`${base}/api/generations/${encodeURIComponent(rec.id)}`), 'GET /api/generations/:id');
  log(`status=${rec.status}${rec.progress != null ? ` progress=${rec.progress}` : ''}`);
}
if (rec.status === 'failed') {
  log(`FAILED: ${rec.error ?? '(no error message)'}`);
  process.exit(1);
}

const res = await fetch(`${base}/api/generations/${encodeURIComponent(rec.id)}/model`);
const glb = new Uint8Array(await res.arrayBuffer());
log(`GET /:id/model -> HTTP ${res.status} ${res.headers.get('content-type')} ${(glb.length / 1024).toFixed(0)} KB`);
if (!res.ok || !isGlbHeader(glb)) {
  log('FAIL: model endpoint did not return a GLB');
  process.exit(1);
}
writeFileSync(out, glb);
log(`PASS: real GLB saved to ${out}`);
