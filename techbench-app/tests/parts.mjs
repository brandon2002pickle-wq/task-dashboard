// Parts lookup rules: node tests/parts.mjs
import * as P from '../parts.js';
let ok = true; const check = (n, c, d = '') => { console.log(c ? 'PASS' : 'FAIL', n, c ? '' : d); ok = ok && c; };
const pns = res => res.rows.map(r => r.part_number);

// the reference's own test: 299D3 suction screen and seal
let r = P.search(P.SEED, { q: 'suction screen', model: '299D3' });
check('299D3 suction screen finds strainer and its seal', pns(r).includes('262-5689') && pns(r).includes('135-7940'), pns(r));
check('only 299D3 rows, not 299D3 XE', r.rows.every(x => x.model === '299D3'));
r = P.search(P.SEED, { q: 'tank', model: '299d3' });
check('tank group 345-4581 found, model case ignored', pns(r).includes('345-4581'));
check('seal pairing graded cross-model', P.evidence(P.SEED.find(x => x.part_number === '135-7940')).label === 'Cross-model');
check('nothing in the seed is SIS verified', P.SEED.every(x => !/SIS/.test(P.evidence(x).label)));

// suffix is exact
check('299D3 XE != 299D3', P.normModel('299D3 XE') !== P.normModel('299D3') && P.normModel('299 d3 xe') === P.normModel('299D3 XE'));
r = P.search(P.SEED, { model: '272D3 XE' });
check('272D3 XE only gets guide-level rows', r.rows.length === 4 && r.rows.every(x => P.evidence(x).label === 'Guide-level'));

// part numbers with or without dash
check('2625689 finds 262-5689', pns(P.search(P.SEED, { q: '2625689', model: '299D3' })).join() === '262-5689');

// PIN reading
check('17-char PIN', JSON.stringify(P.readPin('CAT0299DCDY901234')) === JSON.stringify({ prefix: 'DY9', seq: '01234', form: '17-character PIN' }));
check('8-char serial', P.readPin('dy9 01234').prefix === 'DY9');
check('junk serial unreadable', P.readPin('12') === null);
check('prefix to model from public guide', P.modelsForPrefix('BX9').join() === '299D3 XE');

// CSV round trip with quotes, commas, newline, leading zeros
const rows = [{ model: '299D3', serial_prefix: 'DY9', serial_start: '00001', serial_end: '04999', group_number: '345-4581', group_name: 'Tank Gp-Hydraulic', item_number: '8', part_number: '0123456', part_description: 'Seal, "O" ring, 80 mm', quantity: '1', notes: 'line one\nline two', fitment_status: 'serial-range', source_type: 'SIS 2.0', verified_on: '2026-11-23' }];
const csv = P.toCSV(rows), back = P.readImport(csv);
check('CSV round trip keeps text, zeros, quotes, newlines', back.rows.length === 1 && back.rows[0].part_number === '0123456' && back.rows[0].part_description === 'Seal, "O" ring, 80 mm' && back.rows[0].notes === 'line one\nline two' && back.rows[0].serial_start === '00001');
check('SIS row with date is SIS verified', P.evidence(back.rows[0]).label === 'SIS verified · serial range');
check('same row gives same key', P.rowKey(back.rows[0]) === P.rowKey(rows[0]));

// serial range filtering
const all = [...back.rows, ...P.SEED];
r = P.search(all, { model: '299D3', pin: 'DY905000', q: '0123456' });
check('outside serial range is hidden and counted', r.rows.length === 0 && r.hidden.some(h => /range/.test(h.reason)));
r = P.search(all, { model: '299D3', pin: 'DY904000', q: '0123456' });
check('inside serial range is shown', r.rows.length === 1);
r = P.search(all, { model: '299D3', pin: 'CY900010', q: '0123456' });
check('other prefix is hidden', r.rows.length === 0 && r.hidden.some(h => /prefix/.test(h.reason)));
r = P.search(all, { model: '299D3', pin: 'DY904000', q: 'seal' });
check('serial-range row ranks above model-level rows', r.rows[0].part_number === '0123456');

// import validation
check('missing part_number column refused', !!P.readImport('model,description\n299D3,x').error);
const im = P.readImport('model,part_number,colour\n299D3,111-2222,red\n299D3,,blue\n');
check('row without part number skipped, unknown column reported', im.rows.length === 1 && im.skipped[0].line === 3 && im.unknown.join() === 'colour');
check('answer line marks gaps unverified', P.answerLine(P.SEED[0]).includes('item unverified') && P.answerLine(P.SEED[0]).includes('qty unverified'));

process.exit(ok ? 0 : 1);
