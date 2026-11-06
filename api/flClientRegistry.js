/**
 * flClientRegistry.js — FL Client Registry REST API
 * ===================================================
 *
 * Routes (all mounted at root in index.js):
 *
 *   POST   /fl/clients/bulk           JSON array body
 *   POST   /fl/clients/import         multipart file (.csv/.xlsx/.json)
 *   GET    /fl/clients/template       download sample CSV
 *   GET    /fl/clients/export         export CSV
 *   POST   /fl/clients/seed           generate simulated clients
 *   POST   /fl/select-preview         preview selection without starting a round
 *   POST   /fl/clients                create one client
 *   GET    /fl/clients                list + live scores
 *   GET    /fl/clients/:id            single client
 *   PUT    /fl/clients/:id            edit
 *   DELETE /fl/clients/:id            soft delete (inactive)
 *
 * NOTE: fixed-path routes MUST be registered before /:id — done in index.js.
 *
 * Import pipeline:
 *   multer (memory, 5MB) → parse (csv/xlsx/json) → validate → DB transaction
 *   modes: upsert | insert_only     ?dry_run=true|false    ?strict=true|false
 *   dropout_prob, slowdown_factor → metadata JSONB
 */

'use strict';

require('dotenv').config();

const express  = require('express');
const router   = express.Router();
const { query, pool: dbPool } = require('./db');
const { scoreAllClients, DEFAULT_WEIGHTS, validateWeights } = require('./clientScoring');
const { selectClients } = require('./clientSelector');

const PREFIX = '[fl-clients]';

// ── Try-require upload deps (graceful if not installed yet) ───────────────────
let multer, parse, XLSX;
try { multer = require('multer'); } catch (_) { /* optional */ }
try { parse  = require('csv-parse/sync'); } catch (_) { /* optional */ }
try { XLSX   = require('xlsx'); } catch (_) { /* optional */ }

const upload = multer
  ? multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
  : null;

// ── CSV Column aliases ────────────────────────────────────────────────────────
const ALIASES = {
  id:                  ['id', 'client_id'],
  name:                ['name', 'client_name'],
  cpu_cores:           ['cpu_cores', 'cpu', 'cores', 'cpus'],
  ram_gb:              ['ram_gb', 'ram', 'memory', 'memory_gb'],
  network_latency_ms:  ['network_latency_ms', 'latency', 'latency_ms', 'ping', 'network_latency'],
  bandwidth_mbps:      ['bandwidth_mbps', 'bandwidth', 'bw', 'bw_mbps'],
  dataset_size:        ['dataset_size', 'samples', 'n_samples', 'data_size'],
  data_quality:        ['data_quality', 'quality', 'dq'],
  reliability_prior:   ['reliability_prior', 'reliability', 'prior'],
  status:              ['status'],
  source:              ['source'],
  dropout_prob:        ['dropout_prob', 'dropout'],
  slowdown_factor:     ['slowdown_factor', 'slowdown'],
};

// Build a reverse map: lowercased alias → canonical field name
const ALIAS_MAP = {};
for (const [canonical, aliasList] of Object.entries(ALIASES)) {
  for (const alias of aliasList) {
    ALIAS_MAP[alias.toLowerCase()] = canonical;
  }
}

function resolveHeaders(rawHeaders) {
  const map = {};
  for (const h of rawHeaders) {
    const canonical = ALIAS_MAP[h.trim().toLowerCase()];
    if (canonical) map[canonical] = h;
  }
  return map;
}

