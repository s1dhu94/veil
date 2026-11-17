import { describe, it, expect } from 'vitest';
import { verhoeffValid, luhnValid, verhoeffCheckDigit } from '../src/core/checksums.js';
import { detectRules, detectAll, findTerms, resolveOverlaps } from '../src/core/detect.js';
import { mask, unmask, findLeaks } from '../src/core/vault.js';
import { parseEntities, buildCloudPrompt } from '../src/core/prompts.js';
import { SAMPLES } from '../src/core/samples.js';

const types = (spans) => spans.map((s) => s.type + ':' + s.text);

describe('checksums', () => {
  it('validates Verhoeff (Aadhaar) and rejects typos', () => {
    expect(verhoeffValid('2345 6789 0124')).toBe(true);
    expect(verhoeffValid('2345 6789 0125')).toBe(false);
    expect(verhoeffCheckDigit('23456789012')).toBe(4);
  });
  it('validates Luhn (cards)', () => {
    expect(luhnValid('4111 1111 1111 1111')).toBe(true);
    expect(luhnValid('4111 1111 1111 1112')).toBe(false);
  });
});

describe('rule detection', () => {
  it('finds Indian identifiers and contact details', () => {
    const t = 'PAN ABCPM1234K, Aadhaar 2345 6789 0124, call 98765 43210 or +91 91234 56780, mail a.b@x.in, IFSC HDFC0001234';
    const got = types(detectRules(t));
    expect(got).toContain('PAN:ABCPM1234K');
    expect(got).toContain('AADHAAR:2345 6789 0124');
    expect(got).toContain('PHONE:98765 43210');
    expect(got.some((g) => g.startsWith('PHONE:') && g.includes('91234 56780'))).toBe(true);
    expect(got).toContain('EMAIL:a.b@x.in');
    expect(got).toContain('IFSC:HDFC0001234');
  });
  it('does not flag a 12-digit number that fails the Aadhaar checksum', () => {
    expect(types(detectRules('Invoice 2345 6789 0125'))).not.toContain('AADHAAR:2345 6789 0125');
  });
  it('needs an account keyword before a bare long number', () => {
    expect(types(detectRules('savings account no. 50100123456789'))).toContain('ACCOUNT:50100123456789');
    expect(types(detectRules('order 50100123456789'))).not.toContain('ACCOUNT:50100123456789');
  });
  it('finds names after honorifics, labels and sign-offs', () => {
    const got = types(detectRules('Dear Arjun Mehta,\nMet Dr. Sameer Iyer today.\nRegards,\nNeha Kulkarni'));
    expect(got).toEqual(expect.arrayContaining(['PERSON:Arjun Mehta', 'PERSON:Sameer Iyer', 'PERSON:Neha Kulkarni']));
  });
  it('only treats dates as DOB when labelled', () => {
    expect(types(detectRules('DOB: 03/08/1992'))).toContain('DATE:03/08/1992');
    expect(types(detectRules('Paid on 12/11/2026'))).not.toContain('DATE:12/11/2026');
  });
  it('finds labelled IDs', () => {
    expect(types(detectRules('Patient ID: CCD-2026-77104'))).toContain('ID:CCD-2026-77104');
  });
});

describe('terms and overlaps', () => {
  it('matches whole words only, case-insensitively', () => {
    expect(findTerms('Rao met Raoul. rao!', ['Rao']).map((s) => s.start)).toEqual([0, 15]);
  });
  it('keeps the longest overlapping span', () => {
    const r = resolveOverlaps([
      { start: 0, end: 5, text: 'Kavya', type: 'PERSON' },
      { start: 0, end: 9, text: 'Kavya Rao', type: 'PERSON' },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].text).toBe('Kavya Rao');
  });
  it('propagates a found name to its other mentions, including first name alone', () => {
    const spans = detectAll('Dear Arjun Mehta, ... Arjun, please reply. Mehta family.');
    expect(spans.filter((s) => s.type === 'PERSON').map((s) => s.text)).toEqual(['Arjun Mehta', 'Arjun', 'Mehta']);
  });
  it('merges on-device entities and custom terms', () => {
    const spans = detectAll('Visited Apollo Clinic for asthma. Codeword: bluefin.', {
      entities: [{ text: 'Apollo Clinic', type: 'ORG' }, { text: 'asthma', type: 'HEALTH' }],
      customTerms: ['bluefin'],
    });
    expect(types(spans)).toEqual(['ORG:Apollo Clinic', 'HEALTH:asthma', 'CUSTOM:bluefin']);
  });
});

