import { detectAll, TYPES, resolveOverlaps } from './core/detect.js';
import { mask, unmask, findLeaks, applyVault } from './core/vault.js';
import { TASKS, buildCloudPrompt } from './core/prompts.js';
import { SAMPLES } from './core/samples.js';
import { esc, miniMarkdown, renderReview, markedVault } from './core/render.js';
import { deviceStatus, prepareDevice, findEntitiesOnDevice, answer, cfg, configReady, InferenceSource } from './ai.js';

const $ = (id) => document.getElementById(id);
const state = {
  text: '',
  spans: [],
  entitiesSource: 'skipped',
  entityMs: 0,
  task: TASKS[0].id,
  device: 'unavailable',
  masked: null,
};

// ---------- persistence (local only) ----------
const CUSTOM_KEY = 'veil.alwaysHide';
const loadCustom = () => { try { return localStorage.getItem(CUSTOM_KEY) || ''; } catch { return ''; } };
const saveCustom = (v) => { try { localStorage.setItem(CUSTOM_KEY, v); } catch { /* private mode */ } };
const customTerms = () => $('custom').value.split(',').map((s) => s.trim()).filter(Boolean);

// ---------- navigation ----------
function go(step) {
  for (const n of [1, 2, 3]) $('step' + n).classList.toggle('hidden', n !== step);
  document.querySelectorAll('.steps li').forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle('on', n === step);
    li.classList.toggle('done', n < step);
  });
  $('hero').classList.toggle('compact', step > 1);
  $('step' + step).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- on-device status ----------
const DEVICE_TEXT = {
  available: 'On-device AI ready (Gemini Nano)',
  downloadable: 'On-device AI available: tap to download',
  downloading: 'Downloading on-device model…',
  unavailable: 'On-device AI not on this browser: rule-based masking',
};
async function refreshDevice() {
  state.device = await deviceStatus();
  const pill = $('device-pill');
  pill.dataset.state = state.device;
  $('device-label').textContent = DEVICE_TEXT[state.device] || DEVICE_TEXT.unavailable;
  const dev = $('route-device');
  dev.classList.toggle('hidden', state.device !== 'available');
  if (state.device !== 'available' && document.querySelector('input[name=route]:checked')?.value === 'device') {
    document.querySelector('input[name=route][value=auto]').checked = true;
  }
}
$('device-pill').addEventListener('click', async () => {
  if (state.device !== 'downloadable' && state.device !== 'downloading') return;
  $('device-label').textContent = 'Downloading on-device model… 0%';
  try {
    await prepareDevice((p) => { $('device-label').textContent = `Downloading on-device model… ${Math.round(p * 100)}%`; });
  } catch (e) {
    console.warn(e);
  }
  refreshDevice();
});

// ---------- step 1 ----------
function renderSamples() {
  $('sample-buttons').innerHTML = SAMPLES.map(
    (s) => `<button type="button" class="chip" data-id="${s.id}" title="${esc(s.blurb)}">${esc(s.title)}</button>`,
  ).join('');
  $('sample-buttons').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    const s = SAMPLES.find((x) => x.id === b.dataset.id);
    $('input').value = s.text;
    state.task = s.task;
    scan();
  });
}

async function scan() {
  const text = $('input').value.trim();
  if (!text) { $('input').focus(); $('input').classList.add('shake'); setTimeout(() => $('input').classList.remove('shake'), 400); return; }
  saveCustom($('custom').value);
  state.text = text;
  const btn = $('scan');
  btn.disabled = true;
  btn.textContent = 'Scanning on this device…';
  let entities = [];
  state.entitiesSource = 'skipped';
  if (state.device === 'available') {
    const t0 = performance.now();
    try {
      entities = await findEntitiesOnDevice(text);
      state.entitiesSource = 'on_device';
    } catch (e) {
      console.warn('On-device entity pass failed', e);
      state.entitiesSource = 'failed';
    }
    state.entityMs = Math.round(performance.now() - t0);
  }
  state.spans = detectAll(text, { entities, customTerms: customTerms() }).map((s) => ({ ...s, enabled: true }));
  btn.disabled = false;
  btn.textContent = 'Find private details';
  const n = state.spans.length;
  $('scan-note').textContent =
    `${n} item${n === 1 ? '' : 's'} found · ` +
    (state.entitiesSource === 'on_device'
      ? `rules + Gemini Nano on-device (${state.entityMs} ms)`
      : 'rule-based, on this device. Check names & addresses below');
  renderTasks();
  renderReviewPane();
  go(2);
}