// ── Row validation ────────────────────────────────────────────────────────────
function validateRow(row, idx) {
  const errors = [];
  const coerce = (field, fn) => {
    if (row[field] !== undefined && row[field] !== '') {
      const v = fn(row[field]);
      if (v !== null) row[field] = v;
      else errors.push({ row: idx, field, message: `Invalid value: ${row[field]}` });
    }
  };

  // Required
  if (!row.id && !row.client_id)   errors.push({ row: idx, field: 'id', message: 'Required' });
  if (!row.name)                   errors.push({ row: idx, field: 'name', message: 'Required' });

  // Coerce numeric strings
  coerce('cpu_cores',          v => { const n = parseInt(v, 10); return (n >= 1 && n <= 256) ? n : null; });
  coerce('ram_gb',             v => { const n = parseFloat(v);   return (n > 0) ? n : null; });
  coerce('network_latency_ms', v => { const n = parseFloat(v);   return (n >= 0) ? n : null; });
  coerce('bandwidth_mbps',     v => { if (v === '' || v == null) return undefined; const n = parseFloat(v); return (n > 0) ? n : null; });
  coerce('dataset_size',       v => { const n = parseInt(v, 10); return (n >= 1) ? n : null; });
  coerce('data_quality',       v => { const n = parseFloat(v);   return (n >= 0 && n <= 1) ? n : null; });
  coerce('reliability_prior',  v => { if (v === '' || v == null) return undefined; const n = parseFloat(v); return (n >= 0 && n <= 1) ? n : null; });
  coerce('dropout_prob',       v => { if (v === '' || v == null) return undefined; const n = parseFloat(v); return (n >= 0 && n <= 1) ? n : null; });
  coerce('slowdown_factor',    v => { if (v === '' || v == null) return undefined; const n = parseFloat(v); return (n >= 1) ? n : null; });

  if (row.status && !['active','inactive','blacklisted'].includes(row.status)) {
    errors.push({ row: idx, field: 'status', message: `Invalid status '${row.status}'` });
  }
  if (row.source && !['manual','csv','xlsx','json','simulated'].includes(row.source)) {
    errors.push({ row: idx, field: 'source', message: `Invalid source '${row.source}'` });
  }

  return errors;
}

// ── Parse helpers ─────────────────────────────────────────────────────────────
function parseCSV(buffer) {
  if (!parse) throw { code: 503, message: 'csv-parse not installed. Run: npm install csv-parse' };
  const text = buffer.toString('utf8').replace(/^\uFEFF/, ''); // strip BOM
  const records = parse.parse(text, { columns: true, skip_empty_lines: true, trim: true });
  return records;
}

function parseXLSX(buffer) {
  if (!XLSX) throw { code: 503, message: 'xlsx not installed. Run: npm install xlsx' };
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]]; // first sheet only
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function parseJSON(buffer) {
  const text = buffer.toString('utf8');
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw { code: 400, message: 'JSON body must be an array of objects' };
  return data;
}

function parseByMimeOrExt(file) {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.csv'))  return parseCSV(file.buffer);
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseXLSX(file.buffer);
  if (name.endsWith('.json')) return parseJSON(file.buffer);
  // Fallback by mimetype
  if ((file.mimetype || '').includes('csv'))  return parseCSV(file.buffer);
  if ((file.mimetype || '').includes('json')) return parseJSON(file.buffer);
  if ((file.mimetype || '').includes('sheet')) return parseXLSX(file.buffer);
  throw { code: 400, message: `Unsupported file type: ${file.originalname}` };
}

// Normalise an imported row's keys using the alias map
function normaliseRow(rawRow, headerMap) {
  const out = {};
  for (const [rawKey, value] of Object.entries(rawRow)) {
    const canonical = headerMap[rawKey] || ALIAS_MAP[rawKey.trim().toLowerCase()];
    if (canonical) out[canonical] = value === '' ? undefined : value;
  }
  return out;
}

// ── DB upsert / insert helpers ────────────────────────────────────────────────
function rowToParams(row, defaultSource = 'csv') {
  const meta = {};
  if (row.dropout_prob   !== undefined) meta.dropout_prob   = row.dropout_prob;
  if (row.slowdown_factor !== undefined) meta.slowdown_factor = row.slowdown_factor;

  return {
    client_id:           row.id || row.client_id,
    name:                row.name,
    status:              row.status              || 'active',
    cpu_cores:           row.cpu_cores           ?? 2,
    ram_gb:              row.ram_gb              ?? 4,
    network_latency_ms:  row.network_latency_ms  ?? 100,
    bandwidth_mbps:      row.bandwidth_mbps      ?? null,
    dataset_size:        row.dataset_size        ?? 100,
    data_quality:        row.data_quality        ?? 0.8,
    reliability_prior:   row.reliability_prior   ?? null,
    source:              row.source              || defaultSource,
    metadata:            JSON.stringify(meta),
  };
}