describe('vault', () => {
  const text = 'Dear Arjun Mehta, card 4111 1111 1111 1111. Arjun, call 98765 43210.';
  const spans = detectAll(text);
  const { masked, vault } = mask(text, spans);

  it('replaces every detected value with stable placeholders', () => {
    expect(masked).toBe('Dear [PERSON_1], card [CARD_1]. [PERSON_1], call [PHONE_1].');
    expect(findLeaks(masked, vault)).toEqual([]);
  });
  it('respects spans the user un-masked', () => {
    const r = mask(text, spans.map((s) => (s.type === 'PHONE' ? { ...s, enabled: false } : s)));
    expect(r.masked).toContain('98765 43210');
  });
  it('restores values in model answers, tolerating mangled placeholders', () => {
    const a = 'Hi [PERSON_1]. Your \\[CARD_1\\] is blocked; we will call [phone 1]. PERSON_1 must reply. [PERSON_9]?';
    const r = unmask(a, vault);
    expect(r.text).toBe('Hi Arjun Mehta. Your 4111 1111 1111 1111 is blocked; we will call 98765 43210. Arjun Mehta must reply. [PERSON_9]?');
    expect(r.restored).toBe(4);
    expect(r.unknown).toEqual(['[PERSON_9]']);
  });
  it('catches leaks, including reformatted numbers', () => {
    expect(findLeaks('card 4111-1111-1111-1111', vault)).toEqual(['4111 1111 1111 1111']);
    expect(findLeaks('arjun mehta said hi', vault)).toEqual(['Arjun Mehta']);
  });
});

describe('model output parsing', () => {
  const src = 'Kavya Rao was seen at CityCare for thyroid issues.';
  it('keeps only entities that literally occur in the source', () => {
    const raw = '```json\n{"entities":[{"text":"Kavya Rao","type":"PERSON"},{"text":"Priya","type":"PERSON"},{"text":"thyroid issues","type":"health"},{"text":"x","type":"ORG"}]}\n```';
    expect(parseEntities(raw, src)).toEqual([
      { text: 'Kavya Rao', type: 'PERSON' },
      { text: 'thyroid issues', type: 'HEALTH' },
    ]);
  });
  it('survives garbage', () => {
    expect(parseEntities('sorry, I cannot', src)).toEqual([]);
    expect(parseEntities('{"entities": "nope"}', src)).toEqual([]);
  });
  it('puts placeholder rules in the cloud prompt', () => {
    expect(buildCloudPrompt('Summarise', '[PERSON_1] owes')).toMatch(/Copy placeholders exactly/);
  });
});

describe('fictional samples end to end (rules only, no model)', () => {
  for (const s of SAMPLES) {
    it(`${s.id}: masks all key identifiers and leaks nothing`, () => {
      const spans = detectAll(s.text);
      const { masked, vault } = mask(s.text, spans);
      expect(findLeaks(masked, vault)).toEqual([]);
      const must = {
        bank: ['Arjun Mehta', '4111 1111 1111 1111', 'ABCPM1234K', '2345 6789 0124', '98765 43210', '50100123456789', 'HDFC0001234', 'disputes@examplebank.in', 'Neha Kulkarni', 'DSP-448812'],
        lab: ['Kavya Rao', '03/08/1992', 'CCD-2026-77104', 'Sameer Iyer', '91234 56780'],
        rent: ['Rohan Das', 'Lotus Residency', 'Indiranagar', 'Lakshmi Narayan', '99001 22334', 'lakshmi.n@example.com', '560038'],
      }[s.id];
      for (const v of must) expect(masked, v).not.toContain(v);
    });
  }
});

import { applyVault } from '../src/core/vault.js';
import { miniMarkdown, renderReview, markedVault, esc } from '../src/core/render.js';

describe('applyVault and rendering', () => {
  const vault = new Map([['[PERSON_1]', 'Arjun Mehta'], ['[CARD_1]', '4111 1111 1111 1111']]);
  it('masks hidden values inside the user question', () => {
    expect(applyVault('Can arjun mehta dispute 4111111111111111?', vault)).toBe('Can [PERSON_1] dispute [CARD_1]?');
  });
  it('escapes HTML and highlights restored values', () => {
    const html = miniMarkdown(unmask('- **Call** [PERSON_1] <script>', markedVault(vault)).text);
    expect(html).toBe('<ul><li><strong>Call</strong> <mark class="restored">Arjun Mehta</mark> &lt;script&gt;</li></ul>');
  });
  it('renders review highlights with offsets', () => {
    const html = renderReview('Hi Arjun!', [{ start: 3, end: 8, type: 'PERSON', enabled: true }], () => 'Person');
    expect(html).toContain('<span data-o="0">Hi </span><mark class="hl t-PERSON" data-i="0" data-o="3"');
    expect(html).toContain('<span data-o="8">!</span>');
    expect(esc('"<&>')).toBe('&quot;&lt;&amp;&gt;');
  });
});

describe('markdown lists', () => {
  it('keeps numbering across blank lines and nests indented bullets', () => {
    const html = miniMarkdown('1. **A**\n   * x\n   * y\n\n2. B\n3. C\n\nDone');
    expect(html).toBe('<ol><li><strong>A</strong><ul><li>x</li><li>y</li></ul></li><li>B</li><li>C</li></ol><p>Done</p>');
  });
  it('still renders plain bullets', () => {
    expect(miniMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
  });
});
