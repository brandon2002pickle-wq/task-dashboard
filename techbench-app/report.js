// Shop reference data and the service report instructions, carried over from Tech Bench.
export const MAKES = {
  cat: { name: 'Cat', psr: 'Product Status Report (PSR) with Cat ET', tool: 'Cat ET', info: 'SIS 2.0', parts: 'SIS 2.0 parts', code: 'CID/MID-FMI, SPN-FMI or event code (E###)' },
  deere: { name: 'John Deere', psr: 'machine status report with Service ADVISOR', tool: 'Service ADVISOR', info: 'Deere technical manual', parts: 'Deere Parts Catalog', code: 'Controller + SPN.FMI (e.g. ECU 000110.00)' },
  bobcat: { name: 'Bobcat', psr: 'machine status report with Bobcat Service Analyzer', tool: 'Bobcat Service Analyzer', info: 'Bobcat service manual', parts: 'Bobcat Parts Catalog', code: 'Service code as shown on the display (e.g. M####)' },
  other: { name: 'Other', psr: 'machine status report with the OEM service tool', tool: 'the OEM service tool', info: 'OEM service manual', parts: 'OEM parts catalogue', code: 'Code as shown by the service tool' }
};
export const MODELS = {
  cat: ['226', '232', '236', '242', '246', '262', '272', '239', '249', '259', '279', '289', '299', '299D3', '301.5', '301.7', '302.7', '303.5', '304', '305', '306', '308', '309', '310', '415', '416', '420', '430', '440', '450', '903', '906', '907', '908', '910', '914', 'TH255', 'TH306', 'TH357', 'TH408'],
  deere: ['333G', '331G', '325G', '317G', '332G', '330G', '320G', '318G', '35G', '50G', '60G', '310L', '310SL', '210L'],
  bobcat: ['S450', 'S510', 'S550', 'S570', 'S590', 'S595', 'S630', 'S650', 'S66', 'S76', 'S86', 'T450', 'T550', 'T590', 'T595', 'T650', 'T66', 'T76', 'T86', 'E26', 'E35', 'E42', 'E50', 'E85'],
  other: []
};
export const CATS = { customer: 'Customer', used: 'Adam Lewis used equipment', newsold: 'New sold', stock: 'Stock prep' };
export const STATUS = { open: 'Open', parts: 'Waiting parts', done: 'Complete' };
export const AXF = [
  ['dealer', 'Dealer code', 'input'], ['complaint', 'Customer complaint', 'ta'], ['repair', 'Repair process', 'ta'],
  ['causing', 'Causing failure', 'ta'], ['damage', 'Resultant damage', 'ta'], ['internal', 'Internal notes', 'ta'],
  ['cause', 'Cause code', 'input'], ['second', 'Second code', 'input'], ['part', 'Part number', 'input'],
  ['group', 'Group number', 'input'], ['groupName', 'Group name', 'input']
];
export const AX_DEFAULT = { dealer: 'D435', cause: 'G', second: '49' };
export const NO_PART = { part: '0000000', group: '7595' };
export const SEG_TPL = [['Main repair', ''], ['Clean machine', 'Clean machine'], ['Perform TA1 inspection', 'Perform TA1 inspection'], ['PM service', 'Perform PM service'], ['Travel / field call', 'Travel to and from job site'], ['Custom segment', '']];
export const NON_REPAIR = ['Clean machine', 'Perform TA1 inspection', 'PM service', 'Travel / field call'];
// AX service segments: segment id = service call + "_" + 2-digit seq (SC1431949_03); job code + component code.
// Only codes seen in the TTC1 technician job queue; anything else can be typed.
export const JOB_CODES = { '012': 'Install', '035': 'Troubleshoot', '036': 'Test/Check/Adjust', '044': 'Drain/ Refill', '050': 'Pre-Deliver', '070': 'Clean', '540': 'Perform' };
export const AX_LINES = [
  ['035', '0113', 'Troubleshoot - Fluids & Hydraulics'], ['035', '1400', 'Troubleshoot - Electric System'], ['035', '1401', 'Troubleshoot - Battery'], ['035', '7007', 'Troubleshoot - For Leaks - Attachment'],
  ['012', '4170', 'Install - Track Assembly'], ['012', '6001', 'Install - High Flow - Bucket'], ['012', '7555', 'Install - Motor - Seals & Gaskets'],
  ['036', '7000', 'Test/Check/Adjust - Machine'], ['044', '0113', 'Drain/ Refill - Fluids & Hydraulics'],
  ['070', '7000', 'Clean - Machine'], ['540', '7535', 'Perform - Technical Analysis 1 Inspection'], ['540', '7583', 'Perform - Inspection'], ['050', '7000', 'Pre-Deliver - Machine Inspect /run/ oil samples']
];
export const NON_REPAIR_JOBS = ['050', '070', '540'];   // pre-deliver, clean, perform (inspections)
export const isRepairSeg = s => !(NON_REPAIR.includes(s.title) || NON_REPAIR_JOBS.includes(s.jobCode));
export const seqOf = s => String(s.seq || s.order || '').padStart(2, '0');
/** AX segment id, e.g. SC1431949_03; '' until the service call is entered */
export const segId = (wo, s) => { const c = String(wo || '').trim().toUpperCase(); return c && seqOf(s) !== '00' ? c + '_' + seqOf(s) : ''; };
export const partLocked = s => !(s.warranty && s.hasPart);
export const TL = {
  step: { name: 'Step done', c: 'var(--good)', ph: 'e.g. Removed bucket to access tilt cylinder' },
  finding: { name: 'Finding', c: 'var(--teal)', ph: 'e.g. Tilt cylinder rod seal weeping' },
  part: { name: 'Part', c: 'var(--amber)', ph: 'e.g. 1234567 seal kit' },
  next: { name: 'Next step', c: 'var(--accent)', ph: 'e.g. Install seal kit and torque gland per SIS' },
  pending: { name: 'Waiting on', c: 'var(--bad)', ph: 'e.g. S·O·S sample 1 results' },
  note: { name: 'Note', c: 'var(--muted)', ph: 'e.g. Customer called, needs it back Friday' },
  photo: { name: 'Photo', c: 'var(--teal)', ph: '' }
};
export const WAIT = { sample: { name: 'Oil sample', who: 'S·O·S lab' }, part: { name: 'Part', who: 'Parts' }, tc: { name: 'TC Help Desk ticket', who: 'TC Help Desk' }, approval: { name: 'Customer approval', who: 'Customer' }, other: { name: 'Other', who: '' } };
export const segDefaults = (title, complaint, order, ax = {}) => ({ order, title, seq: String(order).padStart(2, '0'), jobCode: ax.jobCode || '', compCode: ax.compCode || '', notes: '', warranty: false, hasPart: false, ...AX_DEFAULT, ...NO_PART, complaint: complaint || '', repair: '', causing: '', damage: '', internal: '', groupName: '' });