async function upsertClient(client, dbClient) {
  const exec = dbClient ? (q, p) => dbClient.query(q, p) : (q, p) => query(q, p);
  await exec(
    `INSERT INTO fl_clients
       (client_id, name, status, cpu_cores, ram_gb, network_latency_ms, bandwidth_mbps,
        dataset_size, data_quality, reliability_prior, source, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (client_id) DO UPDATE SET
       name               = EXCLUDED.name,
       status             = EXCLUDED.status,
       cpu_cores          = EXCLUDED.cpu_cores,
       ram_gb             = EXCLUDED.ram_gb,
       network_latency_ms = EXCLUDED.network_latency_ms,
       bandwidth_mbps     = EXCLUDED.bandwidth_mbps,
       dataset_size       = EXCLUDED.dataset_size,
       data_quality       = EXCLUDED.data_quality,
       reliability_prior  = EXCLUDED.reliability_prior,
       source             = EXCLUDED.source,
       metadata           = EXCLUDED.metadata,
       updated_at         = now()`,
    [
      client.client_id, client.name, client.status, client.cpu_cores,
      client.ram_gb, client.network_latency_ms, client.bandwidth_mbps,
      client.dataset_size, client.data_quality, client.reliability_prior,
      client.source, client.metadata,
    ]
  );
}

