// Tech Bench parts lookup: Cat CCE parts index.
// Pure data + functions (no DOM, no store) so they can be tested in Node.
//  - SEED: the starter index from "Cat CCE Parts Reference for Claude" (public references only,
//    nothing here is SIS 2.0 data). One row per exact model, so 299D3 and 299D3 XE never merge.
//  - COLS: the CSV header used to import SIS 2.0 extracts. Imported rows become synced 'part' records.

export const COLS = ['family', 'model', 'serial_prefix', 'serial_start', 'serial_end', 'configuration', 'system', 'group_number', 'group_name', 'diagram_id', 'item_number', 'part_number', 'part_description', 'parent_part_number', 'quantity', 'side', 'related_seal', 'replaced_by', 'aliases', 'source_type', 'source_reference', 'source_page', 'source_revision', 'verified_on', 'fitment_status', 'notes'];

export const SOURCES = {
  A: { name: 'Cat strainer listing (parts.cat.com)', url: 'https://parts.cat.com/en/catcorp/262-5689', grade: 'cat' },
  B: { name: 'Hydraulic schematic M0105421-03, Vol. 2 (labels 39 breather, 58 strainer, 59 tank; schematic labels are not parts item numbers)', url: 'https://www.slideshare.net/slideshow/plano-hydpdf/259245572', grade: 'third-party copy' },
  C: { name: 'Cat seal listing (parts.cat.com)', url: 'https://parts.cat.com/en/catcorp/product/135-7940', grade: 'cat' },
  D: { name: '236D3 Parts Manual M0087435-00, printed p. 337, item 8 + seal, under 579-7921 Tank & Mtg Gp-Hydraulic (236D3 only)', url: 'https://pdfcoffee.com/parts-manual-236d3-skid-steer-loader-3-pdf-free.html', grade: 'third-party copy' },
  E: { name: 'Cat tank group listing (parts.cat.com)', url: 'https://parts.cat.com/en/catcorp/product/345-4581', grade: 'cat' },
  F: { name: 'Cat service filter listing (parts.cat.com)', url: 'https://parts.cat.com/en/catcorp/product/421-5479', grade: 'cat' },
  G: { name: 'Cat D3 Parts Reference Guide PEDJ0859', url: 'https://s7d2.scene7.com/is/content/Caterpillar/CM20211022-fbb27-6c0ba', grade: 'cat' }
};

export const LINKS = [
  ['SIS 2.0', 'https://sis2.cat.com/', 'Sign in, select the exact PIN, open Parts, find the system and group. Capture the illustration and BOM with the group header and serial applicability.'],
  ['SIS2GO', 'https://www.cat.com/sis2go', ''],
  ['Cat Parts diagrams', 'https://parts.cat.com/en/catcorp/parts-diagram', 'Serial-filtered diagrams.'],
  ['Cat public parts guides', 'https://www.cat.com/en_US/support/maintenance/parts-reference-guides.html', 'Candidates only, not order-ready fitment.'],
  ['299D3 XE parts manual preview M0104291', 'https://catpublications.com/previews/M0104291EN-US.pdf', 'Identifies publications and applicability only.']
];

// Serial prefixes listed in the public D3 guide (PEDJ0859). Not SIS coverage.
export const PREFIXES = {
  '299D3': ['DY9', 'CY9', 'P3R', 'JX3'],
  '299D3 XE': ['BX9', 'B62', 'AN9', 'GX9', 'LB3', 'S38', 'R23', 'XES']
};

const seed = (models, part_number, part_description, aliases, source_reference, fitment_status, extra = {}) =>
  models.map(model => ({ family: 'CTL', model, part_number, part_description, aliases, source_type: 'Public reference', source_reference, fitment_status, ...extra }));
