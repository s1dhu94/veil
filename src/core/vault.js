// The vault maps real values to placeholders. It never leaves the device.

const LABEL = {
  PERSON: 'PERSON', EMAIL: 'EMAIL', PHONE: 'PHONE', AADHAAR: 'AADHAAR', PAN: 'PAN',
  CARD: 'CARD', ACCOUNT: 'ACCOUNT', IFSC: 'IFSC', UPI: 'UPI', DATE: 'DOB',
  ADDRESS: 'ADDRESS', PINCODE: 'PIN', ID: 'ID', ORG: 'ORG', HEALTH: 'HEALTH', CUSTOM: 'PRIVATE',
};

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Replace each enabled span with a stable placeholder like [PERSON_1].
 * The same value always gets the same placeholder, so the cloud model can still reason
 * about "who did what" without knowing who anyone is.
 * @returns {{masked:string, vault:Map<string,string>, entries:Array<{placeholder:string,value:string,type:string}>}}
 */
export function mask(text, spans) {
  const sorted = [...spans].filter((s) => s.enabled !== false).sort((a, b) => a.start - b.start);
  const byValue = new Map(); // norm(value) -> placeholder
  const vault = new Map(); // placeholder -> value
  const counters = {};
  let out = '';
  let pos = 0;
  for (const s of sorted) {
    if (s.start < pos) continue;
    const key = s.type + '|' + norm(s.text);
    let ph = byValue.get(key);
    if (!ph) {
      // A first-name-only mention of an already-masked full name shares its placeholder.
      if (s.type === 'PERSON') {
        for (const [k, p] of byValue) {
          if (k.startsWith('PERSON|') && k.slice(7).split(' ').includes(norm(s.text))) { ph = p; break; }
        }
      }
      if (!ph) {
        const label = LABEL[s.type] || 'PRIVATE';
        counters[label] = (counters[label] || 0) + 1;
        ph = `[${label}_${counters[label]}]`;
        vault.set(ph, s.text);
      }
      byValue.set(key, ph);
    }
    out += text.slice(pos, s.start) + ph;
    pos = s.end;
  }
  out += text.slice(pos);
  const entries = [...vault].map(([placeholder, value]) => ({
    placeholder, value, type: placeholder.slice(1, placeholder.lastIndexOf('_')),
  }));
  return { masked: out, vault, entries };
}

/**
 * Put the real values back into a model answer. Tolerates the ways models mangle
 * placeholders: missing brackets, different case, spaces, markdown escaping.
 * @returns {{text:string, restored:number, unknown:string[]}}
 */
export function unmask(answer, vault) {
  let restored = 0;
  const unknown = [];
  const swap = (m, label, n) => {
    const ph = `[${label.toUpperCase()}_${n}]`;
    if (vault.has(ph)) {
      restored++;
      return vault.get(ph);
    }
    unknown.push(m.trim());
    return m;
  };
  // 1) bracketed forms: [PERSON_1], [person 1], \[PERSON_1\], [ PERSON-1 ]
  let text = answer.replace(/\\?\[\s*([A-Za-z]+)[ _-]?(\d{1,3})\s*\\?\]/g, swap);
  // 2) bare upper-case forms the model sometimes emits: PERSON_1
  text = text.replace(/\b([A-Z]{2,})_(\d{1,3})\b/g, (m, label, n) =>
    vault.has(`[${label}_${n}]`) ? swap(m, label, n) : m,
  );
  return { text, restored, unknown };
}

/**
 * Final guard before anything is sent to the cloud: confirm no vault value
 * (or a digits-only variant of a number) appears in the outgoing text.
 * @returns {string[]} list of leaked values (empty means safe)
 */
export function findLeaks(outgoing, vault) {
  const lower = outgoing.toLowerCase();
  const digitsOut = outgoing.replace(/\D/g, '');
  const leaks = [];
  for (const value of vault.values()) {
    const v = value.toLowerCase();
    if (lower.includes(v)) { leaks.push(value); continue; }
    const d = value.replace(/\D/g, '');
    if (d.length >= 8 && digitsOut.includes(d)) leaks.push(value);
  }
  return leaks;
}

/** Replace any already-vaulted value inside new text (e.g. the user's own question) with its placeholder. */
export function applyVault(text, vault) {
  const pairs = [...vault].sort((a, b) => b[1].length - a[1].length);
  let out = text;
  for (const [ph, value] of pairs) {
    const re = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'gi');
    out = out.replace(re, ph);
  }
  return out;
}
