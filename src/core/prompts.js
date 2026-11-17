// Prompt builders and model-output parsing. Pure functions, unit tested.

export const TASKS = [
  {
    id: 'explain',
    label: 'Explain it simply',
    hint: 'Plain-language summary of what this document means for you',
    prompt: 'Explain this document in plain, simple language for the person who received it. What is it about, what does it mean for them, and is anything unusual or worrying? Keep it under 180 words.',
  },
  {
    id: 'actions',
    label: 'Deadlines & next steps',
    hint: 'A checklist of what to do and by when',
    prompt: 'List every deadline, amount, and action the recipient must take, as a short checklist ordered by urgency. If a date is missing, say so.',
  },
  {
    id: 'reply',
    label: 'Draft a reply',
    hint: 'A polite, firm response you can edit and send',
    prompt: 'Draft a polite, firm reply from the recipient that protects their interests. Keep it under 200 words and ready to send.',
  },
  {
    id: 'questions',
    label: 'Questions to ask',
    hint: 'What to ask the bank, doctor or landlord',
    prompt: 'Suggest the 5 most useful questions the recipient should ask the sender, each with one line on why it matters.',
  },
];

export const PLACEHOLDER_RULES =
  'Some details in the text were replaced with placeholders like [PERSON_1], [PHONE_1] or [CARD_1] to protect privacy. ' +
  'Treat each placeholder as the real value. Copy placeholders exactly, including the square brackets, whenever you refer to them. ' +
  'Never guess, invent or ask for the hidden values.';

export function buildCloudPrompt(taskPrompt, maskedText, extra = '') {
  return [
    PLACEHOLDER_RULES,
    '',
    'Task: ' + taskPrompt + (extra ? '\nExtra instruction from the user: ' + extra : ''),
    '',
    'Document:',
    '"""',
    maskedText,
    '"""',
  ].join('\n');
}

export const ENTITY_TYPES = ['PERSON', 'ADDRESS', 'ORG', 'HEALTH'];

export function buildEntityPrompt(text) {
  return [
    'Find private details in the text below that could identify a person.',
    'Return JSON: {"entities":[{"text": exact substring, "type": one of PERSON, ADDRESS, ORG, HEALTH}]}.',
    'PERSON = names of people. ADDRESS = street addresses or localities. ORG = employers, hospitals, banks, schools. HEALTH = diagnoses, conditions, medicines.',
    'Copy each "text" exactly as it appears. Do not include placeholders or generic words.',
    '',
    'Text:',
    text,
  ].join('\n');
}

/** Plain JSON Schema for Chrome's Prompt API responseConstraint (on-device). */
export const ENTITY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, type: { type: 'string', enum: ENTITY_TYPES } },
        required: ['text', 'type'],
      },
    },
  },
  required: ['entities'],
};

/** Firebase Schema for structured output on the cloud path. */
export function entitySchema(Schema) {
  return Schema.object({
    properties: {
      entities: Schema.array({
        items: Schema.object({
          properties: {
            text: Schema.string(),
            type: Schema.enumString({ enum: ENTITY_TYPES }),
          },
        }),
      }),
    },
  });
}

/**
 * Parse model output defensively. Only keep entities that literally occur in the
 * source text, so a model hallucination can never add or change content.
 */
export function parseEntities(raw, sourceText) {
  let data;
  try {
    const cleaned = String(raw).replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    data = JSON.parse(cleaned);
  } catch {
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (!m) return [];
    try { data = JSON.parse(m[0]); } catch { return []; }
  }
  const list = Array.isArray(data) ? data : data?.entities;
  if (!Array.isArray(list)) return [];
  const lower = sourceText.toLowerCase();
  const seen = new Set();
  const out = [];
  for (const e of list) {
    const text = String(e?.text || '').trim();
    const type = ENTITY_TYPES.includes(String(e?.type).toUpperCase()) ? String(e.type).toUpperCase() : null;
    if (!type || text.length < 3 || text.length > 120) continue;
    if (/^\[.*\]$/.test(text)) continue;
    if (!lower.includes(text.toLowerCase())) continue;
    const key = type + '|' + text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, type });
  }
  return out;
}