// ---------- step 2 ----------
const labelOf = (s) => TYPES[s.type] || s.type;

function renderReviewPane() {
  $('review').innerHTML = renderReview(state.text, state.spans, labelOf);
  state.masked = mask(state.text, state.spans);
  const leaks = findLeaks(state.masked.masked, state.masked.vault);
  $('outgoing').innerHTML = esc(state.masked.masked).replace(/\[[A-Z]+_\d+\]/g, (m) => `<span class="ph">${m}</span>`);
  const counts = {};
  for (const s of state.spans) if (s.enabled !== false) counts[labelOf(s)] = (counts[labelOf(s)] || 0) + 1;
  $('legend').innerHTML =
    Object.entries(counts).map(([k, v]) => `<span class="tag">${esc(k)} <b>${v}</b></span>`).join('') +
    (leaks.length ? `<span class="tag warn">Leak check failed for ${leaks.length} value(s)</span>` : '<span class="tag ok">Leak check passed</span>');
  $('ask').disabled = leaks.length > 0;
}

$('review').addEventListener('click', (e) => {
  const m = e.target.closest('mark[data-i]');
  if (!m) return;
  const s = state.spans[Number(m.dataset.i)];
  s.enabled = s.enabled === false;
  renderReviewPane();
});
$('review').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('mark[data-i]')) { e.preventDefault(); e.target.click(); }
});

function offsetOf(node, off) {
  const el = node.nodeType === 3 ? node.parentElement : node;
  const host = el.closest('[data-o]');
  if (!host || !$('review').contains(host)) return null;
  return Number(host.dataset.o) + (node.nodeType === 3 ? off : 0);
}
$('hide-sel').addEventListener('mousedown', (e) => e.preventDefault());
$('hide-sel').addEventListener('click', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { $('hide-sel').textContent = 'Select text first'; setTimeout(() => ($('hide-sel').textContent = 'Hide selection'), 1500); return; }
  let a = offsetOf(sel.anchorNode, sel.anchorOffset);
  let b = offsetOf(sel.focusNode, sel.focusOffset);
  if (a == null || b == null) return;
  if (a > b) [a, b] = [b, a];
  while (a < b && /\s/.test(state.text[a])) a++;
  while (b > a && /\s/.test(state.text[b - 1])) b--;
  if (b - a < 2) return;
  const value = state.text.slice(a, b);
  const added = detectAll(state.text, { customTerms: [value] }).filter((s) => s.text.toLowerCase() === value.toLowerCase());
  state.spans = resolveOverlaps([...state.spans, ...added.map((s) => ({ ...s, type: 'CUSTOM', enabled: true }))]);
  sel.removeAllRanges();
  renderReviewPane();
});

function renderTasks() {
  $('tasks').innerHTML = TASKS.map(
    (t) => `<button type="button" class="task ${t.id === state.task ? 'sel' : ''}" data-id="${t.id}"><b>${esc(t.label)}</b><small>${esc(t.hint)}</small></button>`,
  ).join('');
}
$('tasks').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  state.task = b.dataset.id;
  renderTasks();
});