const when = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** chronological timeline text for prompts and handoffs */
export function timelineText(entries, photos) {
  const byId = Object.fromEntries(entries.map(e => [e.id, e]));
  const rows = [
    ...entries.map(e => ({ at: e.fields.at, s: `${when(e.fields.at)} ${(TL[e.fields.kind] || TL.note).name.toUpperCase()}: ${e.fields.text}` +
      (e.fields.kind === 'part' ? ` [${e.fields.pstate || 'ordered'}]` : '') +
      (e.fields.wtype ? ` [waiting on ${e.fields.who || WAIT[e.fields.wtype].name}${e.fields.ref ? ', ref ' + e.fields.ref : ''}]` : '') +
      (e.fields.kind === 'next' || e.fields.kind === 'pending' ? (e.fields.open ? ' (OPEN)' : ' (closed)') : '') })),
    ...photos.map(p => ({ at: p.fields.at, s: `${when(p.fields.at)} PHOTO: ${p.fields.caption || '(no caption)'}${p.fields.pin && byId[p.fields.pin] ? ' (pinned to: ' + byId[p.fields.pin].fields.text + ')' : ''}` }))
  ];
  return rows.sort((a, b) => a.at - b.at).map(r => r.s).join('\n');
}

export function resumeOf(entries) {
  const L = [...entries].sort((a, b) => a.fields.at - b.fields.at);
  const last = [...L].reverse().find(e => e.fields.kind === 'step');
  const next = [...L].reverse().find(e => e.fields.kind === 'next' && e.fields.open);
  const waiting = L.filter(e => (e.fields.kind === 'pending' && e.fields.open) || (e.fields.kind === 'part' && (e.fields.pstate || 'ordered') !== 'installed'));
  return { last, next, waiting };
}