const D3 = ['299D3', '299D3 XE'], D3W = ['272D3', '272D3 XE', '299D3', '299D3 XE'];
export const SEED = [
  ...seed(D3, '262-5689', 'Strainer As (Hydraulic Tank)', 'hydraulic tank suction screen; suction strainer', 'A, B', 'model-level', { system: 'Hydraulic', related_seal: '135-7940' }),
  ...seed(D3, '135-7940', 'Seal-O-Ring, 80 mm ID × 4 mm section', 'suction screen seal; strainer o-ring', 'A, C, D', 'cross-model', { system: 'Hydraulic', notes: 'Cat lists these models and pairs the seal with the strainer; the pairing is shown on a 236D3 (579-7921 Tank & Mtg Gp-Hydraulic). Verify the exact machine group and whether it is included, in SIS.' }),
  ...seed(D3, '345-4581', 'Tank Gp-Hydraulic (38 L reservoir)', 'hydraulic tank; hydraulic reservoir', 'B, E', 'model-level', { system: 'Hydraulic', group_number: '345-4581', group_name: 'Tank Gp-Hydraulic', notes: 'Model-level group. Confirm the illustrated parent group in SIS.' }),
  ...seed(D3, '421-5479', 'Hydraulic service filter element', 'hydraulic filter; return filter', 'F', 'model-level', { system: 'Hydraulic', notes: 'Separate from the suction screen.' }),
  ...seed(D3, '258-2829', 'Hydraulic tank breather', 'breather; tank vent', 'B', 'model-level', { system: 'Hydraulic' }),
  ...seed(D3W, '377-6967', 'Starter', 'starting motor', 'G', 'guide-level', { system: 'Electrical', source_page: 'PDF p. 7' }),
  ...seed(D3W, '377-6966', 'Alternator', 'charging', 'G', 'guide-level', { system: 'Electrical', source_page: 'PDF p. 7' }),
  ...seed(D3W, '389-5309', 'Water pump', 'coolant pump', 'G', 'guide-level', { system: 'Cooling', source_page: 'PDF p. 7' }),
  ...seed(D3W, '482-8480', 'Turbocharger', 'turbo', 'G', 'guide-level', { system: 'Engine', source_page: 'PDF p. 7' })
].map((r, i) => ({ ...Object.fromEntries(COLS.map(c => [c, ''])), ...r, _seed: true, _id: 'seed-' + i }));

/* ---------------- normalising ---------------- */
// Model: case and spacing don't matter ("299 d3 xe" = "299D3 XE"); suffixes do (299D3 != 299D3 XE).
export const normModel = s => String(s || '').toUpperCase().replace(/[\s\-_]+/g, '');
export const normPart = s => String(s || '').toUpperCase().replace(/[\s\-]+/g, '');
const normText = s => String(s || '').toLowerCase();

/** Read a Cat PIN or serial. 17-character PIN: 1-3 maker, 4-8 model, 9 check, 10-12 prefix, 13-17 sequence.
 *  8-character serial: 3 prefix + 5 sequence. Returns null when it can't be read. */
export function readPin(raw) {
  const s = String(raw || '').toUpperCase().replace(/[\s\-]/g, '');
  if (!s) return null;
  if (s.length === 17) return { prefix: s.slice(9, 12), seq: s.slice(12), form: '17-character PIN' };
  if (/^[A-Z0-9]{3}\d{5}$/.test(s)) return { prefix: s.slice(0, 3), seq: s.slice(3), form: 'serial' };
  if (/^[A-Z0-9]{3}$/.test(s)) return { prefix: s, seq: '', form: 'prefix' };
  return null;
}
/** models whose public-guide prefixes include this one */
export const modelsForPrefix = p => Object.entries(PREFIXES).filter(([, ps]) => ps.includes(String(p || '').toUpperCase())).map(([m]) => m);

/* ---------------- evidence ---------------- */
// One label per row for how strong the fitment evidence is.
export function evidence(r) {
  const st = normText(r.source_type), fs = normText(r.fitment_status);
  const sis = /sis/.test(st) && !!r.verified_on;
  if (/exact|pin/.test(fs)) return { key: 'pin', label: sis ? 'SIS verified · exact PIN' : 'Exact PIN' };
  if (/serial/.test(fs) || (r.serial_start || r.serial_end)) return { key: 'serial', label: sis ? 'SIS verified · serial range' : 'Serial range' };
  if (/cross/.test(fs)) return { key: 'cross', label: 'Cross-model' };
  if (/guide/.test(fs)) return { key: 'model', label: 'Guide-level' };
  if (/model/.test(fs)) return { key: 'model', label: 'Model-level' };
  return { key: 'none', label: 'Unverified' };
}

/* ---------------- search ---------------- */
/** filter: { q, model, pin }. Returns { rows, hidden: [{reason, n}], pin } */
export function search(rows, { q = '', model = '', pin = '' } = {}) {
  const pm = readPin(pin), want = normModel(model);
  const tokens = String(q).trim().split(/\s+/).filter(Boolean);
  const hidden = { model: 0, prefix: 0, range: 0 };
  const out = [];
  for (const r of rows) {
    if (want && normModel(r.model) !== want) { hidden.model++; continue; }
    if (pm && r.serial_prefix && r.serial_prefix.toUpperCase() !== pm.prefix) { hidden.prefix++; continue; }
    if (pm && pm.seq && (r.serial_start || r.serial_end) && !inRange(pm.seq, r.serial_start, r.serial_end)) { hidden.range++; continue; }
    if (tokens.length) {
      const hay = normText([r.model, r.part_number, r.part_description, r.group_number, r.group_name, r.aliases, r.system, r.related_seal, r.replaced_by, r.parent_part_number, r.configuration, r.notes].join(' | '));
      const hayP = normPart([r.part_number, r.group_number, r.related_seal, r.replaced_by, r.parent_part_number, r.model].join('|'));
      if (!tokens.every(t => hay.includes(normText(t)) || (normPart(t).length >= 3 && hayP.includes(normPart(t))))) continue;
    }
    out.push(r);
  }
  // most specific evidence first, then by part number
  const rank = { pin: 0, serial: 1, model: 2, cross: 3, none: 4 };
  out.sort((a, b) => rank[evidence(a).key] - rank[evidence(b).key] || (a._seed ? 1 : 0) - (b._seed ? 1 : 0) || String(a.part_number).localeCompare(String(b.part_number)));
  return { rows: out, pin: pm, hidden: [['other models', hidden.model], ['other serial prefixes', hidden.prefix], ['outside the serial range', hidden.range]].filter(([, n]) => n).map(([reason, n]) => ({ reason, n })) };
}
function inRange(seq, start, end) {
  const n = parseInt(seq, 10); if (isNaN(n)) return true;
  const lo = start ? parseInt(String(start).replace(/\D/g, ''), 10) : -Infinity, hi = end ? parseInt(String(end).replace(/\D/g, ''), 10) : Infinity;
  return n >= (isNaN(lo) ? -Infinity : lo) && n <= (isNaN(hi) ? Infinity : hi);
}

