import { store, makeBackend, makeSync, shrinkImage, parseJsonReply, makeDictation } from './sync.js';

// iPhone / iPad (iPadOS reports itself as a Mac with touch)
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
document.documentElement.classList.toggle('ios', IOS);
document.documentElement.classList.toggle('standalone', standalone());
function iosHint() {
  const el = document.querySelector('#ios-hint'); if (!el) return;
  el.hidden = !(IOS && !standalone() && !store.getMeta('iosHintDone'));
  document.querySelector('#ios-hint-x').onclick = async () => { el.hidden = true; await store.setMeta('iosHintDone', true); };
}

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
let toastT; const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200); };
const when = t => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const MAKES = {
  cat: { name: 'Cat', psr: 'Product Status Report (PSR)', tool: 'Cat ET', info: 'SIS 2.0', models: ['226','232','236','242','246','262','272','239','249','259','279','289','299','301.5','301.7','302.7','303.5','304','305','306','308','309','310','415','416','420','430','440','450','903','906','907','908','910','914','TH255','TH306','TH357','TH408'] },
  deere: { name: 'John Deere', psr: 'machine status report', tool: 'Service ADVISOR', info: 'the Deere technical manual', models: ['333G','331G','325G','317G','332G','330G','320G','318G','35G','50G','60G','310L','310SL'] },
  bobcat: { name: 'Bobcat', psr: 'machine status report', tool: 'Bobcat Service Analyzer', info: 'the Bobcat service manual', models: ['S510','S550','S570','S590','S650','S66','S76','T550','T590','T650','T66','T76','E35','E50'] },
  other: { name: 'Other', psr: 'machine status report', tool: 'the OEM service tool', info: 'the OEM service manual', models: [] }
};
/* engine / aftertreatment per model, from Cat spec sheets; diagnosis context only */
const PROFILE = {
  '226D3': 'Cat C2.2 turbo, no DEF', '232D3': 'Cat C2.2 turbo', '236D3': 'Cat C3.3B DIT turbo', '242D3': 'Cat C3.3B DIT turbo', '246D3': 'Cat C3.3B DIT turbo; High Flow XPS option', '262D3': 'Cat C3.3B DIT turbo; High Flow XPS option', '272D3': 'Cat C3.8 DIT turbo', '272D3 XE': 'Cat C3.8 DIT turbo; XE high-flow hydraulics',
  '239D3': 'Cat C2.2 turbo', '249D3': 'Cat C2.2 turbo', '259D3': 'Cat C3.3B DIT turbo', '279D3': 'Cat C3.3B DIT turbo', '289D3': 'Cat C3.3B DIT turbo', '299D3': 'Cat C3.8 DIT turbo; DEF system', '299D3 XE': 'Cat C3.8 DIT turbo; DEF system; XE high-flow hydraulics',
  '250': 'Cat C2.8T turbo', '260': 'Cat C2.8T turbo', '270': 'Cat C3.6TA turbo-aftercooled; DEF system', '270 XE': 'Cat C3.6TA turbo-aftercooled; XE high-flow hydraulics',
  '253': 'Cat C3.3B turbo', '255': 'Cat C2.8T turbo', '265': 'Cat C2.8TA turbo-aftercooled', '275': 'Cat C3.6TA turbo-aftercooled; DEF system', '275 XE': 'Cat C3.6TA turbo-aftercooled; XE high-flow hydraulics', '285': 'Cat C3.6TA turbo-aftercooled; DEF system', '285 XE': 'Cat C3.6TA turbo-aftercooled; DEF system; XE high-flow hydraulics',
  '300.9D': 'Yanmar 3-cylinder diesel, gear pumps', '301.5': 'Cat C1.1', '301.7 CR': 'Cat C1.1', '301.8': 'Cat C1.1', '302 CR': 'Cat C1.1', '302.7 CR': 'Cat C1.1 Turbo', '303 CR': 'Cat C1.1 Turbo', '303.5 CR': 'Cat C1.7 NA',
  '304': 'Cat C1.7 Turbo', '305 CR': 'Cat C1.7 Turbo', '306 CR': 'Cat C2.4 Turbo', '307.5': 'Cat C2.4 Turbo with DPF',
  '308 CR': 'Current builds: Cat C2.8 Turbo with DPF + DOC; earlier builds: Cat C3.3B with DPF', '309 CR': 'Current builds: Cat C2.8 Turbo; earlier builds: Cat C3.3B; high-flow aux available', '310': 'Current builds: Cat C2.8 Turbo with DPF + DOC; earlier builds: Cat C3.3B'
};
const profOf = (make, model) => { if (make && make !== 'cat') return ''; const m = String(model || '').toUpperCase().replace(/\\s+/g, ' ').trim(); const k = Object.keys(PROFILE).find(k => k.toUpperCase() === m) || Object.keys(PROFILE).find(k => m.startsWith(k.toUpperCase() + ' ')); return k ? `${k}: ${PROFILE[k]} (from Cat spec sheet; confirm by serial in SIS)` : ''; };
/* ---------- diagnostic knowledge: code decoder + symptom guides (general procedures; specs and code-specific steps per SIS) ---------- */
const FMI = {
  0: ['Data valid but above normal range', 'A real reading the ECM believes. Confirm the actual condition (gauge, IR thermometer, mechanical gauge) before blaming the sensor.'],
  1: ['Data valid but below normal range', 'A real low reading. Check the actual system (level, pressure, flow) before the sensor.'],
  2: ['Data erratic, intermittent or incorrect', 'Look for intermittent connections, chafed harness, moisture in connectors, or two sources that disagree. Wiggle-test with ET status screen open.'],
  3: ['Voltage above normal or shorted to high source', 'Signal wire shorted to a voltage source, or an open in the signal/return on a pulled-up input. Check connector, harness and sensor; compare with a known-good sensor.'],
  4: ['Voltage below normal or shorted to low source', 'Signal wire shorted to ground or chassis, or sensor supply missing. Check for chafe-through and the sensor supply voltage.'],
  5: ['Current below normal or open circuit', 'Open circuit to a solenoid/output: broken wire, unplugged or corroded connector, open coil. Check coil resistance per SIS.'],
  6: ['Current above normal or grounded circuit', 'Output shorted to ground or low coil resistance. Check harness chafe and coil resistance per SIS.'],
  7: ['Mechanical system not responding or out of adjustment', 'Command sent but the system did not respond: stuck valve, seized actuator, binding linkage, low supply pressure.'],
  8: ['Abnormal frequency, pulse width or period', 'Frequency/PWM signal problem: speed or position sensor gap, damaged tone wheel, noisy signal.'],
  9: ['Abnormal update rate', 'Module stopped receiving a message: data link wiring, termination, module power/ground, or the sending module offline.'],
  10: ['Abnormal rate of change', 'Signal changing faster than physically possible: intermittent connection or electrical noise.'],
  11: ['Root cause not known / other failure mode', 'Follow the SIS procedure for this specific code.'],
  12: ['Bad intelligent device or component', 'Module or smart component reporting an internal fault. Confirm power, ground and software before replacing.'],
  13: ['Out of calibration', 'Run the calibration in Cat ET for this component, then retest.'],
  14: ['Special instructions', 'Code-specific: follow SIS.'],
  15: ['Data valid but above normal range: least severe level', 'Early warning of a high condition. Check the real condition.'],
  16: ['Data valid but above normal range: moderately severe level', 'Condition worsening. Check the real condition and why it is high.'],
  17: ['Data valid but below normal range: least severe level', 'Early warning of a low condition. Check the real condition.'],
  18: ['Data valid but below normal range: moderately severe level', 'Condition worsening. Check the real condition.'],
  19: ['Received network data in error', 'Another module sent an error value for this parameter. Diagnose the source module.'],
  20: ['Data drifted high', 'Sensor drifting: compare with a reference reading.'],
  21: ['Data drifted low', 'Sensor drifting: compare with a reference reading.'],
  31: ['Condition exists', 'Status-type code: the condition is present. Find out why.']
};
const EVLEVEL = { 1: 'Level 1: operator alert; the machine needs attention', 2: 'Level 2: change operation or perform service soon to avoid damage', 3: 'Level 3: stop the machine safely now; serious damage or injury possible' };
function decodeCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, ' ').trim(); let m;
  const fmiInfo = f => FMI[f] ? { fmi: f, fmiText: FMI[f][0], fmiHint: FMI[f][1] } : { fmi: f, fmiText: 'FMI ' + f + ': see SIS', fmiHint: '' };
  if ((m = s.match(/^E\s?0*(\d{1,5})\s*(?:[-(\s]\s*(?:LEVEL\s*)?([123])\)?)?/))) return { type: 'Event code', id: m[1], level: m[2] ? +m[2] : null, levelText: m[2] ? EVLEVEL[m[2]] : 'Warning level not shown (1, 2 or 3 in ET)', note: 'Event codes report a machine condition (pressure, temperature, speed out of range), not a circuit fault. Find why the condition happened.' };
  if ((m = s.match(/MID\s*0*(\d{1,3}).*?CID\s*0*(\d{1,5}).*?FMI\s*0*(\d{1,2})/))) return { type: 'MID / CID-FMI', mid: m[1], id: m[2], ...fmiInfo(+m[3]) };
  if ((m = s.match(/SPN\s*0*(\d{1,6}).*?FMI\s*0*(\d{1,2})/))) return { type: 'SPN-FMI (J1939)', id: m[1], ...fmiInfo(+m[2]) };
  if ((m = s.match(/CID\s*0*(\d{1,5}).*?FMI\s*0*(\d{1,2})/))) return { type: 'CID-FMI', id: m[1], ...fmiInfo(+m[2]) };
  if ((m = s.match(/^0*(\d{1,3})\s*:\s*0*(\d{1,6})\s*-\s*0*(\d{1,2})\b/))) return { type: 'MID : CID-FMI', mid: m[1], id: m[2], ...fmiInfo(+m[3]) };
  if ((m = s.match(/^0*(\d{1,6})\s*[-.]\s*0*(\d{1,2})\b/))) return { type: 'CID/SPN-FMI', id: m[1], ...fmiInfo(+m[2]) };
  return null;
}
const fmiShort = code => { const d = decodeCode(code); return !d ? '' : d.type === 'Event code' ? (d.level ? 'Event, level ' + d.level : 'Event') : 'FMI ' + d.fmi + ': ' + d.fmiText; };

