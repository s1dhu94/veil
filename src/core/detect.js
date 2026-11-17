// Deterministic, fully local detection of personal / sensitive details.
// Runs before anything could leave the device, with or without an on-device model.
import { verhoeffValid, luhnValid } from './checksums.js';

/** @typedef {{start:number,end:number,text:string,type:string,source:string}} Span */

export const TYPES = {
  PERSON: 'Person',
  EMAIL: 'Email',
  PHONE: 'Phone',
  AADHAAR: 'Aadhaar',
  PAN: 'PAN',
  CARD: 'Card number',
  ACCOUNT: 'Bank account',
  IFSC: 'IFSC',
  UPI: 'UPI ID',
  DATE: 'Date of birth',
  ADDRESS: 'Address',
  PINCODE: 'PIN code',
  ID: 'ID number',
  ORG: 'Organisation',
  HEALTH: 'Health detail',
  CUSTOM: 'Always hide',
};

const rules = [
  { type: 'EMAIL', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: 'UPI', re: /\b[a-zA-Z0-9._-]{2,}@(?:ok)?(?:sbi|hdfc|icici|axis|ybl|paytm|upi|ibl|apl|axl|okaxis|oksbi|okhdfcbank|okicici)\b/g },
  {
    type: 'CARD',
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    ok: (m) => luhnValid(m),
    notNear: /(a\/c|acct|account)\s*(no\.?|number|#)?\s*[:.-]?\s*$/i,
  },
  {
    type: 'AADHAAR',
    re: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g,
    ok: (m) => verhoeffValid(m),
  },
  { type: 'PAN', re: /\b[A-Z]{3}[PCHABGJLFT][A-Z]\d{4}[A-Z]\b/g },
  { type: 'IFSC', re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  {
    type: 'PHONE',
    re: /(?:\+91[\s-]?|\b0)?\b[6-9]\d{4}[\s-]?\d{5}\b|\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g,
  },
  {
    // Bank account numbers: 9-18 digits, only when an account keyword is nearby.
    type: 'ACCOUNT',
    re: /\b\d{9,18}\b/g,
    near: /(a\/c|acct|account|savings|current)\s*(no\.?|number|#)?/i,
  },
  {
    type: 'DATE',
    re: /\b(?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|1[0-2])[\/.-](?:19|20)\d{2}\b/g,
    near: /(d\.?o\.?b|date of birth|born)/i,
  },
  {
    // PIN codes: labelled, or at the end of an address-like line (has commas, ends "City 560038").
    type: 'PINCODE',
    re: /\b[1-9]\d{2}\s?\d{3}\b/g,
    ctx: (text, start) => {
      const before = text.slice(Math.max(0, start - 40), start);
      if (/pin\s*(code)?\s*[:-]?\s*$/i.test(before)) return true;
      const lineStart = text.lastIndexOf('\n', start) + 1;
      const line = text.slice(lineStart, start);
      return (line.match(/,/g) || []).length >= 2 && /[A-Z][a-z]+,?\s$/.test(line);
    },
  },
  {
    // Street addresses that start with a unit marker: "Flat 4B, Lotus Residency, 12th Cross, Indiranagar, Bengaluru"
    type: 'ADDRESS',
    re: /\b(?:Flat|House|H\.? ?No\.?|Plot|Door No\.?|Apartment|Apt\.?)\s*[\w\/-]+,[^\n]{5,120}?(?=,?\s[1-9]\d{5}\b|\n|$)/g,
  },
  {
    // Generic labelled IDs: "Patient ID: AB-12345", "Policy No. 99887766", "Ref: XYZ/123"
    type: 'ID',
    ok: (m) => /\d/.test(m),
    re: /\b(?:patient|policy|customer|member|employee|uhid|mrn|case|ticket|ref(?:erence)?|complaint|loan|claim)\s*(?:id|no\.?|number|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/-]{3,})/gi,
    group: 1,
  },
  {
    // Honorific + capitalised name: "Mr. Arjun Mehta", "Smt. Kavya Rao", "Dr Rao"
    type: 'PERSON',
    re: /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Shri|Smt|Sri|Kumari)\.?\s+((?:[A-Z][a-z]+)(?: [A-Z][a-z]+){0,2})/g,
    group: 1,
  },
  {
    // Labelled names: "Name: Arjun Mehta", "Patient: Kavya Rao", "Dear Arjun,"
    type: 'PERSON',
    re: /\b(?:Name|Patient|Tenant|Landlord|Account holder|Customer|Applicant|Dear)\s*[:,]?\s+((?:[A-Z][a-z]+)(?: [A-Z][a-z]+){0,2})\b/g,
    group: 1,
  },
  {
    // Sign-offs: "Regards,\nArjun Mehta"
    type: 'PERSON',
    re: /(?:Regards|Sincerely|Thanks|Thank you|Warmly|Best),?\s*\n\s*((?:[A-Z][a-z]+)(?: [A-Z][a-z]+){0,2})/g,
    group: 1,
  },
];

const NOT_NAMES = new Set(['Sir', 'Madam', 'Team', 'Customer', 'Support', 'Manager', 'All', 'The', 'Doctor']);

/** Run every rule over the text and return non-overlapping spans. */
export function detectRules(text) {
  /** @type {Span[]} */
  const found = [];
  for (const r of rules) {
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(text))) {
      let value = m[0];
      let start = m.index;
      if (r.group) {
        value = m[r.group];
        if (!value) continue;
        start = m.index + m[0].lastIndexOf(value);
      }
      value = value.replace(/[\s.,;:]+$/, '');
      if (!value) continue;
      if (r.ok && !r.ok(value)) continue;
      if (r.ctx && !r.ctx(text, start)) continue;
      if (r.notNear && r.notNear.test(text.slice(Math.max(0, start - 40), start))) continue;
      if (r.near) {
        const before = text.slice(Math.max(0, start - 40), start);
        if (!r.near.test(before)) continue;
      }
      if (r.type === 'PERSON' && value.split(/\s+/).every((w) => NOT_NAMES.has(w))) continue;
      found.push({ start, end: start + value.length, text: value, type: r.type, source: 'rules' });
    }
  }
  return resolveOverlaps(found);
}