// ---------- step 3 ----------
async function ask() {
  const { masked, vault } = state.masked;
  if (findLeaks(masked, vault).length) return;
  const task = TASKS.find((t) => t.id === state.task);
  const extra = $('extra').value.trim();
  // The user's own question can mention hidden values too: reuse the same placeholders.
  const extraMasked = extra ? applyVault(extra, vault) : '';
  const prompt = buildCloudPrompt(task.prompt, masked, extraMasked);
  const route = document.querySelector('input[name=route]:checked').value;
  const leaks = findLeaks(prompt, vault);
  if (leaks.length) { alert('Blocked: a hidden value appears in your question. Remove it and try again.'); return; }

  go(3);
  $('answer').innerHTML = '<p class="muted">Thinking…</p>';
  $('raw').textContent = '';
  $('answer-source').textContent = '';
  $('answer-source').className = 'badge';
  $('receipt').innerHTML = '';
  const mv = markedVault(vault);
  const t0 = performance.now();
  try {
    const { text, source } = await answer(prompt, route, (partial) => {
      $('raw').textContent = partial;
      $('answer').innerHTML = miniMarkdown(unmask(partial, mv).text);
    });
    const ms = Math.round(performance.now() - t0);
    const restored = unmask(text, mv);
    $('raw').textContent = text;
    $('answer').innerHTML = miniMarkdown(restored.text);
    const onDevice = source === InferenceSource.ON_DEVICE;
    $('answer-source').textContent = onDevice ? 'Answered on-device · Gemini Nano' : `Answered in the cloud · ${cfg().cloudModel}`;
    $('answer-source').classList.add(onDevice ? 'device' : 'cloud');
    renderReceipt({ ms, onDevice, restored: restored.restored, unknown: restored.unknown, promptChars: prompt.length, vault });
  } catch (e) {
    console.error(e);
    $('answer').innerHTML = `<p class="error">Couldn't get an answer: ${esc(friendlyError(e))}</p>`;
  }
}

function friendlyError(e) {
  const m = String(e?.message || e);
  if (/app.?check/i.test(m)) return 'App Check could not verify this browser. Reload the page and try again.';
  if (/quota|429|exhausted/i.test(m)) return 'The cloud model is busy (quota reached). Try again in a minute.';
  if (/free tier|billing|PERMISSION_DENIED|403/i.test(m)) return 'The cloud model is not available for this project right now. If on-device AI is ready, choose "On-device only".';
  if (/Local LanguageModel|API_NOT_ENABLED/i.test(m)) return 'On-device AI is not available in this browser. Choose Auto or Cloud.';
  return 'Something went wrong talking to the model. Please try again.';
}

function renderReceipt({ ms, onDevice, restored, unknown, promptChars, vault }) {
  const rows = [
    ['Private details found', `${state.spans.length} (${state.spans.filter((s) => s.enabled !== false).length} hidden)`],
    ['Detection ran', state.entitiesSource === 'on_device' ? `On-device: rules + Gemini Nano (${state.entityMs} ms)` : 'On-device: rule-based detectors'],
    ['Leak check before sending', 'Passed: no hidden value in the request'],
    ['Sent to model', onDevice ? 'Nothing left this device' : `${promptChars.toLocaleString()} characters of masked text`],
    ['Answer generated', onDevice ? `On-device, Gemini Nano (${ms} ms)` : `Cloud, ${cfg().cloudModel} via Firebase AI Logic (${ms} ms)`],
    ['Restored locally', `${restored} placeholder${restored === 1 ? '' : 's'} → real values` + (unknown.length ? ` · ${unknown.length} unknown left as-is` : '')],
    ['Kept on this device', `${vault.size} unique value${vault.size === 1 ? '' : 's'} (never uploaded, never stored)`],
  ];
  $('receipt').innerHTML = `<h3>Privacy receipt</h3><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('answer').innerText); $('copy').textContent = 'Copied'; } catch { $('copy').textContent = 'Copy failed'; }
  setTimeout(() => ($('copy').textContent = 'Copy answer'), 1500);
});

// ---------- wire up ----------
$('scan').addEventListener('click', scan);
$('ask').addEventListener('click', ask);
$('back1').addEventListener('click', () => go(1));
$('back2').addEventListener('click', () => go(2));
$('restart').addEventListener('click', () => { $('input').value = ''; $('extra').value = ''; go(1); $('input').focus(); });

$('custom').value = loadCustom();
renderSamples();
renderTasks();
refreshDevice();
configReady.then(() => refreshDevice());
