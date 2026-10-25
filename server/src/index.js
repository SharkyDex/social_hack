// ─────────────────────────────────────────────────────────────
//  DisasterBridge server — the API every module talks to.
//  Holds the shared AI key, runs calls, keeps the case list.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT } from './config.js';
import * as store from './store.js';
import { sseHandler } from './events.js';
import { aiMode, reasoningEnabled } from './ai/groq.js';
import { provider } from './telephony/index.js';
import * as webcall from './telephony/webcall.js';
import * as engine from './calls/engine.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

const loaded = store.load();
setInterval(store.rescoreAll, 60_000).unref(); // "no contact for 1h+" changes with time

const meta = () => ({
  aiMode: aiMode(),
  model: aiMode() === 'groq' ? config.groqModel : null,
  reasoningModel: reasoningEnabled() ? config.reasoning.model : null,
  telephony: provider().name,
  demoNumberSet: Boolean(config.demoPhoneNumber),
  maxAttempts: config.maxAttempts,
  retryDelaySeconds: config.retryDelayMs / 1000,
  agencyName: config.agencyName,
  dataset: store.getDatasetInfo(),
  round: engine.getRound(),
});

const ok = (fn) => async (req, res) => res.json(await fn(req));

// ── Reads ────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, ...meta() }));
app.get('/api/state', (req, res) =>
  res.json({ meta: meta(), cases: store.listCases(), calls: store.listCalls(), responders: store.listResponders(), devices: engine.listDevices() }),
);
app.get('/api/cases', (req, res) => {
  // ?limit=50&offset=0 — ready for the 100k dataset
  const all = store.listCases();
  const offset = Number(req.query.offset) || 0;
  const limit = Number(req.query.limit) || all.length;
  res.json({ total: all.length, cases: all.slice(offset, offset + limit) });
});
app.get('/api/cases/:id', (req, res) => {
  const c = store.caseView(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});
app.get('/api/calls', (req, res) => res.json(store.listCalls()));
app.get('/api/calls/:id', (req, res) => {
  const c = store.getCall(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  res.json(c);
});
app.get('/api/responders', (req, res) => res.json(store.listResponders()));
app.get('/api/events', sseHandler);

// ── Welfare calls ────────────────────────────────────────────
// body: { mode: 'auto'|'interactive', channel?: 'voice'|'sms', target?: 'resident'|'emergency_contact' }
app.post('/api/cases/:id/call', ok((req) => engine.startWelfareCheck(req.params.id, { ...req.body, reason: 'manual' }).call));
app.post('/api/cases/:id/text', ok((req) => engine.startWelfareCheck(req.params.id, { mode: req.body?.mode, channel: 'sms', reason: 'manual' }).call));
app.post('/api/cases/:id/call-contact', ok((req) => engine.startWelfareCheck(req.params.id, { mode: req.body?.mode, target: 'emergency_contact', reason: 'manual' }).call));
app.post('/api/calls/:id/reply', ok((req) => engine.replyToCall(req.params.id, String(req.body?.text || '').trim())));
app.post('/api/calls/:id/hangup', ok((req) => engine.hangUp(req.params.id)));
app.post('/api/rounds/start', ok((req) => engine.startRound(req.body || {}) && engine.getRound()));
app.post('/api/rounds/stop', ok(() => engine.stopRound() && engine.getRound()));
// body: { mode: 'auto'|'interactive', operatorAvailable?: boolean }
app.post('/api/inbound/simulate', ok((req) => engine.simulateInbound(req.body || {})));

// ── Web calls (live call to a connected phone over the internet) ─
app.get('/api/devices', (req, res) => res.json(engine.listDevices()));
// body: { deviceId, name?, personId? }
app.post('/api/webcall', ok((req) => {
  if (aiMode() !== 'groq') {
    throw Object.assign(new Error('Live web calls need a GROQ_API_KEY (speech-to-text + the AI). Add one to .env and restart.'), { status: 400 });
  }
  return engine.startWebCall(req.body || {});
}));

// ── Dispatcher actions ───────────────────────────────────────
app.post('/api/cases/:id/assign', ok((req) => engine.assignResponder(req.params.id, req.body?.responderId)));
app.post('/api/cases/:id/release', ok((req) => engine.releaseResponder(req.params.id)));
app.post('/api/cases/:id/safe', ok((req) => engine.markSafe(req.params.id)));
app.post('/api/cases/:id/reopen', ok((req) => engine.reopen(req.params.id)));
app.post('/api/cases/:id/notes', ok((req) => engine.addNote(req.params.id, req.body?.text)));

// ── Integration hooks for the other modules ─────────────────
// 3D simulation → body: [{ personId, buildingDamage?, intensity?, gasLeak?, fire?, roadsBlocked?, powerOut? }]
app.post('/api/hazards', ok((req) => engine.applyHazards(Array.isArray(req.body) ? req.body : req.body?.hazards)));
// Completed 3D zone simulation → match zone status/category to each resident's zone.
app.post('/api/zone-report', ok((req) => store.applyZoneReport(req.body || {})));

app.post('/api/reset', ok(() => engine.reset()));

// ── Production: serve the built apps from the same port ─────
// The resident phone app (PWA) lives under /resident; register it before the
// dispatcher catch-all so those paths aren't swallowed.
const residentDist = join(ROOT, 'resident', 'dist');
if (existsSync(residentDist)) {
  app.use('/resident', express.static(residentDist));
  app.get(/^\/resident(?:\/.*)?$/, (req, res) => res.sendFile(join(residentDist, 'index.html')));
}
const dist = join(ROOT, 'client', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});

const server = app.listen(config.port, () => {
  console.log(`DisasterBridge server on http://localhost:${config.port}`);
  const of = loaded.datasetSize > loaded.people ? ` (sample of ${loaded.datasetSize.toLocaleString()})` : '';
  console.log(`  ${loaded.people} people${of} · ${loaded.responders} responders · AI: ${aiMode()} · phone: ${provider().name}`);
});
webcall.attach(server); // live web calls to connected phones (/ws)