async function insertClientOnly(client, dbClient) {
  const exec = dbClient ? (q, p) => dbClient.query(q, p) : (q, p) => query(q, p);
  await exec(
    `INSERT INTO fl_clients
       (client_id, name, status, cpu_cores, ram_gb, network_latency_ms, bandwidth_mbps,
        dataset_size, data_quality, reliability_prior, source, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      client.client_id, client.name, client.status, client.cpu_cores,
      client.ram_gb, client.network_latency_ms, client.bandwidth_mbps,
      client.dataset_size, client.data_quality, client.reliability_prior,
      client.source, client.metadata,
    ]
  );
}

// ── Helper: fetch active pool for scoring ─────────────────────────────────────
async function getActivePool() {
  return query(`SELECT * FROM fl_clients WHERE status = 'active'`);
}

// ── Helper: map DB row → API response (client_id → id) ───────────────────────
function mapClient(row, scoreEntry = null) {
  const base = {
    id:                 row.client_id,
    name:               row.name,
    status:             row.status,
    cpu_cores:          row.cpu_cores,
    ram_gb:             row.ram_gb,
    network_latency_ms: row.network_latency_ms,
    bandwidth_mbps:     row.bandwidth_mbps,
    dataset_size:       row.dataset_size,
    data_quality:       row.data_quality,
    reliability_prior:  row.reliability_prior,
    total_rounds:       row.total_rounds,
    successful_rounds:  row.successful_rounds,
    failure_count:      row.failure_count,
    consecutive_failures: row.consecutive_failures,
    cooldown_rounds_left: row.cooldown_rounds_left,
    source:             row.source,
    metadata:           row.metadata,
    created_at:         row.created_at,
    updated_at:         row.updated_at,
  };
  if (scoreEntry) {
    base.score     = scoreEntry.total;
    base.breakdown = scoreEntry.breakdown;
    base.rank      = scoreEntry.rank;
  }
  return base;
}

// ── Batch import pipeline ─────────────────────────────────────────────────────
async function runImport({ rows, source, mode, dryRun, strict }) {
  const inserted = [], updated = [], skipped = [], errors = [];
  const seenIds = new Set();

  // Detect headers
  const sampleRow  = rows[0] || {};
  const headerMap  = resolveHeaders(Object.keys(sampleRow));

  // Find existing client_ids for upsert check
  const existingRes = await query(`SELECT client_id FROM fl_clients`);
  const existing    = new Set(existingRes.map(r => r.client_id));

  const dbClient = dryRun ? null : await dbPool.connect();
  try {
    if (!dryRun) await dbClient.query('BEGIN');

    for (let i = 0; i < rows.length; i++) {
      const normalised = normaliseRow(rows[i], headerMap);
      const rowErrors  = validateRow(normalised, i + 1);

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        if (strict) {
          if (!dryRun) { await dbClient.query('ROLLBACK'); }
          return { inserted, updated, skipped, errors, aborted: true };
        }
        skipped.push(i + 1);
        continue;
      }

      const cid = normalised.id || normalised.client_id;

      // Duplicate within the file
      if (seenIds.has(cid)) {
        errors.push({ row: i + 1, field: 'id', message: `Duplicate id in file: ${cid}` });
        if (strict) {
          if (!dryRun) { await dbClient.query('ROLLBACK'); }
          return { inserted, updated, skipped, errors, aborted: true };
        }
        skipped.push(i + 1);
        continue;
      }
      seenIds.add(cid);

      const params = rowToParams(normalised, source);

      if (existing.has(cid)) {
        if (mode === 'insert_only') {
          errors.push({ row: i + 1, field: 'id', message: `Already exists (insert_only): ${cid}` });
          skipped.push(i + 1);
          continue;
        }
        if (!dryRun) await upsertClient(params, dbClient);
        updated.push(cid);
      } else {
        if (!dryRun) await upsertClient(params, dbClient);
        inserted.push(cid);
        existing.add(cid); // prevent later rows from thinking it doesn't exist
      }
    }

    if (!dryRun) await dbClient.query('COMMIT');
  } catch (err) {
    if (!dryRun && dbClient) await dbClient.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (!dryRun && dbClient) dbClient.release();
  }

  return { inserted, updated, skipped, errors, aborted: false, dry_run: dryRun };
}

// ── Simulated client profiles ─────────────────────────────────────────────────
function generateSimulatedClient(i, profile, rng) {
  const profiles = {
    mixed: () => ({
      cpu_cores:          Math.floor(rng() * 14) + 2,       // 2–16
      ram_gb:             Math.round((rng() * 28 + 4) * 10) / 10, // 4–32
      network_latency_ms: Math.round(rng() * 285 + 15),     // 15–300
      bandwidth_mbps:     Math.round(rng() * 990 + 10),     // 10–1000
      dataset_size:       Math.floor(rng() * 9900) + 100,   // 100–10000
      data_quality:       parseFloat((rng() * 0.5 + 0.5).toFixed(2)), // 0.50–1.00
      dropout_prob:       parseFloat((rng() * 0.3).toFixed(2)),        // 0–0.3
      slowdown_factor:    parseFloat((rng() * 2 + 1).toFixed(2)),      // 1–3
      reliability_target: 0.5 + rng() * 0.5,
    }),
    reliable: () => ({
      cpu_cores:          Math.floor(rng() * 8) + 8,        // 8–16
      ram_gb:             Math.round((rng() * 16 + 16) * 10) / 10, // 16–32
      network_latency_ms: Math.round(rng() * 85 + 15),      // 15–100
      bandwidth_mbps:     Math.round(rng() * 500 + 500),    // 500–1000
      dataset_size:       Math.floor(rng() * 5000) + 5000,  // 5000–10000
      data_quality:       parseFloat((rng() * 0.2 + 0.8).toFixed(2)), // 0.80–1.00
      dropout_prob:       parseFloat((rng() * 0.05).toFixed(2)),       // 0–0.05
      slowdown_factor:    parseFloat((rng() * 0.5 + 1).toFixed(2)),    // 1–1.5
      reliability_target: 0.85 + rng() * 0.15,
    }),
    flaky: () => ({
      cpu_cores:          Math.floor(rng() * 6) + 1,        // 1–6
      ram_gb:             Math.round((rng() * 12 + 1) * 10) / 10,  // 1–13
      network_latency_ms: Math.round(rng() * 200 + 100),    // 100–300
      bandwidth_mbps:     Math.round(rng() * 90 + 10),      // 10–100
      dataset_size:       Math.floor(rng() * 900) + 100,    // 100–1000
      data_quality:       parseFloat((rng() * 0.4 + 0.3).toFixed(2)), // 0.30–0.70
      dropout_prob:       parseFloat((rng() * 0.4 + 0.2).toFixed(2)), // 0.20–0.60
      slowdown_factor:    parseFloat((rng() * 4 + 2).toFixed(2)),     // 2–6
      reliability_target: 0.2 + rng() * 0.4,
    }),
  };

  const profileFn = profiles[profile] || profiles.mixed;
  const p         = profileFn();
  const reliabilityTarget = p.reliability_target || 0.7;

  // Seed success/failure counts from reliability_target to produce realistic Laplace scores
  const totalRounds       = Math.floor(rng() * 50 + 20); // 20–70
  const successfulRounds  = Math.round(totalRounds * reliabilityTarget);

  return {
    client_id:          `fl-sim-${String(i).padStart(3, '0')}-${Math.floor(rng()*9000+1000)}`,
    name:               `Sim-${profile.charAt(0).toUpperCase() + profile.slice(1)}-${String(i).padStart(3, '0')}`,
    status:             'active',
    cpu_cores:          p.cpu_cores,
    ram_gb:             p.ram_gb,
    network_latency_ms: p.network_latency_ms,
    bandwidth_mbps:     p.bandwidth_mbps,
    dataset_size:       p.dataset_size,
    data_quality:       p.data_quality,
    reliability_prior:  parseFloat(reliabilityTarget.toFixed(3)),
    total_rounds:       totalRounds,
    successful_rounds:  successfulRounds,
    failure_count:      totalRounds - successfulRounds,
    consecutive_failures: 0,
    cooldown_rounds_left: 0,
    source:             'simulated',
    metadata:           JSON.stringify({ dropout_prob: p.dropout_prob, slowdown_factor: p.slowdown_factor }),
  };
}

// ── CSV Template ──────────────────────────────────────────────────────────────
const CSV_TEMPLATE_HEADER = 'id,name,cpu_cores,ram_gb,network_latency_ms,bandwidth_mbps,dataset_size,data_quality,reliability_prior,status,source,dropout_prob,slowdown_factor';
const CSV_TEMPLATE_ROWS   = [
  'client-alpha,Alpha Node,8,16,50,500,5000,0.90,0.92,active,manual,0.05,1.2',
  'client-beta,Beta Node,4,8,100,200,2000,0.75,0.78,active,manual,0.10,1.5',
];
const CSV_TEMPLATE = [CSV_TEMPLATE_HEADER, ...CSV_TEMPLATE_ROWS].join('\n');

// ═════════════════════════════════════════════════════════════════════════════
//  ROUTES  (fixed-path routes MUST stay above /:id — mount order in index.js)
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /fl/clients/template ──────────────────────────────────────────────────
router.get('/clients/template', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="fl_clients_template.csv"');
  res.send(CSV_TEMPLATE);
});

// ── GET /fl/clients/export ────────────────────────────────────────────────────
router.get('/clients/export', async (_req, res, next) => {
  try {
    const rows = await query(`SELECT * FROM fl_clients ORDER BY client_id`);
    const lines = [CSV_TEMPLATE_HEADER];
    for (const r of rows) {
      const meta = r.metadata || {};
      lines.push([
        r.client_id, r.name, r.cpu_cores, r.ram_gb, r.network_latency_ms,
        r.bandwidth_mbps ?? '', r.dataset_size, r.data_quality,
        r.reliability_prior ?? '', r.status, r.source,
        meta.dropout_prob ?? '', meta.slowdown_factor ?? '',
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="fl_clients_export.csv"');
    res.send(lines.join('\n'));
  } catch (err) { next(err); }
});

// ── POST /fl/clients/bulk ─────────────────────────────────────────────────────
router.post('/clients/bulk', async (req, res, next) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Body must be a non-empty JSON array' });
    }
    console.log(`${PREFIX} bulk insert — ${rows.length} rows`);
    const result = await runImport({
      rows, source: 'manual', mode: 'upsert', dryRun: false, strict: false,
    });
    res.json({ message: 'Bulk import complete', ...result });
  } catch (err) { next(err); }
});

// ── POST /fl/clients/import ───────────────────────────────────────────────────
router.post('/clients/import', (req, res, next) => {
  if (!upload) {
    return res.status(503).json({ error: 'File upload not available (multer not installed)' });
  }
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    if (!req.file)  return res.status(400).json({ error: 'No file uploaded (field name: "file")' });

    try {
      const mode    = req.query.mode    === 'insert_only' ? 'insert_only' : 'upsert';
      const dryRun  = req.query.dry_run === 'true';
      const strict  = req.query.strict  === 'true';
      const ext     = (req.file.originalname || '').split('.').pop().toLowerCase();
      const source  = ['xlsx','xls'].includes(ext) ? 'xlsx' : ext === 'json' ? 'json' : 'csv';

      console.log(`${PREFIX} import ${req.file.originalname} mode=${mode} dry_run=${dryRun} strict=${strict}`);
      const rows   = parseByMimeOrExt(req.file);
      const result = await runImport({ rows, source, mode, dryRun, strict });

      res.json({ file: req.file.originalname, rows_parsed: rows.length, ...result });
    } catch (err) { next(err); }
  });
});

// ── POST /fl/clients/seed ─────────────────────────────────────────────────────
router.post('/clients/seed', async (req, res, next) => {
  try {
    const { count = 10, profile = 'mixed', seed = Date.now() } = req.body;
    const n = Math.min(Math.max(parseInt(count, 10) || 10, 1), 100);

    const { mulberry32: mb, seedToUint32: s2u } = require('./clientSelector');
    const rng = mb(s2u(seed));

    console.log(`${PREFIX} seed ${n} clients profile=${profile} seed=${seed}`);

    const clients = [];
    for (let i = 1; i <= n; i++) clients.push(generateSimulatedClient(i, profile, rng));

    const dbClient = await dbPool.connect();
    try {
      await dbClient.query('BEGIN');
      for (const c of clients) {
        await dbClient.query(
          `INSERT INTO fl_clients
             (client_id, name, status, cpu_cores, ram_gb, network_latency_ms, bandwidth_mbps,
              dataset_size, data_quality, reliability_prior, total_rounds, successful_rounds,
              failure_count, consecutive_failures, cooldown_rounds_left, source, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           ON CONFLICT (client_id) DO UPDATE SET
             status = EXCLUDED.status, cpu_cores = EXCLUDED.cpu_cores,
             ram_gb = EXCLUDED.ram_gb, network_latency_ms = EXCLUDED.network_latency_ms,
             bandwidth_mbps = EXCLUDED.bandwidth_mbps, dataset_size = EXCLUDED.dataset_size,
             data_quality = EXCLUDED.data_quality, reliability_prior = EXCLUDED.reliability_prior,
             total_rounds = EXCLUDED.total_rounds, successful_rounds = EXCLUDED.successful_rounds,
             failure_count = EXCLUDED.failure_count, source = EXCLUDED.source,
             metadata = EXCLUDED.metadata, updated_at = now()`,
          [
            c.client_id, c.name, c.status, c.cpu_cores, c.ram_gb, c.network_latency_ms,
            c.bandwidth_mbps, c.dataset_size, c.data_quality, c.reliability_prior,
            c.total_rounds, c.successful_rounds, c.failure_count, c.consecutive_failures,
            c.cooldown_rounds_left, c.source, c.metadata,
          ]
        );
      }
      await dbClient.query('COMMIT');
    } catch (e) { await dbClient.query('ROLLBACK'); throw e; }
    finally     { dbClient.release(); }

    res.json({ message: `Seeded ${clients.length} clients`, count: clients.length, profile, seed, clients: clients.map(c => ({ id: c.client_id, name: c.name })) });
  } catch (err) { next(err); }
});

// ── POST /fl/select-preview ───────────────────────────────────────────────────
router.post('/select-preview', async (req, res, next) => {
  try {
    let { strategy = 'intelligent', k = 5, weights = DEFAULT_WEIGHTS, seed } = req.body;
    if (weights) validateWeights(weights);

    const pool   = await getActivePool();
    const result = await selectClients({ strategy, k, weights, pool, seed });

    res.json({
      strategy,
      k_requested:    result.k_requested,
      k_selected:     result.k_selected,
      eligible_count: result.eligible_count,
      total_pool:     result.total_count,
      warning:        result.warning,
      selected: result.selected.map(s => ({
        id:        s.client_id,
        rank:      s.rank,
        score:     s.total,
        breakdown: s.breakdown,
        reason:    s.reason,
      })),
      all: result.all.map(s => ({
        id:        s.client_id,
        rank:      s.rank,
        score:     s.total,
        breakdown: s.breakdown,
        selected:  s.selected,
        reason:    s.reason,
      })),
    });
  } catch (err) { next(err); }
});

// ── POST /fl/clients ──────────────────────────────────────────────────────────
router.post('/clients', async (req, res, next) => {
  try {
    const row    = req.body;
    const errors = validateRow(row, 1);
    if (errors.length > 0) return res.status(400).json({ error: errors[0].message, details: errors });

    const params = rowToParams(row, 'manual');
    console.log(`${PREFIX} create client ${params.client_id}`);

    await upsertClient(params);
    const rows = await query(`SELECT * FROM fl_clients WHERE client_id = $1`, [params.client_id]);
    res.status(201).json({ client: mapClient(rows[0]) });
  } catch (err) { next(err); }
});

// ── GET /fl/clients ───────────────────────────────────────────────────────────
router.get('/clients', async (req, res, next) => {
  try {
    const { status, source } = req.query;
    let sql    = `SELECT * FROM fl_clients WHERE 1=1`;
    const args = [];
    if (status) { args.push(status); sql += ` AND status = $${args.length}`; }
    if (source) { args.push(source); sql += ` AND source = $${args.length}`; }
    sql += ` ORDER BY client_id`;

    const rows = await query(sql, args);
    const pool = rows.filter(r => r.status === 'active');
    const scored = scoreAllClients(rows, DEFAULT_WEIGHTS, pool);
    const scoreMap = Object.fromEntries(scored.map(s => [s.client_id, s]));

    res.json({ clients: rows.map(r => mapClient(r, scoreMap[r.client_id])), total: rows.length });
  } catch (err) { next(err); }
});

// ── GET /fl/clients/:id ───────────────────────────────────────────────────────
router.get('/clients/:id', async (req, res, next) => {
  try {
    const rows = await query(`SELECT * FROM fl_clients WHERE client_id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: `Client '${req.params.id}' not found` });

    const pool   = await getActivePool();
    const scored = scoreAllClients(rows, DEFAULT_WEIGHTS, pool);
    res.json({ client: mapClient(rows[0], scored[0]) });
  } catch (err) { next(err); }
});