/* symptom guides: m = machine types (L = skid steer / CTL, X = mini excavator) */
const GUIDES = [
  { id: 'nostart', m: 'LX', sys: 'Engine', t: 'Cranks but will not start, or hard start', codes: 'Fuel pressure, speed/timing sensor, ECM supply voltage, machine security (MSS) codes',
    steps: ['Read active and logged codes and events in Cat ET; note any machine security or interlock status that blocks fuel', 'Check fuel level, fuel quality and water in the separator; drain and prime the fuel system', 'Check battery voltage at rest and while cranking; load test; inspect main ground and starter cables', 'In ET, watch engine speed while cranking: no speed signal points to the speed/timing sensor or its circuit', 'Check fuel filter restriction and low-pressure supply per SIS', 'Check air intake restriction and, on cold starts, glow plug / starting aid operation', 'Check ECM unswitched/switched power and grounds if codes show low ECM voltage'],
    then: 'Repair the circuit or component found; clear logged codes; restart cold and hot; pull an after-repair PSR.' },
  { id: 'nocrank', m: 'LX', sys: 'Electrical', t: 'No crank', codes: 'Interlock, seat/lap bar or lockout lever switch, starter relay, MSS',
    steps: ['Confirm operator-present conditions: seat occupied, armrest/lap bar down (loaders) or hydraulic lockout lever in the locked position (minis)', 'Check display for interlock, security key or lock symbols; read codes with ET', 'Check battery state of charge and main disconnect switch', 'Check fuses and the start relay; check for voltage at the starter solenoid while the key is in START', 'If the starter cranks when the relay is bypassed, the fault is upstream: key switch, interlock input or security system'],
    then: 'Repair the open input, relay or starter circuit; verify every interlock still prevents starting when it should.' },
  { id: 'derate', m: 'LX', sys: 'Engine', t: 'Low power or engine derate', codes: 'DPF soot load, intake/boost pressure, fuel rail pressure, coolant temperature, DEF quality (DEF machines)',
    steps: ['Read active codes and events; note which one triggered the derate and its warning level', 'Check air filter restriction and intake leaks', 'Check fuel filters and supply restriction; check for air in the fuel', 'Check DPF soot load and regeneration history in ET (see the DPF guide)', 'On DEF machines, check DEF level, quality and any SCR inducement countdown', 'Check coolant and intake temperatures: hot engines protect themselves', 'Separate engine from hydraulic load: does the engine lug down only under hydraulic load or also at high idle?'],
    then: 'Fix the root cause first, then clear codes; confirm full power under load and pull an after-repair PSR.' },
  { id: 'dpf', m: 'LX', sys: 'Aftertreatment', t: 'DPF high soot load or regeneration problems', codes: 'Soot load %, DPF differential pressure, DOC/DPF temperatures, regeneration not completing',
    steps: ['In ET, record soot load %, ash load (if shown), DPF differential pressure and the regeneration history', 'Find why soot built up: long idling, light-load work, fuel or oil type, injector or turbo faults creating excess smoke', 'Check exhaust temperature sensors and the DPF differential pressure sensor/lines for plausibility before regenerating', 'Check engine faults first: a regen will not stay clean if the engine is making excess soot', 'Run a parked / service regeneration from ET or the display when conditions are met; watch temperatures through the cycle', 'If soot is too high for a regen, or ash is at the service limit, follow SIS for DPF cleaning or replacement'],
    then: 'Confirm soot load drops after the regen, check for exhaust leaks, and note the regen in the work order.', note: 'Cat Tier 4 Final C1.5 and C2.2 use passive regeneration with an automatic burner back-up; the C3.3B uses a catalyzed DPF with in-cylinder dosing active regeneration and a 3,000-hour ash service interval.' },
  { id: 'def', m: 'L', sys: 'Aftertreatment', t: 'DEF / SCR faults and inducement (DEF-equipped models)', codes: 'DEF level, DEF quality, DEF pump/doser, NOx sensors, SCR efficiency, DEF heater',
    steps: ['Confirm the model actually has DEF (machine profile) before chasing SCR causes', 'Read codes and the inducement status/countdown in ET', 'Check DEF level and quality with a refractometer; look for contamination or crystallization', 'Check DEF lines, filter and doser for crystals or blockage; check the heaters in cold weather', 'Check the NOx sensors and wiring; compare upstream and downstream readings', 'Run the DEF dosing / purge tests available in ET for that engine'],
    then: 'Correct the fault, clear codes, confirm inducement has reset and SCR efficiency recovers on a run.' },
  { id: 'volts', m: 'LX', sys: 'Electrical', t: 'Low system voltage / charging fault', codes: 'System voltage (e.g. CID/SPN 168), alternator, multiple sensor codes at once',
    steps: ['Measure battery voltage at rest and charging voltage at high idle; compare with ET system voltage', 'Inspect alternator belt tension and condition; check the alternator output and excitation circuits', 'Check main grounds (battery to frame, frame to engine, ECM grounds) and voltage drop under load', 'Check battery connections and the battery disconnect switch for heat or corrosion', 'Note which other codes appear at the same time: low voltage often triggers a cascade of unrelated-looking codes'],
    then: 'Repair the charging or ground fault first, then clear all codes and see which ones come back.' },
  { id: 'supply', m: 'LX', sys: 'Electrical', t: 'Sensor supply fault (5 V / 8 V supply) or many sensor codes at once', codes: '5 V or 8 V sensor supply codes together with several sensor FMI 3/4 codes',
    steps: ['Group the codes: several sensors failing together usually share a supply or return', 'Measure the supply voltage at a sensor connector with key on', 'Unplug sensors on that supply one at a time; if the supply recovers, the last one unplugged (or its harness) is shorting it', 'Inspect harness routing near hot or moving parts for chafe-through', 'Check ECM connector pins for corrosion or spread terminals'],
    then: 'Repair the shorted sensor or harness; clear codes and confirm the supply and all sensors read correctly in ET.' },
  { id: 'datalink', m: 'LX', sys: 'Electrical', t: 'Data link / module communication (FMI 9 codes)', codes: 'J1939 / CAN data link, abnormal update rate from a module, display not communicating',
    steps: ['Identify which module stopped talking and which modules are reporting it', 'Check that module\'s power and ground with key on', 'Check data link wiring and connectors for damage or water intrusion', 'Measure data link termination resistance per SIS with the key off', 'Check for a recent module or display replacement that needs software/configuration in ET'],
    then: 'Repair wiring or power; flash or configure modules as required; confirm all modules show in ET.' },
  { id: 'hot', m: 'LX', sys: 'Cooling', t: 'Engine or hydraulic overheating', codes: 'Coolant temperature high, hydraulic oil temperature high, fan speed',
    steps: ['Confirm the real temperature with an IR thermometer before blaming the sensor', 'Check coolant level and condition; pressure test the cooling system', 'Clean the radiator and oil cooler cores; on loaders, debris packing is the common cause', 'Check demand fan operation: command vs actual fan speed in ET, fan drive and its solenoid', 'For hydraulic heat, look for a relief valve running over relief or a function held against stall', 'Check thermostats where accessible'],
    then: 'Clean/repair, then run under load and watch temperatures stabilise in ET.' },
  { id: 'interlock', m: 'L', sys: 'Interlock', t: 'Loader: no lift/tilt or no drive (interlock)', codes: 'Interlock, seat switch, armrest/lap bar, park brake, hydraulic lockout solenoid',
    steps: ['Check what the display shows: flashing armrest, seat or park brake indicators point to which input the system rejects', 'Open the interlock / operator-present inputs in ET status and toggle seat, armrest and park brake: each should change state', 'Check the seat switch and armrest switch circuit (on Cat loaders these are wired in series)', 'Check the hydraulic lockout and park brake solenoids: power at the connector when enabled, and coil resistance per SIS', 'Check fuses and relays feeding the solenoids', 'If drive works but implements do not (or the reverse), focus on the circuit unique to that function'],
    then: 'Repair the failed switch, wiring or solenoid; never leave an interlock bypassed; verify that every interlock still locks out functions.' },
  { id: 'loaderweak', m: 'L', sys: 'Hydraulics', t: 'Loader: slow or weak lift/tilt, or arms drifting down', codes: 'Hydraulic oil temperature, pump/charge pressure, engine speed',
    steps: ['Confirm hot or cold, all functions or one, and whether it drifts with the engine off', 'Check hydraulic oil level and condition; take an S·O·S sample if contamination is suspected', 'Warm the oil to operating temperature before testing', 'Check engine high idle under load: is it an engine problem or a hydraulic one?', 'Check charge and implement pressures and the main relief per SIS', 'For drift: cylinder-drift test (cylinder seal bypass) vs control valve spool leakage; isolate by checking drift with the cylinder line capped per SIS', 'Check pilot / electro-hydraulic control inputs in ET on joystick machines'],
    then: 'Repair the pump, relief, valve or cylinder found; re-test cycle times and drift.' },
  { id: 'aux', m: 'L', sys: 'Hydraulics', t: 'Loader: auxiliary or high-flow hydraulics not working', codes: 'Auxiliary solenoid, high-flow enable, continuous flow, Smart Attachment',
    steps: ['Confirm the machine is actually equipped with the circuit being used (standard flow, high flow, High Flow XPS, XE)', 'Check couplers: fully engaged, not damaged, no trapped pressure (use the pressure release)', 'Command the auxiliary in ET status and check the solenoid outputs and currents', 'Check auxiliary pressure and flow at the couplers with a flow meter per SIS', 'Check case drain on attachments that need it'],
    then: 'Repair, then flow test again under load.' },
  { id: 'drive', m: 'L', sys: 'Drive', t: 'Loader: will not move, one side weak, or will not track straight', codes: 'Park brake, drive pump/motor, speed sensors, two-speed, joystick inputs',
    steps: ['Check park brake release: indicator state, solenoid power and brake release pressure per SIS', 'Check joystick/drive control inputs in ET (both directions, both sides)', 'Check charge pressure; low charge pressure affects both sides', 'For one weak side: swap-test inputs where possible, then check drive motor case drain flow and loop pressures per SIS', 'On track loaders, check track tension, rollers and idlers for drag; on skid steers, check chain case oil and chains', 'Check two-speed solenoid operation if the fault appears in only one range', 'Run drive calibrations in ET after component replacement'],
    then: 'Repair, calibrate if required, and test drive straight-line tracking loaded and unloaded.' },
  { id: 'minilock', m: 'X', sys: 'Hydraulics', t: 'Mini excavator: no hydraulic functions', codes: 'Hydraulic lockout lever switch, pilot lockout solenoid',
    steps: ['Confirm the hydraulic lockout lever is in the operating position and its switch changes state (ET status or display)', 'Check power at the pilot lockout solenoid when unlocked; check its fuse and relay', 'Check pilot supply pressure at the joysticks per SIS', 'If only one joystick is dead, check that joystick\'s pilot supply and return', 'If the blade works but pilot functions do not, focus on the pilot supply, not the main pump', 'Check hydraulic oil level'],
    then: 'Repair the switch, solenoid, wiring or pilot supply; verify the lockout still disables all functions when raised.' },
  { id: 'miniweak', m: 'X', sys: 'Hydraulics', t: 'Mini excavator: all functions slow or weak', codes: 'Engine speed, pump control, hydraulic oil temperature',
    steps: ['Check engine speed at the selected throttle setting under load; check for derate codes', 'Check the operating mode / power setting on the display', 'Check oil level and condition; warm oil to operating temperature', 'Check pilot pressure, then main pump pressure and the main relief per SIS', 'On load-sensing machines, check load-sense / margin pressure per SIS', 'Time the cycle tests and compare with SIS values'],
    then: 'Repair the engine, pump control, relief or pump; re-time cycles.' },
  { id: 'minifunc', m: 'X', sys: 'Hydraulics', t: 'Mini excavator: one function weak, slow or drifting', codes: 'Usually none: mechanical/hydraulic',
    steps: ['Check whether the function is weak in both directions or one', 'Check the circuit relief (port relief) for that function per SIS', 'Check the cylinder for internal bypass with a drift test', 'Check joystick pilot output for that function', 'Check the control valve spool for sticking or contamination', 'For swing: check swing brake release and swing motor case drain; for travel deviation: compare left/right travel motor and swivel joint'],
    then: 'Repair the relief, cylinder, valve or motor found; re-test cycle and drift.' },
  { id: 'contam', m: 'LX', sys: 'Hydraulics', t: 'Hydraulic contamination / after a pump or motor failure', codes: 'Filter bypass, hydraulic temperature; S·O·S results',
    steps: ['Take an S·O·S sample before any cleanout to document the starting condition', 'Inspect filters and the tank strainer for metal, rubber or debris; photograph findings', 'Identify the failed source component before cleaning so it is not re-contaminated', 'Drain, flush and replace filters per SIS; repeat cleanout cycles until samples come back clean', 'Record each cycle: what was replaced, run time, and each sample taken'],
    then: 'Confirm clean S·O·S results before returning to service; record the number of cleanout cycles.' }
];
const guidesFor = type => GUIDES.filter(g => !type || g.m.includes(type));
const guideText = type => guidesFor(type).map(g => `[${g.id}] ${g.t} (${g.sys}). Typical codes: ${g.codes}. Checks: ${g.steps.join('; ')}. After: ${g.then}${g.note ? ' Note: ' + g.note : ''}`).join('\n');
const mType = (make, model) => { const m = String(model || '').trim(); if (/^30\d/.test(m) || /^300/.test(m)) return 'X'; if (/^2\d\d/.test(m)) return 'L'; return ''; };