/* ---------------- CSV ---------------- */
/** RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes. Values stay text. */
export function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false, i = 0;
  const s = String(text || '').replace(/^﻿/, '');
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"' && f === '') { q = true; i++; continue; }
    if (c === ',') { row.push(f); f = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; i++; continue; }
    f += c; i++;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}
const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const toCSV = rows => [COLS.join(','), ...rows.map(r => COLS.map(c => csvCell(r[c])).join(','))].join('\n') + '\n';

/** CSV text -> { rows, skipped: [{line, why}], unknown: [col], missing: [col] } */
export function readImport(text) {
  const all = parseCSV(text);
  if (!all.length) return { rows: [], skipped: [], unknown: [], missing: COLS, error: 'The file is empty.' };
  const head = all[0].map(h => h.trim().toLowerCase());
  const missing = ['model', 'part_number'].filter(c => !head.includes(c));
  if (missing.length) return { rows: [], skipped: [], unknown: [], missing, error: 'The header needs ' + missing.join(' and ') + '. Use the header from "Copy extraction prompt".' };
  const unknown = head.filter(h => h && !COLS.includes(h));
  const rows = [], skipped = [];
  all.slice(1).forEach((vals, i) => {
    const r = Object.fromEntries(COLS.map(c => [c, '']));
    head.forEach((h, j) => { if (COLS.includes(h)) r[h] = (vals[j] ?? '').trim(); });
    if (!r.part_number) { skipped.push({ line: i + 2, why: 'no part_number' }); return; }
    if (!r.model) { skipped.push({ line: i + 2, why: 'no model' }); return; }
    rows.push(r);
  });
  return { rows, skipped, unknown, missing: [] };
}
/** identity of a row: the same part in the same group, item, serial range and configuration is one row */
export const rowKey = r => ['model', 'serial_prefix', 'serial_start', 'serial_end', 'configuration', 'group_number', 'item_number', 'part_number', 'parent_part_number', 'side'].map(c => normPart(r[c])).join('|');

/* ---------------- output ---------------- */
const U = v => (String(v ?? '').trim() || 'unverified');
export function applicability(r) {
  const ser = r.serial_prefix ? r.serial_prefix + (r.serial_start || r.serial_end ? ' ' + (r.serial_start || '…') + '–' + (r.serial_end || '…') : '') : '';
  return [r.model, r.configuration, ser].filter(Boolean).join(' · ');
}
/** one line in the reference's answer format */
export function answerLine(r) {
  const src = r.source_reference ? (r._seed ? 'Sources ' + r.source_reference : r.source_reference) : '';
  return [applicability(r) || 'unverified', r.part_number + ' ' + (r.part_description || ''), r.group_number || r.group_name ? (r.group_number + ' ' + r.group_name).trim() : 'unverified',
    'item ' + U(r.item_number), 'qty ' + U(r.quantity), [r.related_seal, r.parent_part_number && 'parent ' + r.parent_part_number, r.replaced_by && 'replaced by ' + r.replaced_by].filter(Boolean).join(', ') || 'none listed',
    [src, r.source_page, r.source_revision].filter(Boolean).join(' ') + ' · ' + evidence(r).label].join(' | ');
}

export const EXTRACT_PROMPT = `Extract this Cat parts group into CSV using the header below. Keep part numbers as text and retain leading zeros, quantities, item numbers, exact group names, serial breaks, notes and replacement relationships. Use one row per part in a particular group and application. Preserve indented components with parent_part_number. Leave unsupported values empty. For a cropped or unreadable callout, tell me the page and item to review and leave it unverified. Return the CSV and list any discrepancies or missing pages.

${COLS.join(',')}`;