// ── PUT /fl/clients/:id ───────────────────────────────────────────────────────
router.put('/clients/:id', async (req, res, next) => {
  try {
    const rows = await query(`SELECT * FROM fl_clients WHERE client_id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: `Client '${req.params.id}' not found` });

    const merged = { ...rows[0], ...req.body, id: req.params.id };
    const errors = validateRow(merged, 1);
    if (errors.length > 0) return res.status(400).json({ error: errors[0].message, details: errors });

    const params = rowToParams(merged, rows[0].source || 'manual');
    await upsertClient(params);

    const updated = await query(`SELECT * FROM fl_clients WHERE client_id = $1`, [req.params.id]);
    res.json({ client: mapClient(updated[0]) });
  } catch (err) { next(err); }
});

// ── DELETE /fl/clients/:id ────────────────────────────────────────────────────
router.delete('/clients/:id', async (req, res, next) => {
  try {
    const rows = await query(`SELECT 1 FROM fl_clients WHERE client_id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: `Client '${req.params.id}' not found` });

    await query(`UPDATE fl_clients SET status = 'inactive', updated_at = now() WHERE client_id = $1`, [req.params.id]);
    console.log(`${PREFIX} soft-deleted ${req.params.id}`);
    res.json({ message: `Client '${req.params.id}' marked inactive` });
  } catch (err) { next(err); }
});

module.exports = router;