/** Find every occurrence of known terms (custom list or model-found entities). */
export function findTerms(text, terms, type = 'CUSTOM', source = 'custom') {
  const spans = [];
  const lower = text.toLowerCase();
  for (const raw of terms) {
    const term = String(raw || '').trim();
    if (term.length < 2) continue;
    const t = term.toLowerCase();
    let i = lower.indexOf(t);
    while (i !== -1) {
      const before = i === 0 ? ' ' : lower[i - 1];
      const after = lower[i + t.length] ?? ' ';
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
        spans.push({ start: i, end: i + t.length, text: text.slice(i, i + t.length), type, source });
      }
      i = lower.indexOf(t, i + 1);
    }
  }
  return spans;
}

/** Keep the longest span when spans overlap; ties go to the earlier, then rules over model. */
export function resolveOverlaps(spans) {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) {
      if (s.end - s.start > last.end - last.start) out[out.length - 1] = s;
      continue;
    }
    out.push(s);
  }
  return out;
}

/**
 * Also mask every other occurrence of a detected value (e.g. a name found once
 * after "Dear" is masked everywhere it appears, including first-name-only mentions).
 */
export function propagate(text, spans) {
  const extra = [];
  for (const s of spans) {
    extra.push(...findTerms(text, [s.text], s.type, s.source));
    if (s.type === 'PERSON') {
      const parts = s.text.split(/\s+/).filter((p) => p.length > 2 && !NOT_NAMES.has(p));
      if (parts.length > 1) extra.push(...findTerms(text, parts, 'PERSON', s.source));
    }
  }
  return resolveOverlaps([...spans, ...extra]);
}

/** Full local pipeline: rules + extra entities (from the on-device model) + custom terms. */
export function detectAll(text, { entities = [], customTerms = [] } = {}) {
  const base = [
    ...detectRules(text),
    ...entities.flatMap((e) => findTerms(text, [e.text], e.type in TYPES ? e.type : 'PERSON', 'on-device AI')),
    ...findTerms(text, customTerms, 'CUSTOM', 'custom'),
  ];
  return propagate(text, resolveOverlaps(base));
}