/** the report instructions, one AX segment at a time */
export function draftPrompt(job, seg, segs, entries, photos) {
  const j = job.fields, sg = seg.fields, mk = MAKES[j.make] || MAKES.cat;
  const ordered = [...segs].sort((a, b) => a.fields.order - b.fields.order);
  return `You write service report text for a Thompson Tractor CCE (compact construction equipment) technician entering notes on a work order (dealer code D435). The technician's input may be rough notes, voice dictation or short phrases. Turn it into a professional, chronological account that a service manager, customer or another technician can follow. The text is pasted into the dealer's AX work order fields.

WRITING STYLE
- Plain, technical language, past tense. No first person: write "Removed the left final drive", never "I removed".
- Keep machine models, component names, fault codes and measurements EXACTLY as provided.
- No introductions, headings or commentary inside the field text.

REPAIR PROCESS ("repair") — one continuous paragraph for the customer-facing work order:
- Start with the reported complaint or assigned work. Distinguish what the customer reported from what was verified in the shop.
- Describe the meaningful steps in the order they happened: preparation, diagnosis, access, removal, inspection, repair, reassembly and testing, where applicable.
- Explain why an extra step was necessary when the reason is known (e.g. bucket removed to inspect for a leak, heavy debris removed before inspection, damaged line found while gaining access to a final drive).
- Document what each diagnostic check established and which finding led to the repair. Include codes, readings, run times, sample points, calibrations and parts replaced when provided.
- When a step was repeated, state how many times and what happened in each cycle (e.g. each hydraulic cleanout cycle: when the tank strainer and filter were replaced, when the machine was operated, when each oil sample was collected). Only details the technician confirmed.
- STATUS REPORTS (required in every repair segment): state that a ${mk.psr} was pulled BEFORE the repair (near the start, with the initial inspection/diagnosis) and that one was pulled AFTER the repair (with the final testing). Use the PULLED flags in the INPUT: if a flag is "no", do not claim it; instead add a question asking whether it was pulled. Non-repair segments (cleaning, TA1 inspection, PM, travel) do not need this.
- Finish with the actual result: what was tested, what was observed, and anything still pending. If a leak could not be duplicated, say so. If an oil sample was collected and results are pending, record it that way. NEVER assume the machine passed, the fault cleared or the repair was completed.
- Each sentence documents an action, finding, reason or result. Show the real scope of work and what made the job take longer. No filler.
- Leave shop support, training of others on other jobs and interruptions OUT of this customer-facing paragraph unless SHOP SUPPORT says to include it in the customer copy. Training another technician on THIS same repair may be included as a work step (e.g. "Demonstrated hydraulic oil sampling to another technician during the cleanout. Reviewed the sample collection point and labeling before collecting the next sample.").

INTERNAL NOTES ("internal"):
- Shop support and elapsed time go here, in neutral, specific language, separate from the repair sequence (e.g. "Paused work on this unit to assist another technician with hydraulic diagnostics on a separate job. Resumed reassembly after completing shop assistance.").
- Distinguish hands-on repair time, machine run or wait time, and time supporting other technicians when provided. Use exact hours ONLY when supplied. Never estimate labor, assign billable time, or imply all elapsed time was spent repairing the machine.
- Also parts on order, follow-up needed, pending sample results. Empty string if nothing applies.

OTHER FIELDS
- "complaint": the customer's reported complaint or the assigned work, stated briefly as reported.
- "causing": the failed component and failure mode. If the cause is only suspected, label it "Suspected". "N/A" for a segment with no failure (cleaning, inspection, PM, travel).
- "damage": resultant damage caused by the failure, only as stated. "None found." only if the notes say so. "N/A" for a segment with no failure.

ACCURACY
- Use ONLY facts in the INPUT. Never invent a cause, measurement, test result, part, labor time or procedure to make the report sound more complete.
- The PROCEDURE text is reference only. A step counts as performed only if the technician's notes say it was done.
- If a missing detail changes the diagnosis, the final status or the time accounting, add ONE focused follow-up question per gap to "questions", and where that fact belongs in the text put a short bracketed marker such as [final result?] or [hours?]. Otherwise write from the facts available, without markers.

SEGMENTS: the work order is split into AX segments. You are writing ONE segment: "${sg.title}" (segment ${ordered.indexOf(seg) + 1} of ${ordered.length}; all segments: ${ordered.map(x => x.fields.title).join(' | ')}). Write only the work belonging to this segment. Simple segments (cleaning, TA1 inspection, PM, travel) stay short.
This segment is ${sg.warranty ? 'WARRANTY' : 'NOT warranty'}${sg.hasPart ? ' and replaced/repaired a specific part' : ''}.

Reply with ONLY a JSON object: {"complaint": string, "repair": string, "causing": string, "damage": string, "internal": string, "questions": string[]}

INPUT
Machine: ${mk.name} ${j.model || '(model not given)'}, serial/PIN ${j.serial || '(not given)'}, hours ${j.smu || '(not given)'}
Service tool: ${mk.tool}. Service information: ${mk.info}.
AX segment: ${segId(j.wo, sg) || '(service call not entered)'}${sg.jobCode ? ', job code ' + sg.jobCode : ''}${sg.compCode ? ', component ' + sg.compCode : ''}, "${sg.title || ''}"
Complaint / assigned work already entered: ${sg.complaint || '(none)'}
CODES:
${j.dtcs || '(none recorded)'}
PROCEDURE (reference only):
${j.procedure || '(none)'}
TECHNICIAN NOTES (the only source of what was done and found):
${j.notes || '(none)'}
JOB TIMELINE (chronological log from the technician; also a source of what was done, found and when):
${timelineText(entries, photos) || '(none)'}
NOTES FOR THIS SEGMENT:
${sg.notes || '(none)'}
SHOP SUPPORT, TRAINING & TIME:
${j.support || '(none)'}
Status report pulled BEFORE repair: ${j.psrBefore ? 'yes' : 'no'}. Pulled AFTER repair: ${j.psrAfter ? 'yes' : 'no'}. This segment is a ${isRepairSeg(sg) ? 'REPAIR segment (status report statements required)' : 'non-repair segment'}.
Part number: ${sg.part || '(none)'}${sg.group ? ', group ' + sg.group + (sg.groupName ? ' ' + sg.groupName : '') : ''}`;
}

/** pull the JSON object out of Claude's reply (tolerates a code fence or a sentence around it) */
export function parseReply(text) {
  const t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1);
  const o = JSON.parse(body);
  if (typeof o !== 'object' || !o) throw new Error('not an object');
  return o;
}