const FMI_REF = Object.entries(FMI).map(([k, v]) => `FMI ${k}: ${v[0]}. ${v[1]}`).join('\n') + '\nEvent warning levels: ' + Object.values(EVLEVEL).join('; ');
const REF = (make, model) => `SHOP DIAGNOSTIC REFERENCE (general field procedures for Cat compact equipment; code-specific steps, pinouts and specs come from SIS):\nCode formats: MID:CID-FMI (classic Cat), CID-FMI, SPN-FMI (J1939), E### event codes with warning level 1-3.\n${FMI_REF}\nSYMPTOM GUIDES:\n${guideText(mType(make, model))}`;
const LABEL = { triage: 'Triage', before: 'Before repair', after: 'After repair' };
const CONF = { likely: [85, 'var(--accent)'], possible: [50, 'var(--amber)'], unlikely: [18, 'var(--muted)'], 'ruled out': [0, 'var(--muted)'] };
$('#t-make').innerHTML = Object.entries(MAKES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
const fillModels = () => $('#dl-models').innerHTML = MAKES[$('#t-make').value].models.map(m => `<option value="${m}">`).join('');
$('#t-make').onchange = fillModels; fillModels();

/* ---------- storage: this device first (IndexedDB), then your account ---------- */
let reports = [], telem = [], dict = null;
const backend = makeBackend(window.PSR_CONFIG || {});
const sync = makeSync(backend);
function load() {
  const all = store.list();
  reports = all.filter(x => !String(x.id).startsWith('t_')).sort((a, b) => b.at - a.at);
  telem = all.filter(x => String(x.id).startsWith('t_')).sort((a, b) => (b.upd || 0) - (a.upd || 0));
}
function put(r) { r.upd = Date.now(); store.put(r).catch(e => toast('Not saved on this device: ' + e.message)); }
async function del(r) { reports = reports.filter(x => x !== r); telem = telem.filter(x => x !== r); await store.remove(r.id); }
function storeLabel() {
  const s = sync.status, n = store.dirtyCount(), here = 'this device';
  const map = {
    local: `<b>Saved on ${here}</b>`, 'signed-out': `<b>Saved on ${here}</b>`,
    syncing: '<b>Syncing…</b>', synced: n ? `<b class="warn">${n} waiting to sync</b>` : '<b>Synced to your account</b>',
    offline: `<b class="warn">Offline: saved on ${here}</b>`, setup: '<b class="warn">Sync not set up: saved on this device</b>',
    error: `<b class="warn">Not synced: retrying</b>`
  };
  $('#store').innerHTML = map[s.phase] || map.local;
  $('#store').title = s.error || '';
}
function render() { renderRecent(); if (cur.tab === 'diag') renderDiag(); if (cur.tab === 'hist') renderHist(); if (cur.tab === 'telem') renderTelem(); if (cur.tab === 'set') renderSet(); }

/* ---------- Claude: account function, or copy & paste ---------- */
const ai = {
  mode() { return backend.ready && backend.session() && store.getMeta('aiMode') !== 'manual' && store.getMeta('fnMissing') !== true ? 'account' : 'manual'; },
  async json(prompt, { images = [], modelTier = 'default' } = {}) {
    if (this.mode() === 'account') {
      try {
        const imgs = await Promise.all(images.map(f => shrinkImage(f)));
        const out = await backend.ask({ prompt, images: imgs, tier: modelTier });
        return parseJsonReply(out.text);
      } catch (e) {
        if (e.status === 404) { await store.setMeta('fnMissing', true); toast('Claude function not deployed: switching to copy & paste'); return manualAsk(prompt, images); }
        if (e.status === 429) { const x = new Error(e.message); x.code = 'rate_limited'; throw x; }
        if (e.status === 422) { const x = new Error(e.message); x.code = 'refused'; throw x; }
        if (e.status === 413) { const x = new Error(e.message); x.code = 'prompt_too_large'; throw x; }
        if (!navigator.onLine || e instanceof TypeError) return manualAsk(prompt, images, 'No connection to your account. ');
        throw e;
      }
    }
    return manualAsk(prompt, images);
  }
};
/** shows the prompt to paste into Claude, waits for the reply to be pasted back */
function manualAsk(prompt, images = [], why = '') {
  return new Promise((resolve, reject) => {
    const dlg = $('#ask'), ta = $('#ask-reply'), m = $('#ask-msg');
    $('#ask-why').textContent = why;
    $('#ask-prompt').value = prompt;
    $('#ask-photos').hidden = !images.length;
    $('#ask-photos').textContent = images.length ? `Attach the same ${images.length} photo${images.length > 1 ? 's' : ''} (${images.map(f => f.name).join(', ')}) to your Claude message along with the prompt.` : '';
    ta.value = ''; m.textContent = '';
    const done = (fn, v) => { dlg.close(); fn(v); };
    $('#ask-copy').onclick = () => copy(prompt);
    $('#ask-open').onclick = () => { copy(prompt); window.open('https://claude.ai/new', '_blank', 'noopener'); };
    $('#ask-use').onclick = () => { try { done(resolve, parseJsonReply(ta.value)); } catch (e) { m.textContent = e.message; } };
    $('#ask-cancel').onclick = () => { const e = new Error('Cancelled'); e.code = 'cancelled'; done(reject, e); };
    dlg.oncancel = ev => { ev.preventDefault(); $('#ask-cancel').onclick(); };
    dlg.showModal(); $('#ask-prompt').scrollTop = 0;
  });
}

(async () => {
  await store.open();
  load();
  dict = makeDictation();
  // keep cases from being cleared by Safari's storage clean-up
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  iosHint();
  if (dict) document.querySelectorAll('[data-mic]').forEach(wireMic);
  store.on(w => { if (w.type === 'remote') { load(); render(); } storeLabel(); });
  storeLabel(); render(); tmHint();
  sync.run();
})();

/* ---------- dictation ---------- */
let micOn = null, micDead = false;
function wireMic(b) {
  if (micDead) return;
  b.hidden = false;
  b.onclick = () => {
    const ta = document.getElementById(b.dataset.mic);
    if (micOn === b) { dict.stop().catch(() => {}); return; }
    if (micOn) dict.stop().catch(() => {});
    micOn = b; const base = ta.value ? ta.value.trimEnd() + ' ' : ''; let fin = '';
    dict.onPartial(({ text }) => { if (micOn === b) ta.value = base + fin + text; });
    dict.onFinal(({ text }) => { if (micOn === b) { fin += text + ' '; ta.value = base + fin; ta.dispatchEvent(new Event('input')); } });
    dict.onState(({ state }) => { const on = state === 'listening' && micOn === b; b.setAttribute('aria-pressed', on); b.textContent = on ? 'Stop' : 'Dictate'; if (state === 'idle' && micOn === b) micOn = null; });
    const noMic = () => { micOn = null; b.setAttribute('aria-pressed', 'false'); b.textContent = 'Dictate'; micDead = true; document.querySelectorAll('[data-mic]').forEach(x => x.hidden = true); toast(IOS ? 'Dictation unavailable here: use the mic on the iPhone keyboard' : 'Dictation unavailable: use your keyboard\'s mic'); };
    dict.onError(noMic);
    dict.start().catch(noMic);
  };
}

/* ---------- file reading ---------- */
const PDFJS = new URL('vendor/', location.href).href;   // bundled: works offline
let pdfReady = null;
const loadPdf = () => pdfReady || (pdfReady = new Promise((res, rej) => { const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js'; s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; res(pdfjsLib); }; s.onerror = () => { pdfReady = null; rej(new Error('PDF reader failed to load')); }; document.head.appendChild(s); }));
async function pdfText(f) { const lib = await loadPdf(); const doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise; let o = ''; for (let i = 1; i <= doc.numPages; i++) { const tc = await (await doc.getPage(i)).getTextContent(); o += tc.items.map(t => t.str + (t.hasEOL ? '\n' : ' ')).join('') + '\n\n'; } return o; }
function htmlText(h) { const d = new DOMParser().parseFromString(h, 'text/html'); d.querySelectorAll('script,style').forEach(n => n.remove()); d.querySelectorAll('tr').forEach(n => n.append('\n')); d.querySelectorAll('td,th').forEach(n => n.append(' | ')); d.querySelectorAll('br,p,div,h1,h2,h3,h4,li').forEach(n => n.append('\n')); return (d.body ? d.body.textContent : '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n'); }

const ERR = { cancelled: 'Cancelled.', refused: 'Claude declined this request. Rephrase the complaint or attach only the fault pages.', not_granted: 'Microphone access was declined.', rate_limited: 'Too many requests just now. Try again in a minute.', invalid_json: "That reply wasn't valid JSON. Try once more.", prompt_too_large: 'Too large. Attach only the fault pages.', images_unavailable: "Photos can't be read in this view. Use the PDF or .htm file." };
const errMsg = e => ERR[e && e.code] || ('Something went wrong' + (e && e.message ? ': ' + e.message : '.'));


/* ---------- shop memory: similar past cases ---------- */
const normCode = c => String(c || '').toUpperCase().replace(/\s+/g, '').replace(/^0+/, '').replace(/\(.*\)$/, '');
const codesOfR = r => [...(r.result?.active || []), ...(r.result?.logged || []), ...(r.result?.events || [])].map(c => normCode(c.code)).filter(Boolean);
const words = s => new Set(String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []);
const learned = r => !!(r.outcome || r.concl || (r.steps || []).some(s => s.res === 'found'));
function similarCases({ id, model, complaint, codes, text }) {
  const codeSet = new Set((codes || []).map(normCode)), T = String(text || '').toUpperCase().replace(/\s+/g, ''), W = words(complaint), mt = mType('', model);
  return reports.filter(c => c.id !== id && learned(c)).map(c => {
    const cc = [...new Set(codesOfR(c))], shared = cc.filter(k => codeSet.has(k) || (k.length > 2 && T.includes(k)));
    const cw = words(c.ctx.complaint), kw = [...W].filter(w => cw.has(w)).length;
    let s = shared.length * 3 + Math.min(kw, 4) * 0.5;
    if (model && c.ctx.model && c.ctx.model.toUpperCase() === String(model).toUpperCase()) s += 1.5; else if (mt && mType('', c.ctx.model) === mt) s += 0.5;
    return { c, s, shared };
  }).filter(x => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 5);
}
function caseBrief({ c, shared }) {
  const fix = c.outcome ? 'CONFIRMED FIX: ' + c.outcome : c.concl ? 'Diagnosis (not confirmed by repair): ' + c.concl.cause + ' (' + c.concl.basis + ')' : 'Technician finding: ' + (c.steps || []).filter(s => s.res === 'found').map(s => s.note).join('; ');
  const chk = (c.steps || []).filter(s => s.res !== 'found').map(s => `${s.check} -> ${s.res}${s.value ? ' (' + s.value + ')' : ''}`).slice(0, 6).join('; ');
  return `- ${title(c)} S/N ${c.ctx.serial || '?'} ${c.ctx.smu ? c.ctx.smu + ' h' : ''} on ${new Date(c.at).toISOString().slice(0, 10)}. Complaint: ${c.ctx.complaint || '?'}. Codes: ${codesOfR(c).slice(0, 8).join(', ') || 'none'}${shared.length ? ' (shared: ' + shared.join(', ') + ')' : ''}. Checks: ${chk || 'none recorded'}. ${fix}`;
}
const pastBlock = sims => sims.length ? `PAST CASES FROM THIS SHOP (similar codes, model or complaint; most similar first):\n${sims.map(caseBrief).join('\n')}\nUse these as evidence: a confirmed fix on the same code and model raises that cause, but still confirm it on this machine with a check before concluding. Cite the past case in the basis (e.g. "same 168-4 on 259D3 FTL01234, fixed by ...").` : '';
/* ---------- prompts ---------- */
const mkOf = r => MAKES[r.ctx.make] || MAKES.cat;
const RULES = mk => `RULES
- Use only what is in the report and the technician's results. Never guess unreadable digits; say so in "notes".
- NEVER state a specification, pressure, voltage, resistance, flow or torque value. Write "per ${mk.info}" wherever a spec is needed.
- Confidence words only: "likely", "possible", "unlikely", "ruled out". Give the basis (which codes, counts, hours or results point to it).
- Think like a senior field tech: group related codes, separate root causes from consequences (e.g. several sensors sharing a supply circuit, low voltage producing multiple codes), weigh active vs logged, counts and first/last hours against current SMU.
- Checks go quickest and cheapest first: visual, connectors, fluid, ${mk.tool} status screens and tests, then measurements, then component swaps.
- Use the SHOP DIAGNOSTIC REFERENCE: decode every FMI and let its meaning steer the first checks (circuit faults vs real out-of-range conditions vs mechanical response), and draw checks from the matching symptom guide, adapted to these codes and this machine. Group codes that share a cause (low voltage, a common sensor supply, a data link).
- Use MACHINE PROFILE to rule hypotheses in or out (e.g. no DEF/SCR causes on a machine without DEF; DPF/regen causes only where a DPF is fitted). If the profile lists build variants, ask which applies when it matters.
- Plain technical language, no first person.`;
const NEXT_SCHEMA = `"next":{"check":string (one specific check, imperative),"why":string (which hypotheses it splits),"how":string (how to do it with ${'${tool}'} / meter / gauge; specs "per manual"),"pass":string (what a good result means),"fail":string (what a bad result means)}`;
function readPrompt(ctx, text, nImg, tsum, past) {
  const mk = MAKES[ctx.make] || MAKES.cat;
  return `You are an expert field diagnostic technician for Cat, John Deere and Bobcat compact construction equipment. Read the ${mk.psr} from ${mk.tool} below (${nImg ? nImg + ' photo(s) attached' : 'text supplied by the technician'}), taken ${LABEL[ctx.label].toLowerCase()}. The text may be a full report or just codes the technician typed or dictated.

TASKS
1. Extract machine info and EVERY diagnostic code and event exactly as written (CID/MID-FMI, SPN-FMI, E-codes, Deere controller codes, Bobcat service codes), active vs logged, with description, count and first/last hours where shown. If a description is not in the report and you know the standard J1939 FMI meaning, you may give the FMI meaning only, marked "(FMI)".
2. Build ranked hypotheses for the root cause given the complaint and any telematics history (frequency, recency, which codes appear together, hours at occurrence).
3. Choose the single best FIRST check: the one that most efficiently splits the top hypotheses.

${RULES(mk)}

${REF(ctx.make, ctx.model)}

${past || ''}

Reply with ONLY JSON:
{"machine":{"model":string,"serial":string,"smu":string,"other":string},"ecms":[{"name":string,"software":string}],"active":[{"code":string,"desc":string,"count":string,"first":string,"last":string}],"logged":[same],"events":[same],"summary":string (2-3 sentences: what the report says, in plain shop terms),"hyp":[{"cause":string,"conf":"likely"|"possible"|"unlikely","basis":string}],${NEXT_SCHEMA.replace('${tool}', mk.tool)},"questions":[string],"notes":string}

MACHINE ON FILE: ${mk.name} ${ctx.model || '?'} serial ${ctx.serial || '?'} hours ${ctx.smu || '?'}
${profOf(ctx.make, ctx.model) ? 'MACHINE PROFILE: ' + profOf(ctx.make, ctx.model) + '\n' : ''}COMPLAINT: ${ctx.complaint || '(none given)'}
${tsum ? 'TELEMATICS (VisionLink / Product Link history for this serial; corroborating evidence only, timestamps are from telematics not the ECM):\n' + tsum + '\n' : ''}${text ? 'REPORT / CODES:\n' + text : ''}`;
}
const codeLine = c => `${c.code} ${c.desc || ''}${c.count ? ' count ' + c.count : ''}${c.first ? ' first ' + c.first : ''}${c.last ? ' last ' + c.last : ''}${fmiShort(c.code) ? ' [' + fmiShort(c.code) + ']' : ''}`;
function caseFile(r) {
  const mk = mkOf(r), x = r.result || {};
  return `MACHINE: ${mk.name} ${r.ctx.model || x.machine?.model || '?'} serial ${r.ctx.serial || x.machine?.serial || '?'} hours ${r.ctx.smu || x.machine?.smu || '?'}
${profOf(r.ctx.make, r.ctx.model || x.machine?.model) ? 'MACHINE PROFILE: ' + profOf(r.ctx.make, r.ctx.model || x.machine?.model) + '\n' : ''}COMPLAINT: ${r.ctx.complaint || '(none)'}
${r.tsum ? 'TELEMATICS HISTORY:\n' + r.tsum + '\n' : ''}ACTIVE: ${(x.active || []).map(codeLine).join('; ') || 'none'}
LOGGED: ${(x.logged || []).map(codeLine).join('; ') || 'none'}
EVENTS: ${(x.events || []).map(codeLine).join('; ') || 'none'}
CURRENT HYPOTHESES: ${(r.hyp || []).map(h => `${h.cause} [${h.conf}]`).join('; ')}
CHECKS DONE SO FAR:
${(r.steps || []).map((s, i) => `${i + 1}. ${s.check} -> ${s.res.toUpperCase()}${s.value ? ', reading: ' + s.value : ''}${s.note ? ', note: ' + s.note : ''}`).join('\n') || '(none)'}`;
}
function stepPrompt(r) {
  const mk = mkOf(r);
  return `You are guiding a field technician through diagnosing a ${mk.name} machine, one check at a time. Update the diagnosis from the latest result.

${caseFile(r)}

TASKS
1. Re-rank the hypotheses using every result. Mark any hypothesis the results exclude "ruled out" and keep it in the list. Add new hypotheses the results reveal.
2. If the evidence now CONFIRMS a root cause (a direct finding, not just an elimination), fill "concl" and set "next" to a confirming or repair-verification check if one is still worth doing, else null. Otherwise "concl" is null and "next" is the best next check.
3. If a result was SKIP, pick a different check.

${RULES(mk)}

${REF(r.ctx.make, r.ctx.model || r.result?.machine?.model)}

${pastBlock(similarCases({ id: r.id, model: r.ctx.model, complaint: r.ctx.complaint, codes: codesOfR(r) }))}
- Only conclude when a result directly shows the fault (failed reading, damaged part found, code follows the part). Elimination alone is "likely", not concluded.

Reply with ONLY JSON:
{"hyp":[{"cause":string,"conf":"likely"|"possible"|"unlikely"|"ruled out","basis":string}],${NEXT_SCHEMA.replace('${tool}', mk.tool)} or null,"concl":{"cause":string,"basis":string,"repair":string (recommended repair in general terms),"verify":string (how to verify after repair, e.g. clear codes, operate, pull an after-repair ${mk.psr})} or null,"comment":string (one or two sentences on what the latest result means)}`;
}
function draftPrompt(r) {
  const mk = mkOf(r);
  return `Write the diagnosis portion of a dealer service report (work order) entry from this case file.

${caseFile(r)}
${r.concl ? 'CONCLUSION: ' + r.concl.cause + ' (' + r.concl.basis + ')' : 'CONCLUSION: not yet isolated'}
${r.outcome ? 'ACTUAL REPAIR AND RESULT (technician confirmed): ' + r.outcome : ''}

STYLE
- One continuous professional paragraph, plain technical language, past tense, NO first person ("Pulled a ${mk.psr} with ${mk.tool}", not "I pulled").
- Start with the reported complaint. Distinguish customer-reported issues from shop-verified findings.
- State that a ${mk.psr} was pulled with ${mk.tool} and which codes were active/logged, exactly as written, with counts where given.
- Then each check performed, in order, with readings exactly as recorded and what each check established.
- Include ONLY checks and results listed above. Never add steps, readings, repairs or results that are not recorded. Skipped checks are left out.
- Finish with the actual status: the isolated cause if concluded, or that diagnosis is ongoing. Never claim a repair was made or the machine passed unless recorded.
- Codes, model, serial and readings exactly as given.

Reply with ONLY JSON: {"text":string,"questions":[string] (details a service writer would need that are missing)}`;
}

/* ---------- triage ---------- */
$('#t-go').onclick = async () => {
  const msg = $('#t-msg'), btn = $('#t-go');
  const files = [...$('#t-file').files], typed = $('#t-text').value.trim();
  if (!files.length && !typed && !telemSummary($('#t-serial').value.trim().toUpperCase())) { msg.textContent = 'Paste codes or attach the report first.'; return; }
  const ctx = { make: $('#t-make').value, model: $('#t-model').value.trim(), serial: $('#t-serial').value.trim().toUpperCase(), smu: $('#t-smu').value.trim(), label: $('#t-label').value, complaint: $('#t-comp').value.trim() };
  btn.disabled = true;
  try {
    const imgs = files.filter(f => f.type.startsWith('image/')), docs = files.filter(f => !f.type.startsWith('image/'));
    let text = typed ? typed + '\n\n' : '';
    for (const f of docs) {
      msg.textContent = 'Reading ' + f.name + '…';
      if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) text += await pdfText(f);
      else if (/html?$/i.test(f.name) || /html/.test(f.type)) text += htmlText(await f.text());
      else text += await f.text();
      text += '\n\n';
    }
    if (docs.length && !imgs.length && !typed && text.replace(/\s/g, '').length < 40) { msg.textContent = 'That file has no readable text (likely a scan). Attach photos of it instead.'; return; }
    if (imgs.length > 8) { msg.textContent = 'Too many photos at once: 8 max.'; return; }
    msg.innerHTML = ai.mode() === 'account' ? '<span class="busy"></span>Claude is reading the report and building the diagnosis…' : 'Waiting for Claude\'s reply…';
    const tsum = telemSummary(ctx.serial);
    const past = pastBlock(similarCases({ model: ctx.model, complaint: ctx.complaint, text: text.slice(0, 20000) + ' ' + (tsum || '') }));
    const res = await ai.json(readPrompt(ctx, text.slice(0, 150000), imgs.length, tsum, past), { modelTier: 'complex', ...(imgs.length ? { images: imgs } : {}) });
    const m = res.machine || {};
    if (!ctx.model && m.model) ctx.model = m.model; if (!ctx.serial && m.serial) ctx.serial = String(m.serial).toUpperCase(); if (!ctx.smu && m.smu) ctx.smu = m.smu;
    const { hyp, next, ...result } = res;
    const r = { id: 'r_' + uid(), at: Date.now(), ctx, tsum, name: files.map(f => f.name).join(', ').slice(0, 100) || 'Typed codes', src: typed.slice(0, 6000), result, hyp: hyp || [], next: next || null, steps: [], concl: null, status: 'open' };
    reports.unshift(r); put(r);
    ['#t-text', '#t-comp', '#t-file'].forEach(s => $(s).value = '');
    msg.textContent = ''; cur.rid = r.id; go('diag');
  } catch (e) { msg.textContent = errMsg(e); }
  finally { btn.disabled = false; }
};
const title = r => [MAKES[r.ctx.make]?.name, r.ctx.model].filter(Boolean).join(' ') || 'Unknown machine';
const statusPill = r => `<span class="pill ${r.status === 'isolated' ? 'p-iso' : r.status === 'closed' ? 'p-closed' : 'p-open'}">${r.status === 'isolated' ? 'Isolated' : r.status === 'closed' ? 'Closed' : 'Open'}</span>`;
const itemHtml = r => `<button class="item" type="button" data-rid="${r.id}"${cur.rid === r.id && cur.tab === 'diag' ? ' aria-current="true"' : ''}><span class="t"><span>${esc(title(r))}</span>${statusPill(r)}</span><span class="s mono">${esc(r.ctx.serial || 'No serial')}${r.ctx.smu ? ' · ' + esc(r.ctx.smu) + ' h' : ''} · ${esc(LABEL[r.ctx.label])}</span><span class="s">${(r.result?.active || []).length} active, ${(r.result?.logged || []).length} logged · ${esc(when(r.at))}</span></button>`;
function bindItems(root) { root.querySelectorAll('[data-rid]').forEach(b => b.onclick = () => { cur.rid = b.dataset.rid; go('diag'); }); }
function renderRecent() {
  const el = $('#t-recent');
  el.innerHTML = reports.length ? reports.slice(0, 5).map(itemHtml).join('') : '<div class="empty"><b>No reports yet.</b>Each read is saved here with its diagnosis, so you can pick up a job on another device.</div>';
  bindItems(el);
}

/* ---------- diagnose ---------- */
const cur = { tab: 'triage', rid: null, res: null, serial: null, busy: false, tm: null, pend: null };
function codeTable(t, a) {
  if (!a || !a.length) return '';
  return `<h4>${t} (${a.length})</h4><div class="scroll"><table class="stack"><thead><tr><th>Code</th><th>Description</th><th>Count</th><th>First</th><th>Last</th></tr></thead><tbody>${a.map(c => `<tr><td class="mono">${esc(c.code)}</td><td>${esc(c.desc)}</td><td class="mono n">${esc(c.count)}</td><td class="mono n">${esc(c.first)}</td><td class="mono n">${esc(c.last)}</td></tr>`).join('')}</tbody></table></div>`;
}
function gauges(hyp) {
  if (!hyp || !hyp.length) return '<p class="note">No hypotheses yet.</p>';
  const ord = { likely: 0, possible: 1, unlikely: 2, 'ruled out': 3 };
  return '<div class="gauges">' + [...hyp].sort((a, b) => (ord[a.conf] ?? 2) - (ord[b.conf] ?? 2)).map(h => { const [w, c] = CONF[h.conf] || CONF.possible; return `<div class="gz${h.conf === 'ruled out' ? ' out' : ''}" style="--gc:${c}"><span class="c">${esc(h.cause)}</span><span class="k" style="color:${c === 'var(--accent)' ? 'var(--accent-ink)' : c}">${esc(h.conf)}</span><span class="bar"><i style="width:${w}%"></i></span>${h.basis ? `<span class="b">${esc(h.basis)}</span>` : ''}</div>`; }).join('') + '</div>';
}
const RES = { pass: ['Pass', 'var(--good)'], fail: ['Fail', 'var(--bad)'], skip: ['Skipped', 'var(--muted)'], found: ['Found', 'var(--accent)'] };
function renderDiag() {
  const q = $('#d-q').value.trim().toLowerCase();
  const list = reports.filter(r => !q || JSON.stringify([r.ctx, (r.result?.active || []).map(c => c.code), (r.result?.logged || []).map(c => c.code)]).toLowerCase().includes(q));
  $('#d-list').innerHTML = list.length ? list.map(itemHtml).join('') : `<div class="empty"><b>${reports.length ? 'No match.' : 'Nothing to diagnose yet.'}</b>${reports.length ? 'Try a serial or code.' : 'Start on the Intake tab.'}</div>`;
  bindItems($('#d-list'));
  const r = reports.find(x => x.id === cur.rid), ed = $('#d-ed'), sp = $('#v-diag');
  sp.classList.toggle('open', !!r);
  if (!r) { ed.innerHTML = '<div class="empty"><b>Pick a report.</b>Its fault picture and next check open here.</div>'; return; }
  const x = r.result || {}, mk = mkOf(r), m = x.machine || {};
  ed.innerHTML = `
  <div class="row"><button class="btn sm back" type="button" id="d-back">← Reports</button></div>
  <div class="panel">
    <div class="row" style="justify-content:space-between"><h3>${esc(title(r))}</h3>${statusPill(r)}</div>
    <div class="mono note">${esc([r.ctx.serial && 'S/N ' + r.ctx.serial, r.ctx.smu && r.ctx.smu + ' h', LABEL[r.ctx.label], when(r.at), m.other].filter(Boolean).join(' · '))}</div>
    ${r.ctx.complaint ? `<p style="margin:0"><b>Complaint:</b> ${esc(r.ctx.complaint)}</p>` : ''}
    ${x.summary ? `<p style="margin:0">${esc(x.summary)}</p>` : ''}
    <details${(x.active || []).length + (x.logged || []).length < 8 ? ' open' : ''}><summary>Codes: ${(x.active || []).length} active · ${(x.logged || []).length} logged · ${(x.events || []).length} events</summary><div class="col">
      ${codeTable('Active', x.active)}${codeTable('Logged', x.logged)}${codeTable('Events', x.events)}
      ${(x.ecms || []).length ? `<div class="note mono">${x.ecms.map(e => esc(e.name + (e.software ? ' ' + e.software : ''))).join(' · ')}</div>` : ''}
      ${x.notes ? `<div class="warn">${esc(x.notes)}</div>` : ''}
      <div class="row"><button class="btn sm" type="button" id="d-cpcodes">Copy codes</button></div>
    </div></details>
  </div>
  ${(() => { const sims = similarCases({ id: r.id, model: r.ctx.model, complaint: r.ctx.complaint, codes: codesOfR(r) }); return sims.length ? `<div class="panel"><h2>Similar past cases</h2><p class="note" style="margin:0">The diagnosis uses these as evidence.</p><div class="list">${sims.map(({ c, shared }) => `<button class="item" type="button" data-rid="${c.id}"><span class="t"><span>${esc(title(c))} <span class="mono">${esc(c.ctx.serial || '')}</span></span>${c.outcome ? '<span class="pill p-iso">Fixed</span>' : statusPill(c)}</span><span class="s">${shared.length ? 'Shared codes: ' + esc(shared.join(', ')) + ' · ' : ''}${esc(when(c.at))}</span><span class="s">${esc(c.outcome || c.concl?.cause || '')}</span></button>`).join('')}</div></div>` : ''; })()}
  <div class="panel"><h2>Readouts: suspected causes</h2>${gauges(r.hyp)}${r.comment ? `<p class="note" style="margin:0">${esc(r.comment)}</p>` : ''}</div>
  ${r.concl ? `<div class="concl"><h4>Diagnosis</h4><div class="q">${esc(r.concl.cause)}</div><div>${esc(r.concl.basis)}</div>${r.concl.repair ? `<div><b>Repair:</b> ${esc(r.concl.repair)}</div>` : ''}${r.concl.verify ? `<div><b>Verify:</b> ${esc(r.concl.verify)}</div>` : ''}<p class="note" style="margin:0">Confirm against ${esc(mk.info)} troubleshooting before replacing parts.</p></div>` : ''}
  ${r.next && r.status !== 'closed' ? `<div class="next"><h4>Ordered check · step ${(r.steps || []).length + 1}</h4><div class="q">${esc(r.next.check)}</div>
    ${r.next.why ? `<div class="note"><b>Why:</b> ${esc(r.next.why)}</div>` : ''}${r.next.how ? `<div><b>How:</b> ${esc(r.next.how)}</div>` : ''}
    <div class="exp">${r.next.pass ? `<div style="--ec:var(--good)"><b>Good result:</b> ${esc(r.next.pass)}</div>` : ''}${r.next.fail ? `<div style="--ec:var(--bad)"><b>Bad result:</b> ${esc(r.next.fail)}</div>` : ''}</div>
    <div class="row" role="group" aria-label="Result"><button class="btn pass" data-res="pass" aria-pressed="${cur.res === 'pass'}" type="button">Pass / as expected</button><button class="btn fail" data-res="fail" aria-pressed="${cur.res === 'fail'}" type="button">Fail / out of spec</button><button class="btn skip" data-res="skip" aria-pressed="${cur.res === 'skip'}" type="button">Can't do it</button></div>
    <div class="g2"><label class="f"><span>Reading (exactly as measured)</span><input id="s-val" placeholder="e.g. 4.6 V at pin 1" autocorrect="off" spellcheck="false" autocomplete="off"></label></div>
    <label class="f"><span class="lab">Notes <button class="btn sm mic" type="button" data-mic="s-note" aria-pressed="false" hidden>Dictate</button></span><textarea id="s-note" placeholder="What you saw: connector condition, where measured, key on/engine running…"></textarea></label>
    <div class="row"><button class="btn pri" type="button" id="s-go">Submit result</button><span class="note" id="s-msg" role="status"></span></div>
  </div>` : ''}
  ${r.status !== 'closed' ? `<details><summary>Found the fault yourself?</summary><div class="col"><label class="f"><span>What you found</span><textarea id="f-txt" placeholder="e.g. Chafed harness at the loader arm pivot, signal wire shorted to ground"></textarea></label><div class="row"><button class="btn" type="button" id="f-go">Record finding</button></div></div></details>` : ''}
  <div class="panel"><h2>Chart: checks performed</h2>${(r.steps || []).length ? '<div class="tl">' + r.steps.map((s, i) => { const [l, c] = RES[s.res] || RES.pass; return `<div class="tle" style="--kc:${c}"><span class="h"><b>${l}</b> · step ${i + 1} · ${esc(when(s.at))}</span><span>${esc(s.check)}</span>${s.value ? `<span class="mono">${esc(s.value)}</span>` : ''}${s.note ? `<span class="note">${esc(s.note)}</span>` : ''}</div>`; }).join('') + '</div><div class="row"><button class="btn sm" type="button" id="d-undo">Undo last step</button></div>' : '<p class="note">None yet. Results you submit build the record for the work order.</p>'}</div>
  ${(x.questions || []).length ? `<div class="panel"><h2>Open questions</h2><ul style="margin:0;padding-left:20px">${x.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}
  <div class="panel"><h2>Work order</h2><div class="row"><button class="btn pri" type="button" id="d-draft">Draft service report entry</button><span class="note" id="dr-msg" role="status"></span></div>
    ${r.draft ? `<div class="out" id="dr-out">${esc(r.draft.text)}</div><div class="row"><button class="btn sm" type="button" id="dr-copy">Copy</button></div>${(r.draft.questions || []).length ? `<div class="warn"><b>Still needed:</b><ul style="margin:4px 0 0;padding-left:20px">${r.draft.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}` : '<p class="note">Builds a paragraph from the recorded checks only, in your report style.</p>'}
    <label class="f"><span class="lab">Actual repair &amp; result (teaches future diagnoses) <button class="btn sm mic" type="button" data-mic="d-out" aria-pressed="false" hidden>Dictate</button></span><textarea id="d-out" placeholder="e.g. Replaced alternator; charging voltage normal, 168-4 did not return after 2 h run">${esc(r.outcome || '')}</textarea></label>
    <div class="row">${r.status !== 'closed' ? '<button class="btn sm pri" type="button" id="d-close">Save fix &amp; close</button>' : '<button class="btn sm" type="button" id="d-saveout">Save fix</button><button class="btn sm" type="button" id="d-reopen">Reopen</button>'}<button class="btn sm bad" type="button" id="d-del">Delete report</button></div>
  </div>`;
  if (dict) ed.querySelectorAll('[data-mic]').forEach(wireMic);
  $('#d-back').onclick = () => { cur.rid = null; renderDiag(); };
  $('#d-cpcodes').onclick = () => copy([...(x.active || []).map(c => 'ACTIVE ' + codeLine(c)), ...(x.logged || []).map(c => 'LOGGED ' + codeLine(c))].join('\n'));
  ed.querySelectorAll('[data-res]').forEach(b => b.onclick = () => { cur.res = b.dataset.res; ed.querySelectorAll('[data-res]').forEach(y => y.setAttribute('aria-pressed', y === b)); });
  const sgo = $('#s-go'); if (sgo) sgo.onclick = () => { if (!cur.res) { $('#s-msg').textContent = 'Choose Pass, Fail or Can\'t do it.'; return; } step(r, { check: r.next.check, res: cur.res, value: $('#s-val').value.trim(), note: $('#s-note').value.trim() }, $('#s-msg'), sgo); };
  const fgo = $('#f-go'); if (fgo) fgo.onclick = () => { const t = $('#f-txt').value.trim(); if (!t) return; step(r, { check: 'Technician finding', res: 'found', value: '', note: t }, $('#s-msg') || $('#dr-msg'), fgo); };
  const undo = $('#d-undo'); if (undo) undo.onclick = () => { if (undo.dataset.a !== '1') { undo.dataset.a = '1'; undo.textContent = 'Tap again to undo'; return; } const s = r.steps.pop(); if (s.prev) { r.hyp = s.prev.hyp; r.next = s.prev.next; r.concl = s.prev.concl; r.status = s.prev.status; r.comment = s.prev.comment; } delete r.draft; put(r); renderDiag(); };
  $('#d-draft').onclick = () => draft(r);
  const cp = $('#dr-copy'); if (cp) cp.onclick = () => copy(r.draft.text);
  ed.querySelectorAll('.dc [data-rid], #d-ed [data-rid]').forEach(b => b.onclick = () => { cur.rid = b.dataset.rid; renderDiag(); scrollTo({ top: 0 }); });
  const cl = $('#d-close'); if (cl) cl.onclick = () => { r.outcome = $('#d-out').value.trim(); r.status = 'closed'; put(r); render(); toast(r.outcome ? 'Closed. Fix saved for future diagnoses' : 'Closed'); };
  const so = $('#d-saveout'); if (so) so.onclick = () => { r.outcome = $('#d-out').value.trim(); put(r); toast('Fix saved for future diagnoses'); renderDiag(); };
  const ro = $('#d-reopen'); if (ro) ro.onclick = () => { r.status = r.concl ? 'isolated' : 'open'; put(r); render(); };
  $('#d-del').onclick = e => { const b = e.target; if (b.dataset.a !== '1') { b.dataset.a = '1'; b.textContent = 'Tap again to delete'; return; } del(r); cur.rid = null; render(); toast('Report deleted'); };
}
async function step(r, s, msg, btn) {
  if (cur.busy) return;
  cur.busy = true; btn.disabled = true; msg.innerHTML = '<span class="busy"></span>Updating the diagnosis…';
  const prev = JSON.parse(JSON.stringify({ hyp: r.hyp, next: r.next, concl: r.concl, status: r.status, comment: r.comment }));
  r.steps = r.steps || []; r.steps.push({ ...s, at: Date.now(), prev });
  try {
    const o = await ai.json(stepPrompt(r), { modelTier: 'complex' });
    r.hyp = o.hyp || r.hyp; r.next = o.next || null; r.concl = o.concl || null; r.comment = o.comment || '';
    if (r.concl) r.status = 'isolated';
    delete r.draft; cur.res = null; put(r); renderDiag(); renderRecent();
  } catch (e) { r.steps.pop(); msg.textContent = errMsg(e); btn.disabled = false; }
  finally { cur.busy = false; }
}
async function draft(r) {
  const msg = $('#dr-msg'), b = $('#d-draft');
  b.disabled = true; msg.innerHTML = '<span class="busy"></span>Writing…';
  try { r.draft = await ai.json(draftPrompt(r), { modelTier: 'default' }); put(r); renderDiag(); }
  catch (e) { msg.textContent = errMsg(e); b.disabled = false; }
}
async function copy(t) { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (e) { toast('Copy blocked: select and copy the text instead'); } }
$('#d-q').oninput = renderDiag;

/* ---------- history ---------- */
const keyOf = r => r.ctx.serial || ('?' + title(r));
function idx(r) { const m = new Map(); (r.result?.active || []).forEach(c => c.code && m.set(c.code.trim(), { ...c, st: 'active' })); (r.result?.logged || []).forEach(c => c.code && !m.has(c.code.trim()) && m.set(c.code.trim(), { ...c, st: 'logged' })); return m; }
const num = v => parseFloat(String(v || '').replace(/[^\d.]/g, '')) || 0;
function renderHist() {
  const groups = new Map();
  reports.forEach(r => { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const q = $('#h-q').value.trim().toLowerCase();
  const keys = [...groups.keys()].filter(k => !q || (k + ' ' + title(groups.get(k)[0])).toLowerCase().includes(q));
  $('#h-list').innerHTML = keys.length ? keys.map(k => { const g = groups.get(k), r = g[0]; return `<button class="item" type="button" data-ser="${esc(k)}"${cur.serial === k ? ' aria-current="true"' : ''}><span class="t"><span class="mono">${esc(k.startsWith('?') ? 'No serial' : k)}</span><span class="pill p-lab">${g.length} PSR${g.length > 1 ? 's' : ''}</span></span><span class="s">${esc(title(r))} · last ${esc(when(r.at))}</span></button>`; }).join('') : '<div class="empty"><b>No machines yet.</b>Every report you read is grouped here by serial number.</div>';
  $('#h-list').querySelectorAll('[data-ser]').forEach(b => b.onclick = () => { cur.serial = b.dataset.ser; renderHist(); });
  const g = groups.get(cur.serial), ed = $('#h-ed');
  $('#v-hist').classList.toggle('open', !!g);
  if (!g) { ed.innerHTML = '<div class="empty"><b>Pick a machine.</b>See every PSR on one timeline and which codes keep coming back.</div>'; return; }
  const asc = [...g].sort((a, b) => a.at - b.at);
  const rec = new Map();
  asc.forEach(r => idx(r).forEach((c, code) => { const e = rec.get(code) || { code, desc: c.desc, n: 0, act: 0, firstAt: r.at, lastAt: r.at, lastCount: '' }; e.n++; if (c.st === 'active') e.act++; e.lastAt = r.at; e.lastCount = c.count || e.lastCount; e.desc = e.desc || c.desc; rec.set(code, e); }));
  const recs = [...rec.values()].sort((a, b) => b.n - a.n || b.act - a.act);
  const opt = (sel) => asc.map(r => `<option value="${r.id}"${r.id === sel ? ' selected' : ''}>${esc(when(r.at) + ' · ' + LABEL[r.ctx.label] + (r.ctx.smu ? ' · ' + r.ctx.smu + ' h' : ''))}</option>`).join('');
  const A = asc.length > 1 ? asc[asc.length - 2].id : '', B = asc[asc.length - 1].id;
  ed.innerHTML = `<div class="row"><button class="btn sm back" type="button" id="h-back">← Machines</button></div>
  <div class="panel"><h3 class="mono">${esc(cur.serial.startsWith('?') ? 'No serial recorded' : cur.serial)}</h3><div class="note">${esc(title(g[0]))} · ${g.length} status report${g.length > 1 ? 's' : ''}</div>
    <h4>Codes across visits</h4>${recs.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Code</th><th>Description</th><th>Seen on</th><th>Active on</th><th>Last count</th></tr></thead><tbody>${recs.map(e => `<tr><td class="mono">${esc(e.code)}</td><td>${esc(e.desc)}</td><td class="mono n${e.n > 1 ? ' st-r' : ''}">${e.n} of ${g.length}</td><td class="mono n">${e.act}</td><td class="mono n">${esc(e.lastCount)}</td></tr>`).join('')}</tbody></table></div><p class="note" style="margin:0">Red = the code shows up on more than one report for this machine.</p>` : '<p class="note">No codes recorded.</p>'}
  </div>
  <div class="panel"><h2>Timeline</h2><div class="tl">${[...asc].reverse().map(r => `<div class="tle" style="--kc:${r.status === 'isolated' ? 'var(--good)' : 'var(--accent)'}"><span class="h"><b>${esc(LABEL[r.ctx.label])}</b> · ${esc(when(r.at))}${r.ctx.smu ? ' · ' + esc(r.ctx.smu) + ' h' : ''}</span><span>${(r.result?.active || []).map(c => esc(c.code)).join(', ') || 'No active codes'}${r.concl ? ' → <b>' + esc(r.concl.cause) + '</b>' : ''}</span><span><button class="btn sm" type="button" data-rid="${r.id}">Open</button></span></div>`).join('')}</div></div>
  ${tmPanel(cur.serial)}
  ${asc.length > 1 ? `<div class="panel"><h2>Compare two reports</h2><div class="g2"><label class="f"><span>Earlier</span><select id="c-a">${opt(A)}</select></label><label class="f"><span>Later</span><select id="c-b">${opt(B)}</select></label></div><div id="c-out"></div></div>` : ''}`;
  $('#h-back').onclick = () => { cur.serial = null; renderHist(); };
  ed.querySelectorAll('[data-rid]').forEach(b => b.onclick = () => { cur.rid = b.dataset.rid; go('diag'); });
  ed.querySelectorAll('[data-tm]').forEach(b => b.onclick = () => { cur.tm = b.dataset.tm; go('telem'); });
  if (asc.length > 1) { const cmp = () => compare(reports.find(r => r.id === $('#c-a').value), reports.find(r => r.id === $('#c-b').value)); $('#c-a').onchange = cmp; $('#c-b').onchange = cmp; cmp(); }
}
function compare(a, b) {
  const o = $('#c-out'); if (!a || !b || a === b) { o.innerHTML = '<p class="note">Pick two different reports.</p>'; return; }
  const X = idx(a), Y = idx(b), fmt = c => c ? c.st + (c.count ? ' ×' + c.count : '') : '—';
  const rows = [...new Set([...X.keys(), ...Y.keys()])].map(code => { const x = X.get(code), y = Y.get(code); let s, cl;
    if (!x) { s = 'Appeared'; cl = 'st-a'; } else if (x.st === 'active' && (!y || y.st !== 'active')) { s = 'Cleared'; cl = 'st-c'; } else if (y && y.st === 'active') { s = 'Still active'; cl = 'st-r'; } else if (y && num(y.count) > num(x.count)) { s = 'Count rose'; cl = 'st-r'; } else { s = 'No change'; cl = ''; }
    return { code, desc: (y || x).desc || '', b: fmt(x), a: fmt(y), s, cl }; });
  const ord = { 'Still active': 0, 'Count rose': 1, Appeared: 2, Cleared: 3, 'No change': 4 }; rows.sort((p, q) => ord[p.s] - ord[q.s]);
  o.innerHTML = rows.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Code</th><th>Description</th><th>Earlier</th><th>Later</th><th>Result</th></tr></thead><tbody>${rows.map(r => `<tr><td class="mono">${esc(r.code)}</td><td>${esc(r.desc)}</td><td class="mono">${esc(r.b)}</td><td class="mono">${esc(r.a)}</td><td><b class="${r.cl}">${r.s}</b></td></tr>`).join('')}</tbody></table></div><p class="note" style="margin:0">Built from Claude's reading of each report; check against the originals before relying on it.</p>` : '<p class="note">Neither report has codes.</p>';
}
$('#h-q').oninput = renderHist;

/* ---------- telematics: VisionLink CSV/XLSX + ISO 15143-3 (AEMP 2.0) JSON ---------- */
const XLSX_URL = 'vendor/xlsx.full.min.js';   // bundled: works offline
let xlsxReady = null;
const loadXlsx = () => xlsxReady || (xlsxReady = new Promise((res, rej) => { const s = document.createElement('script'); s.src = XLSX_URL; s.onload = () => res(window.XLSX); s.onerror = () => { xlsxReady = null; rej(new Error('spreadsheet reader failed to load')); }; document.head.appendChild(s); }));
const MAX_EV = 1500;
const tKey = s => 't_' + String(s || 'UNKNOWN').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 60);
const tOf = serial => serial ? telem.find(t => t.id === tKey(serial)) : null;
const isoOf = v => { if (v == null || v === '') return ''; if (v instanceof Date) return isNaN(v) ? '' : v.toISOString(); const s = String(v).trim(); const d = Date.parse(s); return isNaN(d) ? s : new Date(d).toISOString(); };
const dshort = s => { const d = Date.parse(s); return isNaN(d) ? String(s || '') : new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' }); };
const numOr = (v, d) => { const n = parseFloat(String(v ?? '').replace(/[^\d.\-]/g, '')); return isNaN(n) ? d : n; };
const sevNorm = v => { const s = String(v ?? '').trim(); if (!s) return ''; const l = s.toLowerCase(); if (/high|red|3|critical|urgent/.test(l)) return '3'; if (/med|amber|yellow|2|warn/.test(l)) return '2'; if (/low|1|info/.test(l)) return '1'; return s; };
function codeOf(f) {
  let c = String(f.code ?? '').trim();
  const cid = String(f.cid ?? '').trim(), spn = String(f.spn ?? '').trim(), fmi = String(f.fmi ?? '').trim(), eid = String(f.eid ?? '').trim();
  if (!c && (cid || spn) && fmi !== '') c = (cid || spn) + '-' + fmi;
  else if (!c && (cid || spn)) c = cid || spn;
  if (!c && eid) c = /^e/i.test(eid) ? eid.toUpperCase() : 'E' + eid;
  else if (c && fmi !== '' && !/[-.]/.test(c) && /^\d+$/.test(c)) c = c + '-' + fmi;
  return c;
}
/* column auto-detection for exported reports */
const FIELDS = [
  ['serial', 'Serial number', /^(serial|serial ?(number|no\.?|#)|s\/?n|pin|machine ?serial|equipment ?serial|asset ?serial)$/],
  ['model', 'Model', /^(model|equipment ?model|asset ?model)$/],
  ['make', 'Make', /^(make|oem|oem ?name|manufacturer|brand)$/],
  ['cid', 'CID', /^(cid|component ?id)$/], ['spn', 'SPN', /^spn$/], ['mid', 'MID', /^(mid|module ?id)$/],
  ['fmi', 'FMI', /^(fmi|failure ?mode( ?id(entifier)?)?)$/], ['eid', 'Event ID', /^(eid|event ?id|event ?code)$/],
  ['code', 'Fault code', /^(fault ?code|code|dtc|diagnostic ?code|code ?identifier|fault|fault ?id|diagnostic)$/],
  ['desc', 'Description', /desc|fault ?name|message|text/],
  ['sev', 'Severity', /sever|level|priority|urgency/],
  ['count', 'Occurrences', /count|occurrence|qty|times/],
  ['smu', 'Hour meter (SMU)', /hour|smu|meter/],
  ['time', 'Date / time', /date|time|reported|occur|stamp|when/],
  ['src', 'Source / ECM', /source|ecm|controller|component|module|system/]
];
function guessMap(headers) {
  const m = {}, used = new Set(), norm = h => String(h).toLowerCase().replace(/[_\s]+/g, ' ').replace(/[()]/g, '').trim();
  FIELDS.forEach(([k, , re]) => { const i = headers.findIndex((h, j) => !used.has(j) && re.test(norm(h))); if (i >= 0) { m[k] = i; used.add(i); } });
  return m;
}
function rowsToEvents(rows, map, fallbackSerial) {
  const out = [];
  rows.forEach(r => {
    const f = {}; Object.entries(map).forEach(([k, i]) => { if (i !== '' && i != null && i >= 0) f[k] = r[i]; });
    const code = codeOf(f); if (!code) return;
    out.push({ serial: String(f.serial || fallbackSerial || '').trim().toUpperCase(), model: String(f.model || '').trim(), make: String(f.make || '').trim(),
      ev: { code, desc: String(f.desc || '').trim(), sev: sevNorm(f.sev), src: [f.src, f.mid != null && f.mid !== '' ? 'MID ' + f.mid : ''].filter(Boolean).join(' · '), at: isoOf(f.time), smu: f.smu != null && f.smu !== '' ? String(f.smu).trim() : '', n: Math.max(1, Math.round(numOr(f.count, 1))) } });
  });
  return out;
}
/* ISO 15143-3 / AEMP 2.0 JSON: walk any shape, carry the equipment header down */
const gk = (o, ...names) => { const ks = Object.keys(o); for (const n of names) { const k = ks.find(x => x.toLowerCase() === n.toLowerCase()); if (k !== undefined && o[k] != null && o[k] !== '') return o[k]; } return undefined; };
function walkJson(o, ctx, out, snaps, depth = 0) {
  if (depth > 12 || o == null) return;
  if (Array.isArray(o)) { o.forEach(x => walkJson(x, ctx, out, snaps, depth + 1)); return; }
  if (typeof o !== 'object') return;
  const hdr = gk(o, 'EquipmentHeader', 'equipmentHeader', 'header', 'asset') || o;
  const ser = typeof hdr === 'object' ? gk(hdr, 'SerialNumber', 'serialNumber', 'serial', 'PIN', 'equipmentSerialNumber') : undefined;
  const c = ser ? { serial: String(ser).toUpperCase(), model: String(gk(hdr, 'Model', 'model') || ''), make: String(gk(hdr, 'OEMName', 'make', 'Make', 'oem') || '') } : { ...ctx };
  const hrs = gk(o, 'CumulativeOperatingHours', 'cumulativeOperatingHours'), loc = gk(o, 'Location', 'location'), fuel = gk(o, 'FuelRemaining', 'fuelRemaining', 'FuelRemainingRatio'), def = gk(o, 'DEFRemaining', 'defRemaining', 'DEFRemainingRatio');
  if (c.serial && (hrs || loc || fuel || def)) {
    const s = snaps[c.serial] = snaps[c.serial] || { model: c.model, make: c.make };
    if (hrs && typeof hrs === 'object') { s.hours = gk(hrs, 'Hour', 'hour', 'value'); s.hoursAt = gk(hrs, 'datetime', 'dateTime', 'timestamp'); }
    if (loc && typeof loc === 'object') { s.lat = gk(loc, 'Latitude', 'latitude', 'lat'); s.lon = gk(loc, 'Longitude', 'longitude', 'lon'); s.locAt = gk(loc, 'datetime', 'dateTime', 'timestamp'); }
    if (fuel && typeof fuel === 'object') s.fuel = gk(fuel, 'Percent', 'percent', 'value');
    if (def && typeof def === 'object') s.def = gk(def, 'Percent', 'percent', 'value');
  }
  const code = codeOf({ code: gk(o, 'CodeIdentifier', 'codeIdentifier', 'FaultCode', 'faultCode', 'DTC', 'dtc', 'Code', 'code'), cid: gk(o, 'CID', 'cid'), spn: gk(o, 'SPN', 'spn'), fmi: gk(o, 'FMI', 'fmi', 'failureModeIdentifier'), eid: gk(o, 'EID', 'eid', 'EventID', 'eventId') });
  if (code && typeof code === 'string' && !Array.isArray(o)) {
    const mid = gk(o, 'MID', 'mid');
    out.push({ serial: c.serial || '', model: c.model || '', make: c.make || '', ev: { code, desc: String(gk(o, 'CodeDescription', 'codeDescription', 'Description', 'description', 'faultDescription') || ''), sev: sevNorm(gk(o, 'CodeSeverity', 'codeSeverity', 'Severity', 'severity', 'level')), src: [gk(o, 'CodeSource', 'codeSource', 'Source', 'source', 'ecm'), mid ? 'MID ' + mid : ''].filter(Boolean).map(String).join(' · '), at: isoOf(gk(o, 'datetime', 'dateTime', 'timestamp', 'occurredAt', 'eventUTC', 'reportedTime')), smu: String(gk(o, 'Hour', 'hour', 'SMU', 'smu', 'serviceMeterHours', 'hourMeter') ?? ''), n: Math.max(1, Math.round(numOr(gk(o, 'Count', 'count', 'occurrences', 'Occurrences'), 1))) } });
  }
  Object.values(o).forEach(v => { if (v && typeof v === 'object') walkJson(v, c, out, snaps, depth + 1); });
}
function mergeTelem(items, snaps, fname) {
  const bySer = new Map();
  items.forEach(x => { const k = x.serial || 'UNKNOWN'; if (!bySer.has(k)) bySer.set(k, { model: x.model, make: x.make, evs: [] }); const g = bySer.get(k); g.evs.push(x.ev); if (!g.model && x.model) g.model = x.model; if (!g.make && x.make) g.make = x.make; });
  Object.entries(snaps).forEach(([k, s]) => { if (!bySer.has(k)) bySer.set(k, { model: s.model, make: s.make, evs: [] }); });
  let added = 0; const touched = [];
  bySer.forEach((g, ser) => {
    const id = tKey(ser); let t = telem.find(x => x.id === id);
    if (!t) { t = { id, serial: ser, model: '', make: '', snap: {}, events: [], files: [], at: Date.now() }; telem.unshift(t); }
    t.model = t.model || g.model || ''; t.make = t.make || g.make || '';
    const seen = new Set(t.events.map(e => e.code + '|' + e.at + '|' + e.src));
    g.evs.forEach(e => { const k = e.code + '|' + e.at + '|' + e.src; if (!seen.has(k)) { seen.add(k); t.events.push(e); added++; } });
    t.events.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)); t.events = t.events.slice(0, MAX_EV);
    const s = snaps[ser]; if (s) { const { model, make, ...rest } = s; Object.entries(rest).forEach(([k, v]) => { if (v != null && v !== '') t.snap[k] = v; }); }
    t.files = [{ name: fname.slice(0, 80), at: Date.now(), n: g.evs.length }, ...(t.files || [])].slice(0, 20);
    put(t); touched.push(t);
  });
  return { added, touched };
}
function codeStats(t) {
  const m = new Map();
  (t.events || []).forEach(e => { const x = m.get(e.code) || { code: e.code, desc: e.desc, sev: e.sev, n: 0, first: '', last: '', smu: '' }; x.n += e.n || 1; x.desc = x.desc || e.desc; if (e.sev > x.sev) x.sev = e.sev; const d = Date.parse(e.at); if (d) { if (!x.first || d < Date.parse(x.first)) x.first = e.at; if (!x.last || d > Date.parse(x.last)) { x.last = e.at; x.smu = e.smu || x.smu; } } m.set(e.code, x); });
  return [...m.values()].sort((a, b) => b.n - a.n || (Date.parse(b.last) || 0) - (Date.parse(a.last) || 0));
}
function telemSummary(serial) {
  const t = tOf(serial); if (!t || !(t.events || []).length && !Object.keys(t.snap || {}).length) return '';
  const st = codeStats(t), ds = t.events.map(e => Date.parse(e.at)).filter(Boolean), s = t.snap || {};
  const head = `${t.events.length} fault events${ds.length ? ' from ' + new Date(Math.min(...ds)).toISOString().slice(0, 10) + ' to ' + new Date(Math.max(...ds)).toISOString().slice(0, 10) : ''}.` + (s.hours != null ? ` Last reported hours ${s.hours}${s.hoursAt ? ' (' + String(s.hoursAt).slice(0, 10) + ')' : ''}.` : '') + (s.fuel != null ? ` Fuel ${s.fuel}%.` : '') + (s.def != null ? ` DEF ${s.def}%.` : '');
  return head + '\n' + st.slice(0, 15).map(x => `${x.code} ${x.desc} x${x.n}${x.sev ? ' sev ' + x.sev : ''}${x.last ? ', last ' + x.last.slice(0, 10) : ''}${x.smu ? ' @' + x.smu + ' h' : ''}`).join('\n');
}
/* import flow */
async function readTable(file) {
  const X = await loadXlsx();
  const wb = X.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true, raw: /\.csv$/i.test(file.name) });
  let best = null;
  wb.SheetNames.forEach(n => { const rows = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }).filter(r => r.some(c => c !== '')); if (!best || rows.length > best.length) best = rows; });
  return best || [];
}
function headerRow(rows) { let bi = 0, bs = -1; rows.slice(0, 15).forEach((r, i) => { const s = Object.keys(guessMap(r.map(String))).length; if (s > bs) { bs = s; bi = i; } }); return bi; }
function showMapper(rows, fname) {
  const hi = headerRow(rows), headers = rows[hi].map(h => String(h || '').trim()), data = rows.slice(hi + 1), map = guessMap(headers);
  const el = $('#tm-map'), opts = sel => '<option value="">(none)</option>' + headers.map((h, i) => `<option value="${i}"${sel === i ? ' selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('');
  el.innerHTML = `<div class="col"><h4>${esc(fname)}: ${data.length} rows. Check the columns.</h4>
    <div class="maprow">${FIELDS.map(([k, l]) => `<span class="note">${l}</span><select data-mk="${k}" aria-label="${l}">${opts(map[k])}</select>`).join('')}</div>
    <label class="f"><span>Serial for rows without one</span><input id="tm-fser" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="e.g. FTL01234"></label>
    <div class="row"><button class="btn pri" type="button" id="tm-imp">Import</button><button class="btn sm" type="button" id="tm-cancel">Cancel</button></div></div>`;
  $('#tm-cancel').onclick = () => { el.innerHTML = ''; };
  $('#tm-imp').onclick = () => {
    const m = {}; el.querySelectorAll('[data-mk]').forEach(s => { if (s.value !== '') m[s.dataset.mk] = +s.value; });
    if (m.code == null && m.cid == null && m.spn == null && m.eid == null) { $('#tm-msg').textContent = 'Pick the column that holds the fault code (or CID/SPN and FMI).'; return; }
    const items = rowsToEvents(data, m, $('#tm-fser').value.trim());
    finishImport(items, {}, fname); el.innerHTML = '';
  };
}
function finishImport(items, snaps, fname) {
  const msg = $('#tm-msg');
  if (!items.length && !Object.keys(snaps).length) { msg.textContent = 'No fault codes or machine data found in ' + fname + '.'; return; }
  const { added, touched } = mergeTelem(items, snaps, fname);
  msg.textContent = `${fname}: ${added} new fault event${added === 1 ? '' : 's'} across ${touched.length} machine${touched.length === 1 ? '' : 's'}.`;
  if (touched.length === 1) cur.tm = touched[0].id;
  renderTelem();
}
async function importText(txt, fname) {
  const t = txt.trim();
  if (/^[\[{]/.test(t)) { const out = [], snaps = {}; walkJson(JSON.parse(t), {}, out, snaps); finishImport(out, snaps, fname); return; }
  const X = await loadXlsx(); const wb = X.read(t, { type: 'string', raw: true });
  showMapper(X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }).filter(r => r.some(c => c !== '')), fname);
}
$('#tm-file').onchange = async () => {
  const files = [...$('#tm-file').files], msg = $('#tm-msg'); $('#tm-file').value = '';
  for (const f of files) {
    try {
      msg.innerHTML = '<span class="busy"></span>Reading ' + esc(f.name) + '…';
      if (/\.json$/i.test(f.name) || /json/.test(f.type)) await importText(await f.text(), f.name);
      else if (/\.csv$/i.test(f.name) || /csv|text\/plain/.test(f.type)) await importText(await f.text(), f.name);
      else { const rows = await readTable(f); msg.textContent = ''; showMapper(rows, f.name); }
    } catch (e) { msg.textContent = "Couldn't read " + f.name + ': ' + (e && e.message ? e.message : 'unknown format'); }
  }
};
$('#tm-pgo').onclick = async () => { const t = $('#tm-paste').value; if (!t.trim()) return; try { await importText(t, 'Pasted data'); $('#tm-paste').value = ''; } catch (e) { $('#tm-msg').textContent = "Couldn't parse that: " + (e && e.message ? e.message : 'unknown format'); } };
$('#tm-q').oninput = () => renderTelem();
const sevPill = s => s ? `<span class="sev s${esc(s)}">${/^[123]$/.test(s) ? 'Sev ' + esc(s) : esc(s)}</span>` : '';
function dayBars(t) {
  const c = new Map(); t.events.forEach(e => { const d = Date.parse(e.at); if (d) { const k = new Date(d).toISOString().slice(0, 10); c.set(k, (c.get(k) || 0) + (e.n || 1)); } });
  if (!c.size) return '';
  const keys = [...c.keys()].sort(), end = Date.parse(keys[keys.length - 1]), start = Math.max(Date.parse(keys[0]), end - 59 * 864e5), days = [];
  for (let d = start; d <= end; d += 864e5) days.push(new Date(d).toISOString().slice(0, 10));
  const mx = Math.max(...days.map(d => c.get(d) || 0), 1);
  return `<h4>Fault events per day</h4><div class="days" role="img" aria-label="Fault events per day">${days.map(d => { const v = c.get(d) || 0; return `<i class="${v ? '' : 'z'}" style="height:${v ? Math.max(4, v / mx * 100) : 0}%" title="${d}: ${v}"></i>`; }).join('')}</div><div class="dayax"><span>${dshort(days[0])}</span><span>peak ${mx}/day</span><span>${dshort(days[days.length - 1])}</span></div>`;
}
function tmPanel(serial) {
  const t = serial && !serial.startsWith('?') ? tOf(serial) : null; if (!t) return '';
  const st = codeStats(t).slice(0, 6);
  return `<div class="panel"><h2>Telematics</h2><p class="note" style="margin:0">${t.events.length} fault events on file from VisionLink.</p>${st.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Code</th><th>Description</th><th>Events</th><th>Last</th></tr></thead><tbody>${st.map(x => `<tr><td class="mono">${esc(x.code)}</td><td>${esc(x.desc)}</td><td class="mono n">${x.n}</td><td class="mono">${esc(dshort(x.last))}</td></tr>`).join('')}</tbody></table></div>` : ''}<div class="row"><button class="btn sm" type="button" data-tm="${t.id}">Open telematics</button></div></div>`;
}
function tmHint() { const el = $('#t-tm'), s = $('#t-serial').value.trim().toUpperCase(), t = tOf(s); el.hidden = !t; if (t) el.innerHTML = `<b>Telematics on file for ${esc(s)}:</b> ${t.events.length} fault events will be included in the read.`; }
$('#t-serial').addEventListener('input', tmHint);
function renderTelem() {
  const q = $('#tm-q').value.trim().toLowerCase();
  const list = telem.filter(t => !q || (t.serial + ' ' + t.model + ' ' + t.make).toLowerCase().includes(q));
  $('#tm-list').innerHTML = list.length ? list.map(t => `<button class="item" type="button" data-tid="${t.id}"${cur.tm === t.id ? ' aria-current="true"' : ''}><span class="t"><span class="mono">${esc(t.serial)}</span><span class="pill p-lab">${t.events.length} events</span></span><span class="s">${esc([t.make, t.model].filter(Boolean).join(' ') || 'Model not in file')}${t.snap && t.snap.hours != null ? ' · ' + esc(t.snap.hours) + ' h' : ''}</span></button>`).join('') : `<div class="empty"><b>${telem.length ? 'No match.' : 'No telematics yet.'}</b>${telem.length ? '' : 'Export a fault code report from VisionLink, or save an ISO 15143-3 API response, and import it above.'}</div>`;
  $('#tm-list').querySelectorAll('[data-tid]').forEach(b => b.onclick = () => { cur.tm = b.dataset.tid; renderTelem(); });
  const t = telem.find(x => x.id === cur.tm), ed = $('#tm-ed');
  $('#v-telem').classList.toggle('open', !!t);
  if (!t) { ed.innerHTML = '<div class="empty"><b>Pick a machine.</b>Fault history, hours and fluid levels from telematics open here.</div>'; return; }
  const s = t.snap || {}, st = codeStats(t), lat = numOr(s.lat, NaN), lon = numOr(s.lon, NaN);
  const tile = (v, l) => v != null && v !== '' ? `<div class="tile"><b>${esc(v)}</b><span>${l}</span></div>` : '';
  ed.innerHTML = `<div class="row"><button class="btn sm back" type="button" id="tm-back">← Machines</button></div>
  <div class="panel"><div class="row" style="justify-content:space-between"><h3 class="mono">${esc(t.serial)}</h3><span class="note">${esc([t.make, t.model].filter(Boolean).join(' '))}</span></div>
    <div class="tiles">${tile(st.length, 'Distinct codes')}${tile(t.events.length, 'Fault events')}${tile(s.hours, 'Hours' + (s.hoursAt ? ' · ' + dshort(s.hoursAt) : ''))}${tile(s.fuel != null ? s.fuel + '%' : null, 'Fuel remaining')}${tile(s.def != null ? s.def + '%' : null, 'DEF remaining')}</div>
    ${isFinite(lat) && isFinite(lon) ? `<div class="note">Last location ${lat.toFixed(5)}, ${lon.toFixed(5)}${s.locAt ? ' · ' + esc(dshort(s.locAt)) : ''} · <a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener">Open map</a></div>` : ''}
    ${dayBars(t)}
    <div class="row"><button class="btn pri" type="button" id="tm-diag">Diagnose with this data</button></div>
  </div>
  <div class="panel"><h2>Codes reported</h2>${st.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Code</th><th>Description</th><th>Severity</th><th>Events</th><th>First</th><th>Last</th><th>Last SMU</th></tr></thead><tbody>${st.map(x => `<tr><td class="mono">${esc(x.code)}</td><td>${esc(x.desc)}</td><td>${sevPill(x.sev)}</td><td class="mono n">${x.n}</td><td class="mono">${esc(dshort(x.first))}</td><td class="mono">${esc(dshort(x.last))}</td><td class="mono n">${esc(x.smu)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">No fault codes in the imported data, only machine status.</p>'}</div>
  <details><summary>Latest ${Math.min(40, t.events.length)} events</summary><div class="scroll"><table class="stack"><thead><tr><th>When</th><th>Code</th><th>Description</th><th>Source</th><th>SMU</th></tr></thead><tbody>${t.events.slice(0, 40).map(e => `<tr><td class="mono">${esc(e.at ? when(Date.parse(e.at) || 0) : '')}</td><td class="mono">${esc(e.code)}</td><td>${esc(e.desc)}</td><td>${esc(e.src)}</td><td class="mono n">${esc(e.smu)}</td></tr>`).join('')}</tbody></table></div></details>
  <div class="panel"><h2>Imports</h2><ul style="margin:0;padding-left:20px">${(t.files || []).map(f => `<li>${esc(f.name)} · ${f.n} rows · ${esc(when(f.at))}</li>`).join('')}</ul><div class="row"><button class="btn sm bad" type="button" id="tm-del">Delete this machine's telematics</button></div></div>`;
  $('#tm-back').onclick = () => { cur.tm = null; renderTelem(); };
  $('#tm-diag').onclick = () => {
    const mk = /deere/i.test(t.make) ? 'deere' : /bobcat/i.test(t.make) ? 'bobcat' : /cat|caterpillar/i.test(t.make) || !t.make ? 'cat' : 'other';
    $('#t-make').value = mk; fillModels(); $('#t-model').value = t.model || ''; $('#t-serial').value = t.serial === 'UNKNOWN' ? '' : t.serial; $('#t-smu').value = s.hours != null ? s.hours : '';
    go('triage'); tmHint(); $('#t-comp').focus();
  };
  $('#tm-del').onclick = e => { const b = e.target; if (b.dataset.a !== '1') { b.dataset.a = '1'; b.textContent = 'Tap again to delete'; return; } del(t); cur.tm = null; renderTelem(); toast('Telematics deleted'); };
}

/* ---------- tabs ---------- */
function go(t) {
  cur.tab = t;
  document.querySelectorAll('nav [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  ['triage', 'diag', 'telem', 'hist', 'set'].forEach(k => $('#v-' + k).hidden = k !== t);
  if (t === 'diag') renderDiag(); if (t === 'hist') renderHist(); if (t === 'triage') { renderRecent(); tmHint(); } if (t === 'telem') renderTelem(); if (t === 'set') renderSet();
  scrollTo({ top: 0 });
}
document.querySelectorAll('nav [data-tab]').forEach(b => b.onclick = () => go(b.dataset.tab));

/* ---------- settings: account, Claude, backup, install ---------- */
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (cur.tab === 'set') renderSet(); });
addEventListener('appinstalled', () => { installEvt = null; toast('Installed'); if (cur.tab === 'set') renderSet(); });
function renderSet() {
  const s = backend.session(), st = sync.status, ed = $('#set-ed'), m = ai.mode();
  ed.innerHTML = `
  <div class="panel"><h2>Account &amp; sync</h2>
    ${!backend.ready ? '<p class="note" style="margin:0">Sync isn\'t configured for this copy of the app. Everything is saved on this device.</p>'
    : s ? `<p style="margin:0">Signed in as <b>${esc(s.user.email)}</b>. Same account as Tech Bench.</p>
      <p class="note" style="margin:0">${esc({ syncing: 'Syncing now…', synced: store.dirtyCount() ? store.dirtyCount() + ' change(s) waiting to sync.' : 'Everything is synced.', offline: 'Offline. Changes sync when the signal comes back.', setup: st.error, error: 'Last sync failed: ' + st.error + '. Retrying automatically.', 'signed-out': st.error }[st.phase] || '')}</p>
      <div class="row"><button class="btn sm" type="button" id="a-sync">Sync now</button><button class="btn sm bad" type="button" id="a-out">Sign out</button></div>`
    : `<p class="note" style="margin:0">Sign in with your Tech Bench email to keep cases on your phone and laptop and to let Claude read reports here. Without it, everything stays on this device and Claude works by copy &amp; paste.</p>
      <div class="g2"><label class="f"><span>Email</span><input id="a-email" type="email" autocomplete="username" inputmode="email"></label><label class="f"><span>Password</span><input id="a-pass" type="password" autocomplete="current-password"></label></div>
      <div class="row"><button class="btn pri" type="button" id="a-in">Sign in</button><button class="btn sm" type="button" id="a-up">Create account</button><span class="note" id="a-msg" role="status">${esc(st.error || '')}</span></div>`}
  </div>
  <div class="panel"><h2>Claude</h2>
    <p style="margin:0">${m === 'account' ? '<b>Through your account.</b> Reports, photos and steps go to Claude via your <code>psr</code> function.' : '<b>Copy &amp; paste.</b> Each read shows a prompt to paste into Claude; paste the reply back.'}</p>
    ${backend.ready && s ? `<label class="f"><span>How to reach Claude</span><select id="a-mode"><option value="account"${store.getMeta('aiMode') !== 'manual' ? ' selected' : ''}>Through my account (automatic)</option><option value="manual"${store.getMeta('aiMode') === 'manual' ? ' selected' : ''}>Copy &amp; paste into Claude</option></select></label>` : ''}
    ${store.getMeta('fnMissing') ? '<div class="warn">The <code>psr</code> function wasn\'t found on your Supabase project, so copy &amp; paste is in use. Deploy it (README), then <button class="btn sm" type="button" id="a-retry">Try the function again</button></div>' : ''}
    <p class="note" style="margin:0">Claude never supplies specs here: pressures, voltages and resistances come from SIS, Service ADVISOR or the Bobcat manual.</p>
  </div>
  <div class="panel"><h2>Backup</h2>
    <p class="note" style="margin:0">${reports.length} case${reports.length === 1 ? '' : 's'} and ${telem.length} telematics machine${telem.length === 1 ? '' : 's'} on this device.</p>
    <div class="row"><button class="btn sm" type="button" id="b-exp">Export backup</button><label class="btn sm" style="display:inline-flex;align-items:center">Import backup<input id="b-imp" type="file" accept=".json,application/json" hidden></label><span class="note" id="b-msg" role="status"></span></div>
    <p class="note" style="margin:0">Importing merges by case: the newer copy of each case wins, nothing is duplicated.</p>
  </div>
  <div class="panel"><h2>Install</h2>
    ${standalone() ? `<p style="margin:0"><b>Running as an installed app.</b></p>${IOS ? '<p class="note" style="margin:0">On iPhone the Home Screen app keeps its own storage, separate from Safari. Sign in so cases made in either one show up in both.</p>' : ''}`
    : IOS ? `<ol style="margin:0;padding-left:20px"><li>Open this page in <b>Safari</b>${/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent) ? ' (you are in another browser: copy the link into Safari)' : ''}.</li><li>Tap <span class="kbd">Share</span> (the square with the arrow).</li><li>Tap <span class="kbd">Add to Home Screen</span>, then <span class="kbd">Add</span>.</li></ol><p class="note" style="margin:0">The Home Screen app keeps its own storage, separate from Safari. Sign in first and your cases follow you; otherwise export a backup here and import it there.</p>`
    : installEvt ? '<div class="row"><button class="btn pri" type="button" id="i-go">Install PSR Tool</button></div>'
    : '<ul style="margin:0;padding-left:20px"><li><b>Android (Chrome):</b> ⋮ → Add to Home screen → Install</li><li><b>iPhone (Safari):</b> Share → Add to Home Screen</li><li><b>Windows 11 (Edge or Chrome):</b> install icon at the right of the address bar</li></ul>'}
    <p class="note" style="margin:0">Opens with no signal. Reading a new report needs a connection (or copy &amp; paste once you have one).</p>
  </div>`;
  const msg = t => { const el = $('#a-msg'); if (el) el.textContent = t; };
  const auth = up => async () => {
    const e = $('#a-email').value.trim(), p = $('#a-pass').value; if (!e || !p) return msg('Enter email and password.');
    msg('…');
    try { const r = up ? await backend.signUp(e, p) : await backend.signIn(e, p); if (!r) return msg('Check your email to confirm, then sign in.'); await store.setMeta('fnMissing', false); sync.run(); renderSet(); toast('Signed in'); }
    catch (x) { msg(x.message); }
  };
  if ($('#a-in')) { $('#a-in').onclick = auth(false); $('#a-up').onclick = auth(true); $('#a-pass').onkeydown = ev => { if (ev.key === 'Enter') auth(false)(); }; }
  if ($('#a-sync')) $('#a-sync').onclick = () => sync.run();
  if ($('#a-out')) $('#a-out').onclick = async () => { await backend.signOut(); sync.run(); renderSet(); toast('Signed out. Cases stay on this device'); };
  if ($('#a-mode')) $('#a-mode').onchange = async e => { await store.setMeta('aiMode', e.target.value); renderSet(); };
  if ($('#a-retry')) $('#a-retry').onclick = async () => { await store.setMeta('fnMissing', false); renderSet(); };
  $('#b-exp').onclick = () => { const b = new Blob([JSON.stringify(store.exportAll(), null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'psr-tool-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  $('#b-imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text()), list = Array.isArray(j) ? j : j.docs || [];
      let n = 0; for (const d of list) { if (!d || !d.id) continue; const c = store.get(d.id); if (!c || (c.upd || 0) < (d.upd || 0)) { await store.put(d, true); n++; } }
      load(); render(); $('#b-msg').textContent = n + ' item(s) imported or updated.';
    } catch (x) { $('#b-msg').textContent = "Couldn't read that file: " + x.message; }
  };
  if ($('#i-go')) $('#i-go').onclick = async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; renderSet(); };
}
store.on(w => { if (w.type === 'sync' && cur.tab === 'set') renderSet(); });

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
