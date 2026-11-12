// HARVEY: una sola app para el PC (server.mjs, Edge en modo app) y el iPhone (movil/server.mjs, PWA en el VPS).
// El servidor dice dónde estamos (/api/ping → { pc }): en el PC se le habla con «Oye Harvey» y la tecla º (Web Speech de
// Edge), hay arranque, conversación continua y avisos con voz; en el iPhone, micro con el Whisper del VPS, contraseña,
// avisos push y Siri. Pantallas: Harvey · Oficina · Tablero · Biblioteca · Sistema (y Día en el teléfono).
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/`([^`\n]+)`/g, '<code>$1</code>')
  .replace(/https?:\/\/[^\s<)]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)
  .replace(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m.replace(/\n/g, '')}</ul>`)
  .replace(/\n/g, '<br>');
const words = (t) => t.split(/(\s+)/).map((w, i) => (w.trim() ? `<span class="w" style="animation-delay:${Math.min(i, 120) * 18}ms">${esc(w)}</span>` : w)).join('');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const load = (k, def) => { try { const v = localStorage.getItem('harvey.' + k); return v == null ? def : JSON.parse(v); } catch { return def; } };
const save = (k, v) => { try { localStorage.setItem('harvey.' + k, JSON.stringify(v)); } catch {} };
const post = (path, body) => fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const api = async (path, body) => {
  const r = body === undefined ? await fetch('/api/' + path) : await post(path, body);
  if (r.status === 401 && path !== 'login') showLogin();
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || j.error || 'Error ' + r.status);
  return j;
};
let PC = false, PREFIX = 'movil-'; // lo fija /api/ping al arrancar

// ---------- Reloj ----------
function tick() {
  const d = new Date();
  $('#hora').textContent = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  $('#fecha').textContent = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
}
setInterval(tick, 5000); tick();

// ---------- Pantallas ----------
const ORDER = ['harvey', 'dia', 'oficina', 'tablero', 'biblioteca', 'sistema'];
const phone = matchMedia('(max-width:760px)');
function show(screen) {
  if (screen === 'mas') return openSheet();
  if (screen === 'dia' && !phone.matches) screen = 'harvey';
  $('#sheet').hidden = true;
  const prev = document.body.dataset.screen;
  if (prev === screen) return;
  document.body.dataset.screen = screen;
  const id = screen === 'dia' ? 'harvey' : screen;
  $$('.screen').forEach((s) => { s.hidden = s.id !== 's-' + id; });
  $('#s-' + id).style.setProperty('--from', (ORDER.indexOf(screen) > ORDER.indexOf(prev) ? 16 : -16) + 'px');
  // en el teléfono, Biblioteca y Sistema viven en «Más»
  const cur = phone.matches && ['biblioteca', 'sistema'].includes(screen) ? 'mas' : screen;
  $$('nav button[data-screen]').forEach((b) => (b.dataset.screen === cur ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  if (screen !== 'harvey' && Date.now() - snapAt > 45_000) refresh();
  if (screen === 'tablero' || screen === 'oficina') { renderTablero(); refreshTablero(); }
  if (screen === 'biblioteca') refreshBiblioteca();
  if (screen === 'sistema') refreshSistema();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-screen], [data-go]');
  if (b) show(b.dataset.screen || b.dataset.go);
});
phone.addEventListener('change', () => { if (!phone.matches && document.body.dataset.screen === 'dia') show('harvey'); });

// ---------- Estado del núcleo ----------
const LABELS = {
  idle: ['EN ESPERA', () => (PC ? 'Diga «Oye Harvey» o pulse <kbd>º</kbd> para conversar' : 'Toque el núcleo o el micro para hablar')],
  listening: ['ESCUCHANDO', () => (PC ? 'Le escucho, señor…' : 'Le escucho, señor… toque para terminar')],
  thinking: ['PENSANDO', () => (PC ? 'Trabajando en ello…  ·  <kbd>Esc</kbd> para cancelar' : 'Trabajando en ello…')],
  speaking: ['HABLANDO', () => (PC ? 'Pulse <kbd>Esc</kbd> para interrumpir' : 'Toque el núcleo para interrumpir')],
};
let state = 'idle', convo = false; // convo: modo conversación del PC (tecla º): tras cada respuesta vuelve a escuchar
function setState(s, h) {
  state = s;
  $('#st').textContent = LABELS[s][0];
  const base = convo && s === 'idle' ? 'En conversación' : LABELS[s][1]();
  $('#sth').innerHTML = h != null ? esc(h) : base + (convo ? '  ·  <kbd>º</kbd> para terminar' : '');
  Core.setState(s);
}
const hint = (h) => { if (h) $('#sth').textContent = h; };
const link = (k, cls) => { const el = $(`.links [data-k="${k}"]`); if (el) el.className = cls; };

// ---------- Avisos en pantalla ----------
function toast({ title, text, sub, warn, actions = [], ttl = 15000 }) {
  const el = document.createElement('div');
  el.className = 'toast' + (warn ? ' warn' : '');
  el.setAttribute('role', 'status');
  el.innerHTML = `<button type="button" class="x" aria-label="Cerrar">×</button>${title ? `<b>${esc(title)}</b>` : ''}<p>${esc(text)}</p>${sub ? `<small>${esc(sub)}</small>` : ''}
    ${actions.length ? '<div class="acts"></div>' : ''}${ttl ? `<i style="animation-duration:${ttl}ms"></i>` : ''}`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 350); };
  el.querySelector('.x').onclick = close;
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = a.label; b.onclick = () => { close(); a.run(); };
    el.querySelector('.acts').append(b);
  }
  $('#toasts').prepend(el);
  while ($('#toasts').children.length > 4) $('#toasts').lastElementChild.remove();
  if (ttl) setTimeout(close, ttl);
}
const aviso = (text, warn = false) => toast({ text, warn, ttl: 4000 });
const quietHours = () => { const h = new Date().getHours(); return h >= 22 || h < 8; };
const dayPart = () => { const h = new Date().getHours(); return h < 6 ? 'madrugada' : h < 13 ? 'manana' : h < 21 ? 'tarde' : 'noche'; };

// ---------- Voz de Harvey (Google, por el servidor) ----------
// Todo suena por Web Audio (frases guardadas en mp3 y respuestas en directo) a través de un analizador que anima el núcleo.
// Cola: cada audio se pide ya, en paralelo, y suena en orden. stopSpeaking() vacía la cola.
let voiceMode = load('vozModo', null) ?? (() => { // la preferencia de los HUD antiguos, si la hay
  try { return localStorage.getItem('hud.vozModo') || JSON.parse(localStorage.getItem('movil.vozModo')) || 'full'; } catch { return 'full'; }
})();
let actx, voiceAnalyser, curSrc, playGen = 0, pending = 0, speechChain = Promise.resolve(), liveSrc = [];
function audioCtx() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    voiceAnalyser = actx.createAnalyser(); voiceAnalyser.fftSize = 128;
    voiceAnalyser.connect(actx.destination);
  }
  return actx;
}
// el navegador solo deja sonar audio tras un toque o una tecla del señor
const unlockAudio = () => { audioCtx(); if (actx.state !== 'running') actx.resume().catch(() => {}); };
addEventListener('pointerdown', unlockAudio, true); addEventListener('keydown', unlockAudio, true);
// en iOS 16.4+ suena aunque el iPhone esté en silencio (como un vídeo)
const audioSession = (type) => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch {} };
// Tras pasar por segundo plano iOS deja el audio «suspended»: nada suena y la cola se atascaba. Se reanuda antes de cada audio.
async function readyAudio() {
  const ctx = audioCtx();
  audioSession('playback');
  if (ctx.state !== 'running') await Promise.race([ctx.resume().catch(() => {}), sleep(1500)]);
  return ctx;
}
// espera a que acabe un audio, con red de seguridad por si el navegador nunca avisa
const ended = (src, secs) => new Promise((done) => {
  const t = setTimeout(done, (secs + 2) * 1000);
  src.onended = () => { clearTimeout(t); done(); };
});
const startSpeaking = () => { setState('speaking'); Core.feed(voiceAnalyser); ear.mute(true); };
async function playBuffer(data) {
  const ctx = await readyAudio();
  const buf = await ctx.decodeAudioData(data);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.connect(voiceAnalyser);
  curSrc = src; startSpeaking(); src.start();
  await ended(src, buf.duration);
  if (curSrc === src) curSrc = null;
}
// Voz en directo (/api/tts con stream): PCM de 16 bits a 24 kHz según llega de Google. Cada trozo se programa justo
// detrás del anterior, con un colchón de 0,15 s contra los cortes de red.
async function playStream(r, gen) {
  const ctx = await readyAudio();
  const reader = r.body.getReader();
  let at = 0, odd = null, last = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done || gen !== playGen) break;
    const bytes = odd ? new Uint8Array([...odd, ...value]) : value; // un byte suelto pasa al trozo siguiente
    const n = bytes.length >> 1, pcm = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
    odd = bytes.length & 1 ? bytes.slice(-1) : null;
    if (!n) continue;
    const buf = ctx.createBuffer(1, n, 24000), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = pcm.getInt16(i * 2, true) / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(voiceAnalyser);
    if (!last) startSpeaking();
    at = Math.max(at, ctx.currentTime + 0.15);
    src.start(at); at += buf.duration;
    liveSrc.push(last = src);
  }
  reader.cancel().catch(() => {});
  if (last && gen === playGen) await ended(last, at - ctx.currentTime);
  liveSrc = [];
}
function enqueueSpeech(fetchAudio, onStart) {
  const gen = playGen, dataP = fetchAudio().catch(() => null);
  pending++;
  speechChain = speechChain.then(async () => {
    const data = await dataP;
    if (gen === playGen && data) { onStart?.(); await (data instanceof Response ? playStream(data, gen) : playBuffer(data)).catch(() => {}); }
  }).finally(() => { if (--pending === 0) afterSpeech(); });
}
// Qué hacer al acabar de hablar: { ms, aviso } = escuchar sin «Oye Harvey»; 'fin' = cerrar la conversación
let next = null;
function afterSpeech() {
  Core.feed(null); ear.mute(false);
  if (state === 'speaking' || state === 'idle') setState(live ? 'thinking' : 'idle');
  const n = next; next = null;
  if (n === 'fin') endConvo();
  else if (n && !live) ear.follow(n.ms, n.aviso);
}
// escucha tras hablar (ms para empezar a contestar): si hay voz en cola espera a que acabe
function listenAfterSpeech(ms = 8000, aviso = null) { if (pending) next = { ms, aviso }; else ear.follow(ms, aviso); }
function stopSpeaking() {
  playGen++; next = null;
  try { curSrc?.stop(); } catch {}
  curSrc = null;
  liveSrc.forEach((s) => { try { s.stop(); } catch {} }); liveSrc = [];
}
// Las respuestas se leen enteras, en trozos que se piden a la vez: el primero, corto para que empiece a sonar enseguida;
// los demás, grandes (Google admite 10 peticiones por minuto). Enlaces, símbolos y emojis los quita el servidor (voz.mjs).
function trozos(text, first = true) {
  const out = [];
  for (const f of text.match(/.+?(?:[.!?…]+(?=\s|$)|$)\s*/gs) || []) {
    const tope = first && out.length === 1 ? 200 : 1200;
    if (out.length && out.at(-1).length + f.length <= tope) out[out.length - 1] += f; else out.push(f);
  }
  return out.filter((t) => /[\p{L}\d]/u.test(t));
}
function speak(text, first = true) {
  if (voiceMode !== 'full') return; // las respuestas solo se leen en modo completo
  for (const t of trozos(text.replace(/\[FIN\]/g, ''), first)) enqueueSpeech(async () => { const r = await post('tts', { text: t, stream: true }); return r.ok ? r : null; });
}
// lo que va tras una línea «---» es detalle para la pantalla (p. ej. el informe matutino): no se lee
const soloVoz = (s) => s.replace(/\[FIN\]/g, '').split(/\n\s*-{3,}/)[0];
// hasta dónde se puede leer ya mientras Harvey escribe: último final de frase (o de línea) tras min caracteres
const corte = (s, min) => { let k = -1; for (const m of s.matchAll(/[.!?…:]+\s+|\n+/g)) k = m.index + m[0].length; return k >= min ? k : -1; };
// Frases del repositorio (frases.json): el servidor las guarda en disco y solo gastan voz la primera vez. En «solo frases»
// solo suenan las ya guardadas. show(texto) se llama al empezar a sonar, o enseguida si va en texto.
function sayLine(path, body, { show: showText, voice = true } = {}) {
  const silent = () => post(path, { ...body, silent: true }).then((r) => r.json()).then((j) => showText?.(j.phrase)).catch(() => {});
  if (voiceMode === 'off' || !voice) return silent();
  let text = '';
  enqueueSpeech(async () => {
    const r = await post(path, { ...body, cachedOnly: voiceMode === 'phrases' });
    if (!r.ok) { silent(); return null; } // sin clave de voz u otro fallo: al menos el texto
    if (r.headers.get('content-type')?.includes('json')) { showText?.((await r.json()).phrase); return null; }
    text = decodeURIComponent(r.headers.get('X-Ack-Text') || '');
    return r.arrayBuffer();
  }, () => showText?.(text));
}
const phrase = (kind, opts) => sayLine('phrase', { kind }, opts);
// pitido corto al empezar (y al dejar) de escuchar: sintetizado, no gasta nada
function chime(up = true) {
  try {
    const ctx = audioCtx(), o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.frequency.setValueAtTime(up ? 880 : 1320, t); o.frequency.setValueAtTime(up ? 1320 : 880, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.25);
  } catch {}
}
const MODE_ICON = {
  full: 'M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z',
  phrases: 'M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4Z',
  off: 'M3 9v6h4l5 5V4L7 9H3Zm18.7 1.1-1.4-1.4L18 11l-2.3-2.3-1.4 1.4 2.3 2.3-2.3 2.3 1.4 1.4L18 14l2.3 2.3 1.4-1.4-2.3-2.3 2.3-2.4Z',
};
function setVoiceMode(mode) {
  voiceMode = mode; save('vozModo', mode);
  if (mode === 'off') stopSpeaking();
  $$('[role=radio][data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  $('#voice-pill').dataset.mode = mode;
  $('#voice-icon').setAttribute('d', MODE_ICON[mode]);
  $('#voice-label').textContent = { full: 'voz', phrases: 'frases', off: 'mudo' }[mode];
}
$$('[role=radio][data-mode]').forEach((b) => b.addEventListener('click', () => {
  setVoiceMode(b.dataset.mode);
  if (!PC && b.dataset.mode !== 'off') phrase('saludo_' + dayPart()); // en el móvil, prueba de cómo suena
}));
setVoiceMode(voiceMode);

// ---------- Conversación (se guarda en el propio dispositivo) ----------
let chat = load('chat', []);   // [{ who: 'yo'|'harvey'|'sep', text, files?, voz?, tools?, ack?, error?, typing?, run? }]
let session = load('sesion', null);
let live = null;               // orden en curso: { id, session, seq, msg, es, out, dicho, approval, lastEvent }
let avisoCtx = null;           // aviso de Harvey al que el señor está contestando (viaja con la siguiente orden)
let lastRunAt = 0;
const log = $('#log');
function render(m) {
  const i = chat.indexOf(m);
  if (i < 0) return;
  let el = log.querySelector(`[data-i="${i}"]`);
  if (!el) { el = document.createElement('div'); el.dataset.i = i; log.append(el); }
  if (m.who === 'sep') { el.className = 'sep'; el.textContent = m.text; return; }
  if (m.who === 'yo') {
    el.className = 'msg you';
    el.innerHTML = (m.voz ? '<span class="voz">por voz</span>' : '') + esc(m.text) + (m.files?.length ? `<span class="files">📎 ${esc(m.files.join(', '))}</span>` : '');
    return;
  }
  el.className = `msg h${m.error ? ' error' : ''}`;
  const [say, ...rest] = (m.text || '').replace(/\[FIN\]/g, '').split(/\n\s*-{3,}\s*\n?/);
  const detail = rest.join('\n').trim(), tools = m.tools || [];
  const steps = tools.slice(-6).map((t) => `<li class="${t.s}"><span>${esc(t.label)}</span>${t.d ? `<span class="d">${esc(t.d)}</span>` : ''}</li>`).join('');
  el.innerHTML = (m.ack ? `<div class="ack">${esc(m.ack)}</div>` : '')
    + `<ul class="steps">${tools.length > 6 ? `<li class="done"><span>… y ${tools.length - 6} pasos antes</span></li>` : ''}${steps}</ul>`
    + `<div class="say${m.typing ? ' typing' : ''}">${say.trim() ? (m.fresh ? words(say.trim()) : md(say.trim())) : m.typing ? '' : '…'}</div>`
    + (detail ? `<div class="detail">${md(detail)}</div>` : '');
}
const scrollDown = () => requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
function renderAll() { log.innerHTML = ''; chat.forEach(render); scrollDown(); }
const persist = () => save('chat', chat.map(({ fresh, ...m }) => m));
function push(m) {
  chat.push(m);
  if (chat.length > 80) { chat = chat.slice(chat.length - 60); renderAll(); } // solo se guarda lo reciente
  render(m); delete m.fresh; scrollDown(); persist();
  return m;
}
const paintQueued = new Set();
const repaint = (m) => {
  if (paintQueued.has(m)) return;
  paintQueued.add(m);
  requestAnimationFrame(() => { paintQueued.delete(m); render(m); scrollDown(); });
};
// Saludo según la hora (frase guardada): se ve al final de la conversación, pero no se guarda en ella
function greet(extra = '') {
  const kind = 'saludo_' + dayPart();
  const put = (t) => {
    if (!t) return;
    log.querySelector('.saludo')?.remove();
    log.insertAdjacentHTML('beforeend', `<div class="msg h saludo"><div class="say">${words(t + extra)}</div></div>`);
    scrollDown();
  };
  if (PC) phrase(kind, { show: put });
  else if (!chat.length) post('phrase', { kind, silent: true }).then((r) => r.json()).then((j) => put(j.phrase)).catch(() => {});
}
// Ahorro: cada orden reenvía a Harvey todo el historial de la conversación. Tras 1 h sin órdenes o al cambiar de día se
// empieza otra sin avisar.
function freshSession(force) {
  const now = Date.now(), last = load('ultimaOrden', 0);
  if (force || !session?.startsWith(PREFIX) || now - last > 3600_000 || new Date(last).toDateString() !== new Date(now).toDateString()) {
    session = PREFIX + now.toString(36); save('sesion', session);
    if (chat.length && chat.at(-1).who !== 'sep') push({ who: 'sep', text: 'Nueva conversación · ' + new Date().toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) });
  }
  save('ultimaOrden', now);
}
function newChat() {
  if (live) return aviso('Termine o detenga la orden en curso antes de cambiar de conversación.');
  stopSpeaking(); freshSession(true); show('harvey');
  push({ who: 'harvey', text: 'Nueva conversación, señor. Le escucho.', fresh: true });
  setState('idle');
}
$('#new-chat').addEventListener('click', newChat);
$('#new-chat-2').addEventListener('click', newChat);

// ---------- Harvey usando un sistema: se ilumina su panel en ámbar ----------
const SYSTEMS = [[/gmail|correo|mail/i, 'correo'], [/calendar|calendario|agenda/i, 'agenda'], [/notion|tareas\.py|habitos/i, 'notion']];
const access = {};
function touchSystems(text, on) {
  for (const [re, sys] of SYSTEMS) {
    if (!re.test(text)) continue;
    access[sys] = Math.max(0, (access[sys] || 0) + (on ? 1 : -1));
    $$(`[data-sys="${sys}"]`).forEach((p) => p.classList.toggle('access', access[sys] > 0));
  }
}
const clearAccess = () => { for (const k in access) access[k] = 0; $$('.access').forEach((p) => p.classList.remove('access')); };

// ---------- Enviar una orden ----------
const TOOL_NAMES = { terminal: 'Ejecutando comando', skill_view: 'Consultando habilidad', read_file: 'Leyendo archivo', write_file: 'Escribiendo archivo', web_search: 'Buscando en internet', web_extract: 'Leyendo página web', delegate_task: 'Delegando a un subagente', memory: 'Consultando memoria', todo: 'Organizando pasos', execute_code: 'Ejecutando código', vision_analyze: 'Mirando la imagen', kanban_create: 'Creando tarjeta para el equipo', kanban_list: 'Mirando el tablero', kanban_show: 'Leyendo una tarjeta',
  // los pasos de los agentes del equipo (Tablero y Oficina)
  kanban_complete: 'Cerrando la tarjeta', kanban_request_review: 'Pidiendo revisión a Lince', kanban_block: 'Esperando una respuesta', kanban_comment: 'Dejando una nota',
  image_generate: 'Pintando una imagen', text_to_speech: 'Poniendo voz', patch: 'Corrigiendo un archivo', search_files: 'Buscando en sus archivos' };
const NOTION_OPS = [[/query|search/, 'consultando base de datos'], [/post|create/, 'creando página'], [/patch|update/, 'actualizando página'], [/retrieve|get/, 'leyendo página']];
function toolLabel(t) {
  if (TOOL_NAMES[t]) return TOOL_NAMES[t];
  if (/^browser_/.test(t)) return 'Mirando una web en el navegador';
  if (/notion/i.test(t)) return 'Notion · ' + (NOTION_OPS.find(([re]) => re.test(t.toLowerCase()))?.[1] || t.replace(/^mcp_+notion_+(API[-_])?/i, '').replace(/[-_]+/g, ' '));
  return t.replace(/^mcp_+/, '').replace(/[-_]+/g, ' ');
}
async function ask(text, { voz = false } = {}) {
  text = text.trim();
  const files = attachments.splice(0); // los adjuntos pendientes viajan con la siguiente orden (escrita o hablada)
  if (!text && !files.length) return;
  if (live) { attachments.unshift(...files); paintAttachments(); hint('Sigo con la orden anterior, señor. Un momento.'); return; }
  stopSpeaking();
  $('#choices').innerHTML = '';
  if (!voz) show('harvey'); // hablando, el señor se queda en la pantalla que mira (p. ej. la Oficina)
  freshSession();
  push({ who: 'yo', text: text || 'Le adjunto esto.', files: files.map((f) => f.file.name), voz });
  const m = push({ who: 'harvey', text: '', tools: [], typing: true });
  const L = live = { msg: m, session, seq: -1, out: '', dicho: 0, lastEvent: Date.now() };
  setBusy(true);
  setState('thinking', files.length ? 'Subiendo archivos…' : null);
  const aboutFiles = files.length && (!text || /\b(est[eoa]s?|archivos?|imagen(es)?|fotos?|documentos?|adjuntos?|pdf)\b/i.test(text));
  const showAck = (p) => { if (p) { m.ack = p; repaint(m); persist(); } };
  if (!convo) (aboutFiles ? phrase('archivo', { show: showAck }) : sayLine('ack', { text }, { show: showAck })); // en conversación, sin «Recibido»
  try {
    let message = text || 'Examina los archivos que te adjunto, por favor.';
    if (avisoCtx) { message = `[El señor contesta a esto que le acabas de decir: «${avisoCtx}»]\n\n${message}`; avisoCtx = null; document.body.classList.remove('responder'); }
    if (files.length) {
      const paths = await uploadAll(files);
      message += `\n\n[Archivos adjuntos por el señor desde ${PC ? 'el HUD' : 'el móvil'}:\n` + paths.map((p) => `- ${p.path} (${p.type || 'tipo desconocido'}, ${Math.ceil(p.size / 1024)} KB)`).join('\n') + ']';
      setState('thinking');
    }
    if (live !== L) return; // cancelada mientras se subían los archivos
    const r = await api('ask', { text: message, session: L.session, convo });
    if (!r.run_id) throw new Error('Harvey no ha aceptado la orden.');
    if (live !== L) return stopRun({ id: r.run_id, session: L.session }); // detenida mientras se enviaba
    L.id = m.run = r.run_id; saveLive();
    listen();
  } catch (e) { if (live === L) finish(false, 'No consigo contactar con Harvey: ' + e.message); }
}
const saveLive = () => save('run', live && { id: live.id, session: live.session, seq: live.seq, idx: chat.indexOf(live.msg), out: live.out, dicho: live.dicho });
function setBusy(on) {
  document.body.classList.toggle('busy', on);
  $('#stop').hidden = !on; $('#send').hidden = on; $('#mic').hidden = on && !PC;
  $('#ops-live').textContent = on ? 'trabajando' : 'en reposo';
  clearTimeout(live?.waitTimer);
  // si tarda, Harvey avisa una vez de que sigue con ello (frase guardada): en conversación, «Un momento» a los 10 s
  if (on && live) live.waitTimer = setTimeout(() => { if (live && !live.approval && state === 'thinking') phrase(convo ? 'un_momento' : 'espera', { show: hint }); }, convo ? 10_000 : 25_000);
}
// Eventos en directo. Harvey numera cada evento (seq): si el flujo se corta se vuelve a pedir desde el último visto.
function listen() {
  const L = live;
  L.es?.close();
  const es = L.es = new EventSource(`/api/events?run=${encodeURIComponent(L.id)}&session=${encodeURIComponent(L.session)}&last_seq=${L.seq}`);
  const m = L.msg;
  es.onmessage = (msg) => {
    if (live !== L || L.es !== es) return;
    let ev; try { ev = JSON.parse(msg.data); } catch { return; }
    L.lastEvent = Date.now();
    if (ev.seq != null) { if (ev.seq <= L.seq) return; L.seq = ev.seq; }
    switch (ev.event) {
      case 'message.delta': {
        L.out += ev.delta || ''; m.text = L.out; repaint(m);
        // habla mientras Harvey escribe: la primera frase en cuanto está, luego en trozos grandes
        const voz = soloVoz(L.out), k = corte(voz.slice(L.dicho), L.dicho ? 600 : 40);
        if (k > 0) { speak(voz.slice(L.dicho, L.dicho + k), !L.dicho); L.dicho += k; }
        break;
      }
      case 'tool.started': {
        const ctx = `${ev.tool} ${ev.preview || ''}`;
        touchSystems(ctx, true);
        const cc = /\bclaude\s+-p\b/.test(ev.preview || ''); // Harvey delegando en Claude Code
        m.tools.push({ tool: ev.tool, id: ev.tool_call_id, label: cc ? 'Claude Code programando' : toolLabel(ev.tool), s: 'run', ctx, ts: ev.timestamp });
        repaint(m); break;
      }
      case 'tool.completed': {
        const t = m.tools.find((x) => x.s === 'run' && (ev.tool_call_id ? x.id === ev.tool_call_id : x.tool === ev.tool));
        if (!t) break;
        t.s = ev.error ? 'fail' : 'done';
        // Harvey manda siempre «duration: 0»: se mide con la hora de cada evento (también vale al repetirlos tras un corte)
        const secs = ev.timestamp - t.ts;
        if (secs >= 1) t.d = secs.toFixed(secs < 10 ? 1 : 0) + ' s';
        touchSystems(t.ctx || '', false); delete t.ctx;
        repaint(m); break;
      }
      case 'subagent.start':
        m.tools.push({ tool: 'sub:' + (ev.subagent_id || ''), label: 'Subagente · ' + (ev.goal || 'tarea delegada').slice(0, 70), s: 'run' });
        repaint(m); break;
      case 'subagent.complete': {
        const t = m.tools.find((x) => x.tool === 'sub:' + (ev.subagent_id || '') && x.s === 'run');
        if (!t) break;
        t.s = ev.status === 'failed' ? 'fail' : 'done';
        if (ev.duration_seconds) t.d = ev.duration_seconds.toFixed(0) + ' s';
        repaint(m); break;
      }
      case 'approval.request': showApproval(ev); break;
      case 'approval.responded': L.approval = null; $('#choices').innerHTML = ''; break;
      case 'run.completed': return finish(true, ev.output || L.out);
      case 'run.failed': case 'run.interrupted': case 'run.cancelled':
        return finish(false, ev.error?.message || ev.error || 'La orden no ha podido completarse, señor.');
    }
    saveLive();
    if (ev.event !== 'message.delta') persist(); // los pasos, guardados por si se recarga a mitad (el texto va en saveLive)
  };
  // Al terminar, el servidor cierra el flujo. Si se corta antes (túnel, cobertura, app en segundo plano) no se da por buena
  // una respuesta a medias: se pregunta a Harvey cómo va.
  es.onerror = () => {
    if (live !== L || L.es !== es) return;
    es.close(); L.es = null;
    if (PC || document.visibilityState === 'visible') setTimeout(recover, 1500);
  };
}
// ¿Cómo va la orden? Terminada: se recoge el resultado. En marcha: se vuelve a escuchar. Sin red: reintenta con esperas
// crecientes antes de rendirse.
async function recover(tries = 0) {
  const L = live;
  if (!L?.id || L.es) return;
  try {
    const st = await api(`run?run=${encodeURIComponent(L.id)}&session=${encodeURIComponent(L.session)}`);
    if (live !== L) return;
    if (st.status === 'completed') return finish(true, st.output || L.out);
    if (['failed', 'cancelled', 'interrupted'].includes(st.status)) return finish(false, st.error?.message || st.error || 'La orden no ha podido completarse, señor.');
    if (!st.status) throw new Error(st.error?.message || st.error || 'sin respuesta');
    L.lastEvent = Date.now(); listen();
  } catch (e) {
    if (live !== L) return;
    if (/sesión/.test(e.message)) return; // pide contraseña; se reanuda al entrar
    if (/not found/i.test(e.message) || tries >= 5) return finish(!!L.out, L.out || 'Se perdió la conexión con Harvey.' + (PC ? '' : ' Si termina, le llegará el aviso.'));
    setTimeout(() => { if (live === L && (PC || document.visibilityState === 'visible')) recover(tries + 1); }, 1500 * 2 ** tries);
  }
}
addEventListener('online', () => { if (live?.id && !live.es) recover(); });
// vigilante: si Harvey lleva 90 s sin dar señales (Claude Code programando, una herramienta larga...), se le pregunta cómo va
setInterval(() => {
  const L = live;
  if (L?.es && !L.approval && Date.now() - L.lastEvent > 90_000) { L.lastEvent = Date.now(); L.es.close(); L.es = null; recover(); }
}, 15_000);
function finish(ok, text) {
  const L = live;
  if (!L) return;
  live = null; save('run', null);
  L.es?.close(); clearTimeout(L.waitTimer);
  const m = L.msg, bruto = String(text || ''), fin = /\[FIN\]\s*$/.test(bruto); // [FIN]: Harvey da la conversación por terminada
  const limpio = bruto.replace(/\[FIN\]/g, '').trim();
  Object.assign(m, { text: limpio, typing: false, error: !ok, fresh: ok });
  m.tools?.forEach((t) => { if (t.s === 'run') t.s = ok ? 'done' : 'fail'; delete t.ctx; });
  render(m); delete m.fresh; scrollDown(); persist();
  setBusy(false); clearAccess();
  $('#choices').innerHTML = '';
  lastRunAt = Date.now();
  if (!ok) {
    if (state !== 'speaking') setState('idle');
    if (/cancelad|detenid/i.test(bruto)) phrase('cancelado'); else { link('harvey', 'warn'); phrase('error'); navigator.vibrate?.(80); }
    if (convo) listenAfterSpeech(10_000);
    return;
  }
  link('harvey', 'on');
  if (state === 'thinking') setState('idle');
  // lo que quede por leer (si se perdió algún trozo por el camino, sale de la respuesta final)
  const voz = soloVoz(bruto), dicha = soloVoz(L.out).slice(0, L.dicho);
  speak(voz.startsWith(dicha) ? voz.slice(dicha.length) : soloVoz(L.out).slice(L.dicho), !L.dicho);
  const question = limpio.endsWith('?');
  if (question) quickReplies();
  if (convo && fin) { if (pending) next = 'fin'; else endConvo(); }
  else if (convo) listenAfterSpeech(10_000);
  else if (question) listenAfterSpeech();
  setTimeout(refresh, 3000);
}
const stopRun = (L) => post('stop', { run: L.id, session: L.session }).catch(() => {});
function cancelRun(msg) {
  const L = live;
  if (!L) return;
  if (L.id) stopRun(L);
  finish(false, msg);
}
$('#stop').addEventListener('click', () => cancelRun('Orden detenida, señor.'));
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (Vivo.abierto) return Vivo.parar();
  stopSpeaking();
  if (live) cancelRun('Orden cancelada, señor.');
  else if (convo) ear.follow(10_000); // en conversación: se calla y le escucha
});

// Orden que no lanzó esta pantalla (dictada a Siri, abierta desde un aviso, o del despertador): se trae a la conversación
// para autorizarla o ver su resultado
function adopt(id, sess, label) {
  if (!id || live) return;
  let m = chat.find((x) => x.run === id);
  if (m && !m.error && !m.typing) return; // ya tiene su respuesta
  if (m) Object.assign(m, { typing: true, error: false, text: '', tools: [] });
  else { push({ who: 'sep', text: label }); m = push({ who: 'harvey', text: '', tools: [], typing: true, run: id }); }
  live = { id, session: sess, seq: -1, msg: m, out: '', dicho: 0, es: null, lastEvent: Date.now() };
  saveLive(); setBusy(true); setState('thinking');
  recover();
}
// Despertador del VPS (movil/server.mjs): cuando acaban unos subagentes en segundo plano abre él solo un turno para que
// Harvey siga. El PC adopta los de los últimos 15 min de sus conversaciones (los anteriores ya avisaron al iPhone).
const wakesSeen = new Set();
function adoptWakes(list = []) {
  for (const d of list) {
    if (wakesSeen.has(d.run) || !d.session?.startsWith('hud-')) continue;
    if (Date.now() / 1000 - d.at > 900) { wakesSeen.add(d.run); continue; }
    if (live || state !== 'idle') return;
    wakesSeen.add(d.run);
    return adopt(d.run, d.session, 'Sus subagentes han terminado · Harvey continúa');
  }
}

// ---------- Autorizaciones y respuestas rápidas ----------
const CHOICE_LABELS = { once: 'Aprobar', session: 'Aprobar siempre hoy', deny: 'Rechazar' };
function showApproval(ev) {
  if (!live) return;
  live.approval = ev;
  const box = $('#choices');
  box.innerHTML = `<div class="approval"><h3>AUTORIZACIÓN REQUERIDA</h3><p>${esc(ev.description || 'Harvey quiere ejecutar una acción delicada.')}</p>${ev.command ? `<code>${esc(ev.command)}</code>` : ''}</div>`;
  for (const c of (ev.choices || ['once', 'deny']).filter((c) => c !== 'always')) { // «siempre», mejor desde la configuración
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = CHOICE_LABELS[c] || c; if (c === 'deny') b.className = 'no';
    b.onclick = () => resolveApproval(c);
    box.append(b);
  }
  show('harvey');
  setState('thinking', 'Esperando su autorización, señor…');
  phrase('aprobacion', { voice: !quietHours() });
  navigator.vibrate?.([120, 80, 120]);
  if (PC && document.hidden) toast({ title: 'Autorización requerida', text: ev.description || 'Harvey espera su visto bueno', warn: true, ttl: 0 });
}
async function resolveApproval(choice) {
  const L = live, ev = L?.approval;
  if (!ev) return;
  $('#choices').innerHTML = '';
  L.approval = null; L.lastEvent = Date.now();
  setState('thinking', choice === 'deny' ? 'Rechazado. Informando a Harvey…' : 'Autorizado. Continuando…');
  try { await api('approval', { run: L.id, choice, request_id: ev.request_id, session: L.session }); }
  catch (e) { toast({ title: 'No se pudo responder', text: e.message, warn: true }); }
}
// Harvey ha preguntado algo de sí o no: botones para contestar sin escribir
function quickReplies() {
  for (const [label, answer, cls] of [['Sí, adelante', 'Sí, adelante.', ''], ['No, déjalo', 'No, déjalo.', 'no']]) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.className = cls;
    b.onclick = () => ask(answer);
    $('#choices').append(b);
  }
}

// ---------- Archivos y fotos para Harvey ----------
const attachments = [];
function addFiles(list) {
  for (const file of list) {
    if (file.size > 25e6) { aviso(`${file.name} supera 25 MB`, true); continue; }
    attachments.push({ file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null });
  }
  paintAttachments();
  $('#orden').focus();
}
function paintAttachments(uploading = []) {
  $('#attachments').innerHTML = [...uploading, ...attachments].map((a, i) => {
    const ext = (a.file.name.split('.').pop() || '?').slice(0, 4).toUpperCase();
    return `<div class="att ${a.up ? 'up' : ''}">${a.preview ? `<img src="${a.preview}" alt="">` : `<div class="ext">${esc(ext)}</div>`}
      <span>${esc(a.file.name)} <small>${Math.ceil(a.file.size / 1024)} KB</small></span>
      ${a.up ? '' : `<button type="button" data-i="${i - uploading.length}" aria-label="Quitar ${esc(a.file.name)}">×</button>`}</div>`;
  }).join('');
}
$('#attachments').addEventListener('click', (e) => {
  const i = e.target.dataset?.i;
  if (i == null) return;
  const [a] = attachments.splice(+i, 1);
  if (a?.preview) URL.revokeObjectURL(a.preview);
  paintAttachments();
});
async function uploadAll(files) {
  files.forEach((f) => { f.up = true; });
  paintAttachments(files);
  try {
    return await Promise.all(files.map(async ({ file }) => {
      const r = await fetch('/api/upload?name=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'subida fallida');
      return j;
    }));
  } finally {
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    paintAttachments();
  }
}
$('#clip').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
addEventListener('paste', (e) => { if (e.clipboardData?.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } });
let dragDepth = 0;
addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
  if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
});

// ---------- Caja de texto ----------
const input = $('#orden');
const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; };
input.addEventListener('input', grow);
input.addEventListener('focus', () => { document.body.classList.add('compact'); scrollDown(); });
input.addEventListener('blur', () => setTimeout(() => document.body.classList.remove('compact'), 150));
$('#ask-form').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); input.value = ''; grow(); });
// con teclado de verdad, Intro envía y Mayús+Intro salta de línea (en el iPhone, Intro salta de línea)
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) { e.preventDefault(); $('#ask-form').requestSubmit(); }
});

// ---------- Micro del iPhone: toque para hablar; se envía solo al callarse (Whisper del VPS) ----------
let rec = null;
function toggleMic() {
  if (rec) return stopRec(true);
  if (live) return aviso('Harvey sigue con la orden anterior.');
  startRec();
}
async function startRec() {
  unlockAudio(); stopSpeaking();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return aviso('Este navegador no permite grabar audio.', true);
  audioSession('play-and-record');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch { audioSession('playback'); return aviso('Sin permiso para el micrófono. Actívelo en Ajustes del iPhone.', true); }
  const ctx = audioCtx(), mic = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
  an.fftSize = 512; mic.connect(an);
  const r = new MediaRecorder(stream), chunks = [];
  const R = rec = { r, stream, mic, an, chunks, t0: Date.now(), loud: 0, heard: false };
  r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  r.onstop = () => onRecStop(R);
  r.start(250);
  document.body.classList.add('rec');
  Core.feed(an); setState('listening'); chime(true);
  const buf = new Uint8Array(an.fftSize);
  // tras haber hablado, 1,7 s callado = fin; sin voz en 8 s = cancelar; tope 60 s
  R.timer = setInterval(() => {
    an.getByteTimeDomainData(buf);
    let s = 0; for (const v of buf) { const d = (v - 128) / 128; s += d * d; }
    const rms = Math.sqrt(s / buf.length), now = Date.now();
    if (rms > 0.035) { R.heard = true; R.loud = now; }
    if (R.heard && now - R.loud > 1700) stopRec(true);
    else if (!R.heard && now - R.t0 > 8000) stopRec(false, 'No le oigo, señor.');
    else if (now - R.t0 > 60_000) stopRec(true);
  }, 100);
}
function stopRec(send, msg) {
  const R = rec; if (!R) return;
  rec = null; clearInterval(R.timer);
  Object.assign(R, { send, msg });
  if (R.r.state !== 'inactive') R.r.stop(); else onRecStop(R);
}
async function onRecStop(R) {
  R.stream.getTracks().forEach((t) => t.stop()); R.mic.disconnect();
  document.body.classList.remove('rec');
  Core.feed(null); audioSession('playback');
  if (!R.send) { setState('idle'); if (R.msg) aviso(R.msg); return; }
  chime(false);
  const blob = new Blob(R.chunks, { type: R.r.mimeType || 'audio/mp4' });
  setState('thinking', 'Transcribiendo…');
  try {
    const r = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/mp4' }, body: blob });
    if (r.status === 401) { setState('idle'); return showLogin(); }
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    if (!j.text) { setState('idle'); return aviso('No le he entendido, señor.'); }
    ask(j.text, { voz: true });
  } catch (e) { setState('idle'); aviso('No pude transcribir: ' + e.message, true); }
}
// micro y núcleo: en el PC abren o cierran la conversación (como la tecla º); en el iPhone, graban
$('#mic').addEventListener('click', () => (PC ? toggleConvo() : toggleMic()));
const coreTap = () => {
  if (PC) return toggleConvo();
  if (state === 'speaking') return stopSpeaking();
  if (state === 'idle' || rec) toggleMic();
};
$('#stage').addEventListener('click', coreTap);
$('#stage').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); coreTap(); } });

// ---------- Paneles de la pantalla Harvey ----------
const isToday = (d) => d.toDateString() === new Date().toDateString();
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
const fmtWhen = (iso) => (isToday(new Date(iso)) ? fmtTime(iso) : fmtDay(iso));
const dayKey = () => new Date().toLocaleDateString('sv-SE');
const ago = (sec) => { const m = Math.round((Date.now() / 1000 - sec) / 60); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };
const lapso = (min) => (min < 60 ? `${Math.max(1, Math.round(min))} min` : `${Math.floor(min / 60)} h${Math.round(min % 60) ? ' ' + Math.round(min % 60) : ''}`);
const evStart = (e) => (typeof e.start === 'object' ? e.start?.dateTime || e.start?.date : e.start) || '';
const evEnd = (e) => (typeof e.end === 'object' ? e.end?.dateTime || e.end?.date : e.end) || evStart(e);
const dateOf = (s) => new Date(s.includes('T') ? s : s + 'T12:00'); // las fechas sin hora, a mediodía (sin líos de zona)
// Lista con resaltado de lo nuevo (no en el primer pintado) y barrido de luz en su panel si cambió algo
const seen = {};
function fillList(el, items, keyOf, html, emptyMsg) {
  const prev = seen[el.id], now = new Set(items.map(keyOf));
  el.innerHTML = items.length ? items.map((it, i) => html(it, i).replace('<li', `<li${prev && !prev.has(keyOf(it)) ? ' data-new' : ''}`)).join('') : `<li class="empty">${esc(emptyMsg)}</li>`;
  el.querySelectorAll('[data-new]').forEach((li) => li.classList.add('new'));
  seen[el.id] = now;
  if (!prev || prev.size !== now.size || [...now].some((k) => !prev.has(k))) sweep(el.closest('.panel'));
}
function sweep(p) { if (!p) return; p.classList.remove('refresh'); void p.offsetWidth; p.classList.add('refresh'); }

// Agenda: hoy y mañana, con la línea del día
function renderAgenda(events) {
  const now = new Date(), start = 7, end = 23, span = end - start;
  const pos = (d) => Math.min(100, Math.max(0, ((d.getHours() + d.getMinutes() / 60) - start) / span * 100));
  let line = [7, 11, 15, 19, 23].map((h) => `<span style="left:${(h - start) / span * 100}%">${h}</span>`).join('');
  const manana = new Date(now); manana.setDate(now.getDate() + 1);
  const today = events.filter((e) => isToday(dateOf(evStart(e))));
  for (const e of today.filter((e) => evStart(e).includes('T'))) {
    const a = pos(new Date(evStart(e))), b = pos(new Date(evEnd(e)));
    line += `<i class="ev" style="left:${a}%;width:${Math.max(1.5, b - a)}%" title="${esc(e.title)}"></i>`;
  }
  $('#dayline').innerHTML = line + `<i class="now" style="left:${pos(now)}%"></i>`;
  const near = events.filter((e) => { const d = dateOf(evStart(e)); return isToday(d) || d.toDateString() === manana.toDateString(); });
  const nextUp = today.find((e) => evStart(e).includes('T') && new Date(evStart(e)) > now);
  $('#agenda-count').textContent = near.length || '';
  fillList($('#agenda'), near, (e) => e.title + evStart(e), (e) => {
    const s = evStart(e), timed = s.includes('T'), hoy = isToday(dateOf(s));
    const mins = e === nextUp ? (new Date(s) - now) / 60000 : null;
    const sub = [!timed ? 'todo el día' : hoy ? '' : fmtTime(s), e.location,
      mins != null ? `<span class="${mins <= 15 ? 'att' : ''}">en ${lapso(mins)}</span>` : ''].filter(Boolean);
    return `<li class="${hoy ? 'hoy' : ''}"><span class="k">${hoy ? (timed ? fmtTime(s) : 'hoy') : fmtDay(dateOf(s))}</span><span class="t">${esc(e.title)}</span>${sub.length ? `<span class="s">${sub.map((x) => (x.startsWith('<span') ? x : esc(x))).join(' · ')}</span>` : ''}</li>`;
  }, 'Nada hoy ni mañana');
  const later = events.length - near.length;
  if (later > 0) $('#agenda').insertAdjacentHTML('beforeend', `<li class="more">y ${later} más esta semana</li>`);
}
// Tareas de Notion: las de hoy y las atrasadas, en ámbar
function renderTareas(tareas) {
  const hoy = dayKey();
  $('#task-count').textContent = tareas.length || '';
  fillList($('#tasks'), tareas, (t) => t.title, (t) => {
    const f = t.fecha?.slice(0, 10), due = f && f <= hoy;
    const cls = [due && 'warn', t.prioridad?.includes('Alta') && 'alta'].filter(Boolean).join(' ');
    return `<li class="${cls}"><span class="k">${due ? 'hoy' : f ? fmtDay(dateOf(f)) : '—'}</span><span class="t">${esc(t.title)}</span>${f && f < hoy ? `<span class="s">atrasada desde el ${fmtDay(dateOf(f))}</span>` : ''}</li>`;
  }, 'Sin tareas pendientes');
}
// Correo: tocar uno lo despliega y deja pedirle a Harvey un resumen
let mailItems = [];
function renderMail(mail) {
  mailItems = mail;
  $('#mail-count').textContent = mail.length || '';
  fillList($('#mail'), mail, (m) => m.id || m.subject + m.date, (m, i) =>
    `<li data-m="${i}"><span class="k">${fmtWhen(m.date)}</span><span class="t">${esc(m.subject)}</span><span class="s">${esc(m.from)} · ${esc(m.snippet)}</span><button type="button" class="act" data-m="${i}">Que Harvey lo resuma</button></li>`,
  'Bandeja al día, señor');
}
$('#mail').addEventListener('click', (e) => {
  const act = e.target.closest('.act');
  if (act) { const m = mailItems[+act.dataset.m]; if (m) ask(`Resúmeme el correo «${m.subject}» de ${m.from} y dime si requiere que haga algo.`); return; }
  e.target.closest('li[data-m]')?.classList.toggle('open');
});

// Hábitos (vps/habitos.py): 3 casillas por día, semana de lunes a domingo. Toque: sin marcar → hecho → no → sin marcar;
// la lectura pide minutos. Se pinta al momento y se corrige con lo que devuelve Notion.
const HAB = [['gym', 'Gimnasio', 'Gimnasio'], ['lectura', 'Lectura', 'Lectura'], ['instagram', 'Instagram', 'Instagram ≤15 min']];
const habDone = (k, v) => (k === 'lectura' ? v > 0 : v === true);
const hrs = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? m % 60 : ''}` : `${m}′`);
let habs = null, habQueue = Promise.resolve(), habPending = 0;
function renderHabits(h, pop) {
  habs = h;
  const m = h.metas, p = h.progreso;
  const prog = { gym: [p.gym, m.gym, `${p.gym}/${m.gym}`], lectura: [p.lectura, m.lectura, `${hrs(p.lectura)}/${hrs(m.lectura)}`], instagram: [p.instagram, m.instagram, `${p.instagram}/${m.instagram}`] };
  let html = '<span></span>' + h.dias.map((d) => `<span class="d ${d.fecha === h.hoy ? 'today' : ''}">${dateOf(d.fecha).toLocaleDateString('es-ES', { weekday: 'narrow' })}</span>`).join('') + '<span></span>';
  for (const [k, lbl, name] of HAB) {
    html += `<span class="lbl" title="${name}">${lbl}</span>` + h.dias.map((d) => {
      const v = d[k], cls = v == null ? '' : habDone(k, v) ? 'y' : 'no';
      const dicho = v == null ? 'sin marcar' : k === 'lectura' ? (v ? `${v} minutos` : 'no leyó') : v ? 'hecho' : 'no';
      return `<button type="button" class="hc ${cls} ${d.fecha === h.hoy ? 'today' : ''} ${pop === k + d.fecha ? 'pop' : ''}" data-k="${k}" data-f="${d.fecha}" ${d.activo ? '' : 'disabled'} aria-label="${name}, ${fmtDay(dateOf(d.fecha))}: ${dicho}" title="${fmtDay(dateOf(d.fecha))}: ${dicho}"></button>`;
    }).join('') + `<span class="p ${prog[k][0] >= prog[k][1] ? 'done' : ''}" title="meta de la semana">${prog[k][2]}</span>`;
  }
  $('#habits').innerHTML = html;
  const hoy = h.dias.find((d) => d.fecha === h.hoy), pend = hoy ? HAB.filter(([k]) => hoy[k] == null).length : 0;
  $('#hab-count').textContent = !hoy ? '' : pend ? `${pend} sin marcar hoy` : '✓ hoy';
}
function setHabit(k, fecha, valor) {
  const before = structuredClone(habs), d = habs.dias.find((x) => x.fecha === fecha);
  d[k] = valor === 'nada' ? null : k === 'lectura' ? +valor : valor === 'si';
  renderHabits(habs, k + fecha);
  navigator.vibrate?.(15);
  const done = habDone(k, d[k]) && fecha === habs.hoy, all = HAB.every(([c]) => habDone(c, d[c]));
  if (done) phrase(all ? 'habitos_completo' : 'habito_hecho', { show: (t) => t && aviso(t) });
  habPending++;
  // en fila: varios toques seguidos llegan a Notion en el mismo orden
  habQueue = habQueue.then(async () => {
    const j = await api('habito', { habito: k, valor, fecha });
    if (habPending === 1) renderHabits(j);
  }).catch((e) => { renderHabits(before); toast({ title: 'No he podido apuntarlo', text: e.message, warn: true }); })
    .finally(() => { habPending--; });
}
$('#habits').addEventListener('click', (e) => {
  const b = e.target.closest('.hc:not(:disabled)');
  if (!b) return;
  const { k, f } = b.dataset, v = habs.dias.find((x) => x.fecha === f)[k], pick = $('#hread');
  if (k !== 'lectura') return setHabit(k, f, v == null ? 'si' : v ? 'no' : 'nada');
  if (!pick.hidden && pick.dataset.f === f) { pick.hidden = true; return; }
  pick.dataset.f = f; pick.hidden = false;
  pick.innerHTML = `<span>Lectura · ${fmtDay(dateOf(f))}</span>` + [[0, 'No leí'], [15, '15′'], [30, '30′'], [45, '45′'], [60, '1 h'], [90, '1 h 30'], [120, '2 h']]
    .map(([m, l]) => `<button type="button" data-v="${m}" class="${v === m ? 'on' : ''}">${l}</button>`).join('') + (v == null ? '' : '<button type="button" data-v="nada">Borrar</button>');
});
$('#hread').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('#hread').hidden = true;
  setHabit('lectura', $('#hread').dataset.f, b.dataset.v);
});

// El equipo (vps/tablero.py): una línea por agente. Los colores son los de su cara pixel, igual que en la Oficina.
const AG = {
  sherlock: ['Sherlock', 'Investigación', '#5E4E38', '#7A6448', '#2F2622'], jordan: ['Jordan', 'Comercial', '#26324F', '#33436A', '#6B5030'],
  eco: ['Eco', 'Contenido y formación', '#5A3D2B', '#7A4E33', '#1E1612'], leonardo: ['Leonardo', 'Programación', '#6E2424', '#8E2E2E', '#DAD4C8'],
  lince: ['Lince', 'Revisión', '#2A4A63', '#2A4A63', '#3B2A1E'], tomo: ['Tomo', 'Biblioteca', '#5C5245', '#77695A', '#C9C2B5'],
  default: ['Harvey', 'Jefe de gabinete', '#1F3B57', '#2B5A80', '#0E1A26'], // las tarjetas a su nombre (enviar un correo aprobado...)
};
const LIBRE = ['en la cocina', 'mirando la ría', 'en el sofá', 'tomando un café'];
// dónde está cada uno sin tarjeta: cambia cada hora y es el mismo sitio en la lista y en la Oficina (oficina.js)
const libreDe = (id) => ([...id].reduce((s, ch) => s + ch.charCodeAt(0), 0) + new Date().getHours()) % LIBRE.length;
const ORDEN_ESTADO = { trabajando: 0, espera: 1, cola: 2, libre: 3 };
// en la Oficina, tocar a uno abre su ficha (data-ag) en vez de cambiar de pantalla (data-go)
function teamHtml(list, enOficina = false) {
  return [...list].sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]).map((a) => {
    const [nm, oficio, c, c2, h] = AG[a.agente] || [a.agente, '', '#26394B', '#1A2836', '#111'];
    const ahora = Date.now() / 1000;
    const [cls, sub, st] = a.estado === 'trabajando' ? ['work', a.titulo, lapso((ahora - a.desde) / 60)]
      : a.estado === 'espera' ? ['wait', a.aprobar ? 'espera su visto bueno' : 'le ha preguntado algo', '!']
        : a.estado === 'cola' ? ['cola', 'en cola · ' + a.titulo, 'en cola']
          : ['', LIBRE[libreDe(a.agente)], 'libre'];
    const destino = enOficina ? `data-ag="${esc(a.agente)}"` : `data-go="${a.estado === 'espera' ? 'tablero' : 'oficina'}"`;
    return `<li class="${cls}" ${destino} title="${esc(oficio)}${a.titulo ? ' · ' + esc(a.titulo) : ''}">
      <span class="av" data-ag="${esc(a.agente)}" style="--c:${c};--c2:${c2};--h:${h}"></span><span class="nm">${nm}<small>${esc(sub)}${a.mas ? ` (y ${a.mas} más)` : ''}</small></span><span class="st">${st}</span></li>`;
  }).join('');
}
function renderEquipo(e) {
  const n = e.agentes.filter((a) => a.estado === 'trabajando').length;
  $('#equipo-count').textContent = n ? `${n} trabajando` : 'todos libres';
  $('#team').innerHTML = teamHtml(e.agentes);
  $('#team-oficina').innerHTML = teamHtml(e.agentes, true);
}

// Parte del día: qué hay hoy, qué terminó el equipo desde ayer y qué espera su visto bueno
let lastSnap = null, apList = [];
function renderParte() {
  const s = lastSnap;
  if (!s) return;
  const P = [], t = s.tiempo?.ok && s.tiempo.data.ahora;
  $('#parte-dia').textContent = new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
  if (s.calendar?.ok) {
    const hoy = s.calendar.data.filter((e) => isToday(dateOf(evStart(e))));
    const conHora = hoy.filter((e) => evStart(e).includes('T'));
    P.push(hoy.length ? `Hoy tiene <b>${hoy.length} ${hoy.length === 1 ? 'cita' : 'citas'}</b>${conHora[0] ? `; la primera, a las ${fmtTime(evStart(conHora[0]))}` : ''}.` : 'Hoy no tiene nada en la agenda.');
  }
  if (t) P.push(`En Portugalete, ${t.temp}° y ${esc(t.cielo)}.`);
  if (s.notion?.ok) {
    const n = s.notion.data.tareas.filter((x) => x.fecha && x.fecha.slice(0, 10) <= dayKey()).length;
    if (n) P.push(`<b>${n} ${n === 1 ? 'tarea' : 'tareas'}</b> para hoy o atrasadas.`);
  }
  if (s.equipo?.ok) {
    const h = s.equipo.data.hechas;
    P.push(h.length ? `Desde ayer el equipo terminó <b>${h.length} ${h.length === 1 ? 'encargo' : 'encargos'}</b>: ${h.slice(0, 2).map((x) => `«${esc(x.titulo)}»`).join(' y ')}${h.length > 2 ? ` y ${h.length - 2} más` : ''}.`
      : 'El equipo no ha terminado nada desde ayer.');
  }
  if (apList.length) P.push(`<span class="att-l">Le ${apList.length === 1 ? 'espera' : 'esperan'} ${apList.length} ${apList.length === 1 ? 'decisión' : 'decisiones'}: <button type="button" data-go="tablero">«${esc(apList[0].titulo.replace(/^aprobar:\s*/i, ''))}»</button>${apList.length > 1 ? ' y más' : ''}.</span>`);
  $('#parte').innerHTML = P.map((x) => `<p>${x}</p>`).join('');
}

// ---------- Tablero: la bandeja «Te esperan» (vps/aprobaciones.py) ----------
// «Aprobar: …» trae el texto exacto (APROBAR.md) para copiar; una pregunta solo se responde.
let apSeen = null, apBusy = false, apHtml = '';
function renderAprobaciones(list) {
  apList = list;
  $$('[data-espera]').forEach((b) => { b.hidden = !list.length; b.textContent = list.length; });
  const vis = list.filter(pasa); // el filtro del Tablero (tablero y objetivo); el número de las pestañas cuenta todas
  $('#ap-count').textContent = vis.length || '';
  const nuevas = apSeen ? list.filter((x) => !apSeen.has(x.id)) : [];
  apSeen = new Set(list.map((x) => x.id));
  for (const x of nuevas) toast({ title: x.tipo === 'aprobar' ? 'Necesita su visto bueno' : 'El equipo pregunta', text: x.titulo.replace(/^aprobar:\s*/i, ''),
    sub: `${AG[x.agente]?.[0] || x.agente} · ${x.tablero}`, warn: true, ttl: 0, actions: [{ label: 'VER', run: () => show('tablero') }] });
  renderParte();
  if (apBusy) return; // no repintar mientras el señor escribe una respuesta
  const html = !vis.length ? `<p class="quiet">${list.length ? 'Nada de lo que está mirando.' : 'Nada pendiente. Cuando el equipo necesite su visto bueno o le pregunte algo, aparecerá aquí.'}</p>` : vis.map((x) => `
    <div class="apc ${x.tipo}" data-t="${esc(x.tablero)}" data-id="${esc(x.id)}">
      <div class="h"><span class="chip">${x.tipo === 'aprobar' ? 'APROBAR' : 'PREGUNTA'}</span><span>${esc(AG[x.agente]?.[0] || x.agente)} · ${esc(x.tablero)} · ${ago(x.desde)}</span></div>
      <p class="t">${esc(x.titulo.replace(/^aprobar:\s*/i, ''))}</p>
      ${x.motivo ? `<p class="m">${esc(x.motivo)}</p>` : ''}
      ${x.texto ? `<div class="txt bi-md">${pagina(x.texto)}</div>` : ''}
      <div class="acts">
        ${x.tipo === 'aprobar' ? '<button type="button" data-a="aprobar" class="si">APROBAR</button>' : ''}
        ${x.texto ? '<button type="button" data-a="leer">LEER ENTERO</button>' : ''}
        <button type="button" data-a="responder">RESPONDER</button>
        ${x.texto ? '<button type="button" data-a="copiar">COPIAR TEXTO</button>' : ''}
        ${x.tipo === 'aprobar' ? '<button type="button" data-a="rechazar" class="no">RECHAZAR</button>' : ''}
      </div>
      <div class="resp" hidden><textarea rows="3" placeholder="Su respuesta o los cambios que quiere…" aria-label="Respuesta"></textarea>
        <div class="acts"><button type="button" data-a="enviar" class="si">ENVIAR</button><button type="button" data-a="cancelar">CANCELAR</button></div></div>
    </div>`).join('');
  // el refresco (cada 8 s) no repinta lo que no ha cambiado ni devuelve el texto arriba mientras se lee
  if (html === apHtml) return;
  const scroll = Object.fromEntries($$('#ap .apc').map((c) => [c.dataset.id, c.querySelector('.txt')?.scrollTop || 0]));
  $('#ap').innerHTML = apHtml = html;
  $$('#ap .apc').forEach((c) => { const t = c.querySelector('.txt'); if (t) t.scrollTop = scroll[c.dataset.id] || 0; });
}
const refreshAprobaciones = () => api('aprobaciones').then(renderAprobaciones).catch(() => {});
const apDe = (card) => apList.find((x) => x.id === card.dataset.id && x.tablero === card.dataset.t);
$('#ap').addEventListener('click', async (e) => {
  const b = e.target.closest('button'), card = e.target.closest('.apc');
  if (!b || !card) return;
  const a = b.dataset.a, resp = card.querySelector('.resp');
  if (a === 'copiar') {
    try { await navigator.clipboard.writeText(apDe(card)?.texto || ''); b.textContent = 'COPIADO ✓'; } catch { b.textContent = 'NO SE PUDO COPIAR'; }
    return setTimeout(() => { b.textContent = 'COPIAR TEXTO'; }, 2000);
  }
  if (a === 'leer') { // lector grande: el texto a la anchura de una página, con letra normal
    const x = apDe(card), d = $('#ap-leer');
    d.querySelector('h2').textContent = x.titulo.replace(/^aprobar:\s*/i, '');
    d.querySelector('.bi-md').innerHTML = pagina(x.texto);
    return d.showModal();
  }
  if (a === 'responder') { resp.hidden = false; apBusy = true; return resp.querySelector('textarea').focus(); }
  if (a === 'cancelar') { resp.hidden = true; apBusy = false; return; }
  const accion = a === 'enviar' ? 'responder' : a, texto = a === 'enviar' ? resp.querySelector('textarea').value.trim() : '';
  if (accion === 'responder' && !texto) return resp.querySelector('textarea').focus();
  card.querySelectorAll('button').forEach((x) => { x.disabled = true; });
  b.textContent = 'ENVIANDO…';
  try {
    const list = await api('aprobaciones', { tablero: card.dataset.t, id: card.dataset.id, accion, texto });
    apBusy = false; renderAprobaciones(list); refreshTablero();
    toast({ title: accion === 'aprobar' ? 'Aprobado' : accion === 'rechazar' ? 'Rechazado' : 'Respuesta enviada', text: 'El equipo sigue con ello.' });
  } catch (err) { apBusy = false; toast({ title: 'No se pudo enviar', text: err.message, warn: true }); refreshAprobaciones(); }
});
setInterval(() => { if (PC || document.visibilityState === 'visible') refreshAprobaciones(); }, 60_000);

// ---------- Tablero: objetivos y tarjetas de los dos tableros (vps/tablero.py) ----------
// Columnas: por hacer · trabajando · en revisión · te esperan (la bandeja) · hecho en 7 días. Tocar un objetivo filtra
// sus tarjetas; tocar una tarjeta muestra el encargo y la entrega. Se refresca cada 15 s mientras se mira.
const tb = { data: null, filtro: load('tbFiltro', ''), obj: null, espObj: {}, abiertas: new Set() };
const pasa = (x) => (!tb.filtro || x.tablero === tb.filtro) && (!tb.obj || (x.objetivo ?? tb.espObj[x.id]) === tb.obj);
const COL_VACIA = { cola: 'Nada en cola.', trabajando: 'Nadie trabajando ahora.', revision: 'Nada en revisión.', hecho: 'Nada terminado esta semana.' };
const cuando = (sec) => { const d = new Date(sec * 1000); return (isToday(d) ? '' : fmtDay(d) + ' ') + fmtTime(d); };
function tarjetaHtml(t, objs) {
  const [nm, , c, c2, h] = AG[t.agente] || [t.agente || '—', '', '#26394B', '#1A2836', '#111'];
  const col = t.columna, ahora = Date.now() / 1000;
  const w = col === 'trabajando' ? lapso((ahora - (t.empezada || t.creada)) / 60) : col === 'hecho' ? cuando(t.terminada)
    : col === 'revision' ? 'con Lince' : t.estado === 'scheduled' ? 'aparcada' : '';
  const sub = col === 'trabajando' || col === 'revision' ? (t.paso ? `${toolLabel(t.paso)} · ${ago(t.paso_t)}` : '')
    : col === 'cola' ? (t.espera_a.length ? `espera a «${t.espera_a[0]}»` : t.estado === 'scheduled' ? 'espera a que se renueve el cupo' : t.estado === 'triage' ? 'por concretar' : 'esperando turno')
      : '';
  const obj = t.objetivo && objs.find((o) => o.id === t.objetivo);
  const det = (t.resumen ? `<b>${col === 'hecho' ? 'ENTREGA' : 'ÚLTIMO RESUMEN'}</b>${esc(t.resumen)}` : '') + (t.cuerpo ? `<b>ENCARGO</b>${esc(t.cuerpo)}` : '');
  return `<article class="tk" data-id="${esc(t.id)}" tabindex="0" aria-expanded="${tb.abiertas.has(t.id)}">
    <div class="h"><span class="av" data-ag="${esc(t.agente)}" style="--c:${c};--c2:${c2};--h:${h}"></span><b>${esc(nm)}</b><span>${esc(t.tablero)}</span><span class="w">${esc(w)}</span></div>
    <p class="tt">${esc(t.titulo)}</p>${sub ? `<p class="ts ${col === 'trabajando' ? 'run' : ''}">${esc(sub)}</p>` : ''}
    ${t.objetivo ? `<span class="oc" title="Objetivo">${esc(obj?.titulo || t.objetivo)}</span>` : ''}${det ? `<div class="det">${det}</div>` : ''}</article>`;
}
function objHtml(o) {
  const fin = /^\d{4}-\d\d-\d\d$/.test(o.fecha_limite || '') ? 'hasta el ' + fmtDay(dateOf(o.fecha_limite)) : 'sin fecha';
  const tok = o.tokens_hoy >= 1e3 ? Math.round(o.tokens_hoy / 1e3) + 'k' : o.tokens_hoy;
  const tope = o.cupo_maximo ? ` · tope ${o.cupo_maximo.replace(/ de la ventana de 5 horas por día/, ' al día')}` : '';
  return `<button type="button" class="obj ${o.semaforo}" data-obj="${esc(o.id)}" aria-pressed="${tb.obj === o.id}" title="Toque para ver solo sus tarjetas">
    <span class="ot"><i></i>${esc(o.titulo)}</span>
    <span class="hitos">${o.hitos.map((x) => `<i class="${x.hecho ? 'y' : ''}" title="${esc(x.texto)}"></i>`).join('')}</span>
    <small>${o.hitos.length ? `${o.hechos} de ${o.hitos.length} hitos` : 'sin hitos'} · ${fin}${o.estado !== 'activo' ? ' · ' + esc(o.estado) : ''}</small>
    ${o.siguiente ? `<p>Siguiente: ${esc(o.siguiente)}</p>` : ''}
    <small>${tok} tokens hoy${esc(tope)} · ${o.tarjetas} ${o.tarjetas === 1 ? 'tarjeta' : 'tarjetas'}</small></button>`;
}
function renderTablero() {
  const d = tb.data;
  if (!d) return;
  if (tb.obj && !d.objetivos.some((o) => o.id === tb.obj)) tb.obj = null;
  const objs = d.objetivos.filter((o) => !tb.filtro || !o.tablero || o.tablero === tb.filtro);
  $('#objs').innerHTML = (objs.length ? objs.map(objHtml).join('')
    : '<div class="obj vacio"><span class="ot"><i></i>Aún no hay objetivos</span><p>Cuando le dé uno a Harvey («conseguir 3 reuniones con talleres este mes»), aparecerá aquí con sus hitos, su siguiente paso y lo que gasta cada día.</p></div>')
    + '<button type="button" class="obj add" id="obj-nuevo">＋ Nuevo objetivo</button>';
  // las tarjetas que cambian de sitio se deslizan desde donde estaban
  const antes = new Map($$('.tk').map((el) => [el.dataset.id, el.getBoundingClientRect()]));
  for (const col of ['cola', 'trabajando', 'revision', 'hecho']) {
    const lista = d.tarjetas.filter((t) => t.columna === col && pasa(t)), vistas = col === 'hecho' ? lista.slice(0, 15) : lista;
    const box = $(`.colk[data-col="${col}"]`);
    box.querySelector('.c').textContent = lista.length || '';
    box.querySelector('.tks').innerHTML = !vistas.length ? `<p class="quiet">${COL_VACIA[col]}</p>`
      : vistas.map((t) => tarjetaHtml(t, d.objetivos)).join('') + (lista.length > vistas.length ? `<p class="quiet">y ${lista.length - vistas.length} más</p>` : '');
  }
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const el of $$('.tk')) {
    if (tb.abiertas.has(el.dataset.id)) el.classList.add('open');
    const r0 = antes.get(el.dataset.id);
    if (!r0 || quieto) continue;
    const r1 = el.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  const n = d.tarjetas.filter((t) => t.columna === 'trabajando').length;
  $('#tb-nota').textContent = `${n ? `${n} trabajando · ` : ''}actualizado a las ${fmtTime(new Date())}`;
}
let tbBusy = false;
async function refreshTablero() {
  if (tbBusy) return;
  tbBusy = true;
  try {
    const d = await api('tablero');
    tb.data = d;
    tb.espObj = Object.fromEntries(d.espera.map((x) => [x.id, x.objetivo]));
    renderAprobaciones(d.espera);
    renderTablero();
    Oficina.datos(d);
  } catch (e) { $('#tb-nota').textContent = 'No llegan las tarjetas: ' + e.message; Oficina.sinSenal(true); }
  finally { tbBusy = false; }
}
// Tablero y Oficina se refrescan cada 8 s mientras se miran (la Oficina reacciona a cada cambio de los tableros)
// solo con la ventana a la vista, también en el PC: antes animaba la Oficina cada 8 s aunque nadie mirase (auditoría F1)
setInterval(() => { if (['tablero', 'oficina'].includes(document.body.dataset.screen) && document.visibilityState === 'visible') refreshTablero(); }, 8_000);
const paintFiltro = () => $$('#tb-filtro [data-tb]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tb === tb.filtro)));
$$('#tb-filtro [data-tb]').forEach((b) => b.addEventListener('click', () => {
  tb.filtro = b.dataset.tb; save('tbFiltro', tb.filtro); paintFiltro();
  renderTablero(); renderAprobaciones(apList);
}));
paintFiltro();
$('#objs').addEventListener('click', (e) => {
  if (e.target.closest('#obj-nuevo')) { $('#nuevo-obj').hidden = false; return $('#no-meta').focus(); }
  const b = e.target.closest('[data-obj]');
  if (!b) return;
  tb.obj = tb.obj === b.dataset.obj ? null : b.dataset.obj;
  renderTablero(); renderAprobaciones(apList);
});
const abrirTarjeta = (k) => {
  k.classList.toggle('open');
  k.setAttribute('aria-expanded', String(k.classList.contains('open')));
  if (k.classList.contains('open')) tb.abiertas.add(k.dataset.id); else tb.abiertas.delete(k.dataset.id);
};
$('#kanban').addEventListener('click', (e) => { const k = e.target.closest('.tk'); if (k) abrirTarjeta(k); });
$('#kanban').addEventListener('keydown', (e) => { const k = e.target.closest('.tk'); if (k && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirTarjeta(k); } });
// «Nuevo objetivo»: no se escribe la ficha aquí; se le pide a Harvey, que la redacta y pregunta lo que falte (DIRECCION.md)
$('#nuevo-obj').addEventListener('submit', (e) => {
  e.preventDefault();
  const meta = $('#no-meta').value.trim(), fecha = $('#no-fecha').value, limites = $('#no-limites').value.trim();
  if (!meta) return $('#no-meta').focus();
  ask(['Nuevo objetivo desde el Tablero del HUD.', `- Qué quiero conseguir: ${meta}`,
    `- Para cuándo: ${fecha ? dateOf(fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'sin fecha fija'}`,
    `- Tablero: ${$('#no-tablero').value}`, `- Qué no hacer: ${limites || 'lo de siempre: nada sale fuera sin mi aprobación y 0 €'}`,
    `- Cupo máximo: ${$('#no-cupo').value} % de la ventana de 5 horas por día`,
    'Conviértelo en su ficha de objetivo como dice DIRECCION.md y pregúntame lo que falte antes de activarla.'].join('\n'));
  e.target.reset(); e.target.hidden = true;
});
$('#nuevo-obj [data-a="cerrar"]').addEventListener('click', () => { $('#nuevo-obj').hidden = true; });

// ---------- Biblioteca: la wiki del equipo (vps/biblioteca.py) ----------
// Las notas como páginas, con buscador y lo último que ha cambiado. Solo tres formularios escriben (un objetivo, la ficha
// de un cliente y la voz de LinkedIn) y solo sus campos; lo demás se abre en Obsidian. Si la nota cambió desde que se
// abrió (Obsidian, un agente), el servidor no la pisa.
const bi = { data: null, at: 0, ruta: null, editando: false, q: '' };
const CARPETAS = [['', 'Empezar aquí'], ['objetivos', 'Objetivos'], ['negocio/clientes', 'Clientes'], ['negocio', 'Negocio'], ['negocio/linkedin', 'LinkedIn'],
  ['aprendido', 'Aprendido'], ['fuentes', 'Fuentes'], ['entregas', 'Entregas'], ['proyectos', 'Proyectos'], ['amet', 'AMET'],
  ['equipo', 'Equipo'], ['equipo/oficios', 'Oficios del equipo'], ['equipo/rubricas', 'Rúbricas (qué es «terminado»)']];
const carpetaDe = (ruta) => (ruta.includes('/') ? ruta.slice(0, ruta.lastIndexOf('/')) : '');
const nombreCarpeta = (c) => CARPETAS.find(([k]) => k === c)?.[1] || c;
const QUIEN = { tomo: ['Tomo', 'archivó'], equipo: ['El equipo', 'guardó'], servidor: ['El servidor', 'guardó'], senor: ['Usted', 'cambió'],
  obsidian: ['Usted', 'cambió en Obsidian'], hud: ['Usted', 'cambió desde el HUD'] };
const META = { estado: 'Estado', ultimo_contacto: 'Último contacto', fecha_limite: 'Plazo', desde: 'Desde', tablero: 'Tablero', cupo_maximo: 'Cupo máximo' };
const ROJO = ['no contactar', 'no interesado'], VERDE = ['cliente', 'activo', 'terminado'], AMBAR = ['en pausa', 'en conversación'];
const tono = (v) => (ROJO.includes(v) ? 'bad' : VERDE.includes(v) ? 'ok' : AMBAR.includes(v) ? 'warn' : '');
const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); // misma longitud que el texto en español
const diaHora = (sec) => {
  const d = new Date(sec * 1000), ayer = new Date(Date.now() - 864e5);
  return (isToday(d) ? 'hoy' : d.toDateString() === ayer.toDateString() ? 'ayer' : fmtDay(d)) + ' a las ' + fmtTime(d);
};
const obsidian = (ruta) => 'obsidian://open?vault=harvey-wiki&file=' + encodeURIComponent(ruta.replace(/\.md$/, ''));
const notaDe = (ruta) => bi.data?.notas.find((n) => n.ruta === ruta);
// cabecera de la nota: entre --- o, en las fichas de cliente, las líneas «clave: valor» de arriba
function partes(txt) {
  const meta = {}, m = txt.match(/^---\n([\s\S]*?)\n---\n/) || txt.match(/^((?:[a-z_]+:.*\n)+)/);
  if (!m) return { meta, cuerpo: txt };
  for (const l of m[1].split('\n')) { const k = l.split(':')[0].trim(); if (k) meta[k] = l.slice(l.indexOf(':') + 1).trim(); }
  return { meta, cuerpo: txt.slice(m[0].length) };
}

// Markdown de Obsidian → página: títulos, listas (con casillas), tablas, código, citas y [[enlaces]] entre notas
function enlace(r, alias) {
  const n = notaDe(r + '.md') || bi.data?.notas.find((x) => x.ruta.endsWith('/' + r + '.md'));
  return n ? `<button type="button" class="wl" data-nota="${esc(n.ruta)}">${alias || esc(n.titulo)}</button>` : `<span class="wl roto">${alias || r}</span>`;
}
const inl = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/(^|[\s(«])[*_](?![\s*_])([^*_]+?)[*_](?=[\s).,;:»]|$)/g, '$1<i>$2</i>')
  .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, r, a) => enlace(r.trim(), a))
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
const celdas = (f) => f.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
function tabla(filas) {
  const sep = filas[1] && /^\s*\|[\s:|-]+\|\s*$/.test(filas[1]);
  const cab = sep ? `<thead><tr>${celdas(filas[0]).map((c) => `<th>${inl(c)}</th>`).join('')}</tr></thead>` : '';
  return `<div class="bi-tabla"><table>${cab}<tbody>${filas.slice(sep ? 2 : 0).map((f) => `<tr>${celdas(f).map((c) => `<td>${inl(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const BLOQUE = /^(#{1,4} |\s*[-*+](\s|$)|\s*\d+\.(\s|$)|```|>|\s*\|)/;
function pagina(txt) {
  const out = [], L = txt.split('\n');
  let lista = null;
  const cierra = () => { if (lista) out.push(`</${lista}>`); lista = null; };
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    let m;
    if (/^```/.test(l)) {
      cierra();
      let fin = L.findIndex((x, k) => k > i && /^```/.test(x));
      if (fin < 0) fin = L.length;
      out.push(`<pre>${esc(L.slice(i + 1, fin).join('\n'))}</pre>`); i = fin;
    } else if ((m = l.match(/^(#{1,4}) +(.+)/))) {
      cierra(); const n = Math.min(4, m[1].length + 1); out.push(`<h${n}>${inl(m[2])}</h${n}>`);
    } else if (/^\s*\|.*\|\s*$/.test(l)) {
      cierra(); const filas = [];
      while (i < L.length && /^\s*\|.*\|\s*$/.test(L[i])) filas.push(L[i++]);
      i--; out.push(tabla(filas));
    } else if ((m = l.match(/^(\s*)(?:[-*+]|(\d+)\.)(?:\s+(.*))?$/))) {
      const tipo = m[2] ? 'ol' : 'ul', ck = (m[3] || '').match(/^\[([ xX])\]\s+(.*)/);
      if (lista !== tipo) { cierra(); out.push(`<${tipo}>`); lista = tipo; }
      const nivel = Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
      out.push(`<li${nivel ? ` style="margin-left:${nivel * 18}px"` : ''}${ck ? ` class="ck${ck[1] === ' ' ? '' : ' y'}"` : ''}>${inl(ck ? ck[2] : m[3] || '')}</li>`);
    } else {
      cierra();
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) out.push('<hr>');
      else if ((m = l.match(/^>\s?(.*)/))) out.push(`<blockquote>${inl(m[1])}</blockquote>`);
      else if (l.trim()) {
        const p = [l];
        while (i + 1 < L.length && L[i + 1].trim() && !BLOQUE.test(L[i + 1])) p.push(L[++i]);
        out.push(`<p>${p.map((x) => inl(x.trim()) + (/\S {2,}$/.test(x) ? '<br>' : ' ')).join('').trim()}</p>`); // «  » al final = salto de línea
      }
    }
  }
  cierra();
  return out.join('');
}

// Columna izquierda: las notas por carpetas o, al buscar, los resultados con su trozo de texto
function buscar(q) {
  const t = sinAcentos(q.trim());
  return bi.data.notas.map((n) => [sinAcentos(n.titulo).includes(t) ? 3 : sinAcentos(n.ruta).includes(t) ? 2 : sinAcentos(n.texto).includes(t) ? 1 : 0, n])
    .filter(([s]) => s).sort((a, b) => b[0] - a[0]).map(([, n]) => n);
}
// el texto sin marcas de Markdown, para los trozos de los resultados
const plano = (t) => partes(t).cuerpo.replace(/\[\[(?:[^\]|]*\/)?([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, b, a) => a || b.replace(/-/g, ' '))
  .replace(/[*#`>|]+|^\s*[-+] /gm, '').replace(/\s+/g, ' ');
function trozo(texto, q) {
  const k = sinAcentos(texto).indexOf(sinAcentos(q.trim()));
  if (k < 0) return '';
  const a = Math.max(0, k - 50), b = k + q.trim().length;
  return (a ? '…' : '') + esc(texto.slice(a, k)) + `<mark>${esc(texto.slice(k, b))}</mark>` + esc(texto.slice(b, b + 70)) + '…';
}
function itemNota(n, sub) {
  const { meta } = partes(n.texto);
  const est = meta.estado && (n.tipo === 'cliente' || n.tipo === 'objetivo') ? `<span class="pill ${tono(meta.estado)}">${esc(meta.estado)}</span>` : '';
  return `<button type="button" class="bi-it" data-nota="${esc(n.ruta)}"${n.ruta === bi.ruta ? ' aria-current="page"' : ''}><span>${esc(n.titulo)}</span>${est}${sub ? `<small>${sub}</small>` : ''}</button>`;
}
function renderLista() {
  const d = bi.data, box = $('#bi-lista');
  $('#bi').classList.toggle('buscando', !!bi.q.trim());
  if (bi.q.trim()) {
    const r = buscar(bi.q);
    box.innerHTML = r.length ? `<h3>${r.length} ${r.length === 1 ? 'nota' : 'notas'}</h3>` + r.map((n) => itemNota(n, trozo(plano(n.texto), bi.q) || esc(nombreCarpeta(carpetaDe(n.ruta))))).join('')
      : '<p class="quiet">Nada con esas palabras. Pruebe con otras o búsquelo en Obsidian.</p>';
    return;
  }
  const orden = (n) => (/README\.md$|index\.md$/.test(n.ruta) ? 0 : 1);
  box.innerHTML = CARPETAS.map(([c, nombre]) => {
    const notas = d.notas.filter((n) => carpetaDe(n.ruta) === c && !n.ruta.split('/').pop().startsWith('_')).sort((a, b) => orden(a) - orden(b) || a.titulo.localeCompare(b.titulo, 'es'));
    return notas.length ? `<h3>${esc(nombre)}</h3>` + notas.map((n) => itemNota(n)).join('') : '';
  }).join('');
}

// Lo que ha cambiado: una línea por guardado de git («Tomo archivó ayer…»), con sus notas para abrirlas
function cambioHtml(c) {
  const [q, verbo] = QUIEN[c.quien] || ['Alguien', 'cambió'];
  const que = c.quien === 'tomo' ? c.mensaje.replace(/^Archivar:?\s*/i, '') : c.quien === 'hud' ? c.mensaje.replace(/^HUD:\s*/, '') : c.quien === 'obsidian' ? '' : c.mensaje;
  const av = AG[c.quien] ? (([, , a, b, h]) => `<span class="av" data-ag="${c.quien}" style="--c:${a};--c2:${b};--h:${h}"></span>`)(AG[c.quien]) : `<span class="bi-ico">${c.quien === 'servidor' || c.quien === 'equipo' ? '⚙' : '✎'}</span>`;
  const notas = c.archivos.filter((a) => a !== 'index.md').slice(0, 4).map((a) => notaDe(a)).filter(Boolean);
  return `<li>${av}<div><p><b>${q} ${verbo}</b> <small>${diaHora(c.t)}</small></p>${que ? `<p class="bi-que">${esc(que)}</p>` : ''}
    ${notas.length ? `<p class="bi-chips">${notas.map((n) => `<button type="button" class="wl" data-nota="${esc(n.ruta)}">${esc(n.titulo)}</button>`).join('')}${c.archivos.length > notas.length + 1 ? `<small>y ${c.archivos.length - notas.length} más</small>` : ''}</p>` : ''}</div></li>`;
}
function renderPortada() {
  const d = bi.data;
  $('#bi-nota').innerHTML = `<div class="bi-cab"><span class="bi-ruta">La memoria del equipo</span><h1>Biblioteca</h1>
    <p class="note">Las mismas notas que abre en Obsidian: los agentes las leen antes de trabajar. Busque cualquier cosa en el buscador. Desde aquí puede cambiar un objetivo, la ficha de un cliente y su voz de LinkedIn; lo demás, en Obsidian.</p></div>
    <div class="bi-atajos">${[['negocio/clientes/README.md', 'Clientes', 'quién es quién y en qué punto está'], ['objetivos/README.md', 'Objetivos', 'lo que el equipo persigue'],
    ['negocio/linkedin/voice.md', 'Su voz de LinkedIn', 'cómo escribe Eco por usted'], ['senor.md', 'Su ficha', 'lo que el equipo sabe de usted']]
    .filter(([r]) => notaDe(r)).map(([r, t, s]) => `<button type="button" data-nota="${r}"><b>${t}</b><small>${s}</small></button>`).join('')}</div>
    <h2 class="bi-h">Qué ha cambiado</h2>
    <ul class="bi-cambios">${d.cambios.map(cambioHtml).join('') || '<li class="quiet">Sin cambios todavía.</li>'}</ul>`;
}
function renderNota() {
  $('#bi').classList.toggle('leyendo', !!bi.ruta);
  if (!bi.data) return;
  renderLista();
  const n = bi.ruta && notaDe(bi.ruta);
  if (!n) { bi.ruta = null; $('#bi').classList.remove('leyendo'); return renderPortada(); }
  const { meta, cuerpo } = partes(n.texto), [q, verbo] = QUIEN[n.quien] || [];
  const chips = Object.entries(meta).filter(([k, v]) => META[k] && v && !/^AAAA/.test(v))
    .map(([k, v]) => `<span class="pill ${k === 'estado' ? tono(v) : ''}">${META[k]}: ${esc(/^\d{4}-\d\d-\d\d$/.test(v) ? fmtDay(dateOf(v)) : v.replace(/ de la ventana de 5 horas por día/, ' al día'))}</span>`).join('');
  $('#bi-nota').innerHTML = `<div class="bi-cab">
      <button type="button" class="bi-volver" data-a="volver">‹ Biblioteca</button>
      <span class="bi-ruta">${esc(nombreCarpeta(carpetaDe(n.ruta)))}</span><h1>${esc(n.titulo)}</h1>
      ${n.t ? `<p class="note">${q} ${verbo} ${diaHora(n.t)}</p>` : ''}${chips ? `<p class="bi-chips">${chips}</p>` : ''}
      <div class="acts">${n.tipo && !bi.editando ? '<button type="button" class="si" data-a="editar">CAMBIAR</button>' : ''}<a class="act" href="${obsidian(n.ruta)}">ABRIR EN OBSIDIAN</a></div></div>
    ${bi.editando ? formulario(n) : `<div class="bi-md">${pagina(cuerpo.replace(/^\s*# .*\n/, ''))}</div>`}`;
}
function abrirNota(ruta) {
  bi.ruta = ruta; bi.editando = false;
  renderNota();
  $('#s-biblioteca').scrollTop = 0; $('#bi-nota').scrollTop = 0;
}

// ---------- Los tres formularios ----------
const opciones = (lista, actual) => lista.map((x) => `<option${x === actual ? ' selected' : ''}>${esc(x)}</option>`).join('');
const AVISO_FORM = '<p class="note">Solo cambia estos datos; el resto de la nota queda igual. Obsidian lo verá en la próxima sincronización (unos 15 minutos).</p>'
  + '<div class="acts"><button type="submit" class="si">GUARDAR</button><button type="button" data-a="cancelar">CANCELAR</button></div>';
// la voz de LinkedIn es la plantilla en inglés de las skills de Eco: se rotula en castellano
const VOZ_ES = {
  'Who I am': 'Quién soy', 'What I sound like': 'Cómo sueno', 'My positions': 'Mis posturas', 'Off limits': 'Prohibido', 'Proof I can use': 'Pruebas que puedo usar',
  Name: 'Nombre', 'What I do, in one sentence': 'Qué hago, en una frase', 'Who I am writing for': 'Para quién escribo', 'What I sell': 'Qué vendo',
  'Three of my own posts that sound most like me': 'Tres posts míos que suenan a mí', 'Words I actually use': 'Palabras que sí uso',
  'Words I would never use': 'Palabras que nunca usaría', 'Sentence length': 'Largo de las frases', 'Do I swear': '¿Digo tacos?', Emoji: 'Emojis',
  Contractions: 'Contracciones (en inglés)', 'Topics I do not post about': 'Temas de los que no publico',
  'Clients or numbers I cannot name publicly': 'Clientes o cifras que no puedo nombrar', 'Claims I am not allowed to make': 'Lo que no puedo afirmar',
};
const VOZ_PISTA = {
  'Who I am writing for': 'concreto: «dueños de pymes de Bizkaia», no «profesionales»', 'Three of my own posts that sound most like me': 'pegue o enlace tres',
  'Sentence length': 'cortas y directas / mezcla / largas', 'Do I swear': 'sí / poco / no', Emoji: 'nunca / uno, rara vez / libremente',
  Contractions: 'sí, casi siempre', 'Claims I am not allowed to make': 'sector regulado, empresa, confidencialidad',
  'My positions': 'de 3 a 5 cosas que cree y parte de su público no; una por línea', 'Proof I can use': 'cifras, resultados e historias reales; una por línea',
};
function vozSecciones(txt) {
  const secs = [];
  let cur = null;
  for (const l of txt.split('\n')) {
    let m;
    if ((m = l.match(/^## +(.+?)\s*$/))) secs.push(cur = { nombre: m[1], campos: [], lista: null });
    else if (cur && (m = l.match(/^- \*\*(.+?):\*\*(.*)$/))) { const v = m[2].trim(), pista = /^\(.*\)$/.test(v); cur.campos.push({ etiqueta: m[1], valor: pista ? '' : v }); }
    else if (cur && (m = l.match(/^(?:\d+\.|-)(?:\s+(.*))?$/))) { cur.lista ??= []; if (m[1]?.trim()) cur.lista.push(m[1].trim()); }
  }
  return secs.filter((s) => s.campos.length || s.lista);
}
function formulario(n) {
  const { meta } = partes(n.texto), d = bi.data;
  if (n.tipo === 'cliente') return `<form class="nuevo bi-form" data-tipo="cliente">
    <div class="row"><div><label for="bf-estado">Estado</label><select id="bf-estado" name="estado">${opciones(d.estados_cliente, meta.estado)}</select></div>
      <div><label for="bf-ult">Último contacto</label><input id="bf-ult" type="date" name="ultimo_contacto" value="${/^\d{4}-\d\d-\d\d$/.test(meta.ultimo_contacto || '') ? meta.ultimo_contacto : ''}"></div></div>
    <p class="note">Con «no interesado» o «no contactar», Jordan no le prepara más mensajes. Sin fecha = nunca.</p>
    <label for="bf-nota">Nota para el historial (opcional)</label>
    <textarea id="bf-nota" name="nota" rows="2" placeholder="Por ejemplo: me llamó y prefiere que no le escribamos"></textarea>${AVISO_FORM}</form>`;
  if (n.tipo === 'objetivo') {
    const hitos = [...n.texto.matchAll(/^\s*[-*] \[([ xX])\] (.+)$/gm)].map(([, x, t]) => ({ hecho: x !== ' ', texto: t.trim() }));
    const cupo = +(meta.cupo_maximo || '').match(/\d+/)?.[0] || 30;
    const sig = (n.texto.split(/^## +Siguiente paso\s*$/m)[1] || '').split(/^## /m)[0].trim();
    return `<form class="nuevo bi-form" data-tipo="objetivo">
    <div class="row"><div><label for="bf-estado">Estado</label><select id="bf-estado" name="estado">${opciones(d.estados_objetivo, meta.estado || 'activo')}</select></div>
      <div><label for="bf-plazo">Plazo</label><input id="bf-plazo" type="date" name="fecha_limite" value="${/^\d{4}-\d\d-\d\d$/.test(meta.fecha_limite || '') ? meta.fecha_limite : ''}"></div>
      <div><label for="bf-cupo">Cupo por día</label><select id="bf-cupo" name="cupo">${[10, 20, 30, 50].map((x) => `<option value="${x}"${x === cupo ? ' selected' : ''}>${x} %</option>`).join('')}</select></div></div>
    <label>Hitos <span class="quiet">(marque los hechos; borre el texto para quitar uno)</span></label>
    <div class="bf-hitos">${hitos.map((h, i) => `<div class="bf-hito"><input type="checkbox" aria-label="Hecho" ${h.hecho ? 'checked' : ''}><input type="text" value="${esc(h.texto)}" aria-label="Hito ${i + 1}"></div>`).join('')}
      <div class="bf-hito"><input type="checkbox" aria-label="Hecho"><input type="text" placeholder="＋ Nuevo hito" aria-label="Nuevo hito"></div></div>
    <label for="bf-sig">Siguiente paso</label><textarea id="bf-sig" name="siguiente" rows="2">${esc(sig)}</textarea>
    <p class="note">Harvey lo verá apuntado en el diario del objetivo en la próxima reunión de dirección.</p>${AVISO_FORM}</form>`;
  }
  return `<form class="nuevo bi-form" data-tipo="voz">${vozSecciones(n.texto).map((s) => `<fieldset><legend>${esc(VOZ_ES[s.nombre] || s.nombre)}</legend>
    ${s.campos.map((c) => `<label>${esc(VOZ_ES[c.etiqueta] || c.etiqueta)}<input type="text" data-campo="${esc(c.etiqueta)}" value="${esc(c.valor)}" placeholder="${esc(VOZ_PISTA[c.etiqueta] || '')}"></label>`).join('')}
    ${!s.campos.length ? `<textarea data-lista="${esc(s.nombre)}" rows="4" placeholder="${esc(VOZ_PISTA[s.nombre] || 'una por línea')}">${esc(s.lista.join('\n'))}</textarea>` : ''}</fieldset>`).join('')}
    <p class="note">Eco lee esta nota antes de escribir cualquier post. Puede escribir en castellano.</p>${AVISO_FORM}</form>`;
}
function camposDe(f) {
  const v = (k) => f.elements[k]?.value ?? '';
  if (f.dataset.tipo === 'cliente') return { estado: v('estado'), ultimo_contacto: v('ultimo_contacto'), nota: v('nota') };
  if (f.dataset.tipo === 'objetivo') {
    const c = { siguiente: v('siguiente'), hitos: $$('.bf-hito').map((h) => ({ hecho: h.children[0].checked, texto: h.children[1].value })).filter((h) => h.texto.trim()) };
    // solo lo que el señor ha tocado (una ficha sin «cupo_maximo» no lo gana por guardar)
    if (!f.elements.estado.selectedOptions[0].defaultSelected) c.estado = v('estado');
    if (!f.elements.cupo.selectedOptions[0].defaultSelected) c.cupo_maximo = `${v('cupo')} % de la ventana de 5 horas por día`;
    if (v('fecha_limite')) c.fecha_limite = v('fecha_limite');
    return c;
  }
  return { campos: Object.fromEntries([...f.querySelectorAll('[data-campo]')].map((i) => [i.dataset.campo, i.value])),
    listas: Object.fromEntries([...f.querySelectorAll('[data-lista]')].map((t) => [t.dataset.lista, t.value.split('\n')])) };
}
async function guardarNota(f) {
  const n = notaDe(bi.ruta), boton = f.querySelector('[type=submit]');
  boton.disabled = true; boton.textContent = 'GUARDANDO…';
  try {
    const r = await api('biblioteca', { ruta: n.ruta, base: n.base, campos: camposDe(f) });
    bi.editando = false;
    if (!r.cambios.length) { aviso('No había nada que cambiar.'); return renderNota(); }
    Object.assign(n, { texto: r.texto, base: r.base, t: Date.now() / 1000, quien: 'hud' });
    bi.data.cambios.unshift({ t: n.t, quien: 'hud', mensaje: 'HUD: ' + r.cambios.join('; '), archivos: [n.ruta] });
    renderNota();
    toast({ title: 'Guardado en la biblioteca', text: r.cambios.join(' · '), sub: r.subida ? '' : 'Se subirá a GitHub en la próxima sincronización.', ttl: 6000 });
  } catch (e) {
    aviso(e.message, true);
    boton.disabled = false; boton.textContent = 'GUARDAR';
    if (/ha cambiado/.test(e.message)) refreshBiblioteca(true);
  }
}

async function refreshBiblioteca(forzar) {
  if (!forzar && Date.now() - bi.at < 60_000) return;
  try {
    bi.data = await api('biblioteca'); bi.at = Date.now();
    if (!bi.editando) renderNota(); else renderLista();
  } catch (e) { if (!bi.data) $('#bi-nota').innerHTML = `<p class="quiet">No llega la biblioteca: ${esc(e.message)}</p>`; }
}
$('#bi-q').addEventListener('input', (e) => { bi.q = e.target.value; if (bi.data) renderLista(); });
$('#bi-q').addEventListener('keydown', (e) => { if (e.key === 'Enter' && bi.q.trim() && bi.data) { const r = buscar(bi.q)[0]; if (r) abrirNota(r.ruta); } });
$('#bi').addEventListener('click', (e) => {
  const a = e.target.closest('[data-a]')?.dataset.a, nota = e.target.closest('[data-nota]');
  if (nota) return abrirNota(nota.dataset.nota);
  if (a === 'volver') { bi.ruta = null; bi.editando = false; renderNota(); }
  if (a === 'editar') { bi.editando = true; renderNota(); $('.bi-form input, .bi-form select')?.focus(); }
  if (a === 'cancelar') { bi.editando = false; renderNota(); }
});
$('#bi').addEventListener('submit', (e) => { e.preventDefault(); guardarNota(e.target); });

// ---------- Sistema: servidor y cupos (de la foto, snapshot.py) y, de vps/sistema.py, el gasto por agente y por objetivo,
// Claude Code, las tareas automáticas y el historial de avisos. Se refresca cada minuto mientras se mira. ----------
const tk = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n || 0));
const usd = (x) => (x >= 0.005 ? x.toFixed(2).replace('.', ',') + ' $' : '');
const TAREAS = {
  'Equipo de Harvey · Reunión de dirección': 'Harvey repasa los objetivos y reparte trabajo; solo le despierta si hay cambios',
  'Equipo de Harvey': 'le avisa cuando el equipo termina un encargo o le espera', Biblioteca: 'sincroniza la wiki con GitHub y Obsidian',
  'Cupo de ChatGPT': 'vigila el cupo y echa el freno si se acaba', Cartero: 'mira el correo y le avisa de lo importante',
  Contexto: 'refresca lo que Harvey sabe de su día', 'Pensamientos de Harvey': 'Harvey le dice algo por iniciativa propia',
  'Informe matutino': 'el parte de las 8', 'Hábitos 22:00': 'le recuerda los hábitos sin marcar', 'Copia de seguridad semanal': 'guarda una copia de Harvey',
  'Parte semanal de consumo': 'resumen de lo gastado en la semana', 'Vigía de convocatorias': 'busca ayudas y convocatorias nuevas',
  'Revisión semanal': 'Harvey repasa la semana con usted', 'Aviso vencimiento VPS': 'le recuerda renovar el servidor',
};
const PRIMERO = ['Equipo de Harvey · Reunión de dirección', 'Equipo de Harvey', 'Biblioteca', 'Cupo de ChatGPT'];
const AVISO_TIPO = { correo: ['correo', ''], habitos: ['hábitos', 'warn'], pensamiento: ['Harvey', 'ok'], seguimiento: ['seguimiento', 'ok'],
  recordatorio: ['recordatorio', 'warn'], cupo: ['cupo', 'bad'], equipo: ['equipo', 'ok'] };
const syAbiertos = new Set();
const isoAgo = (iso) => (iso ? ago(new Date(iso) / 1000) : 'nunca');
function filaGasto(cara, nombre, frac, txt, sub) {
  return `<li>${cara}<div><p><b>${esc(nombre)}</b><span>${txt}</span></p><div class="bar"><i style="width:${Math.max(frac ? 1.5 : 0, frac * 100)}%"></i></div>${sub ? `<small>${sub}</small>` : ''}</div></li>`;
}
function renderSistema(d) {
  const no = (b, el) => { if (!b?.ok) $(el).innerHTML = `<li class="quiet">Sin datos${b?.error ? ': ' + esc(b.error) : ''}</li>`; return !b?.ok; };
  if (!no(d.agentes, '#sy-agentes')) {
    const a = d.agentes.data, max = Math.max(1, ...a.map((x) => x.semana));
    $('#sy-ag-total').textContent = tk(a.reduce((s, x) => s + x.semana, 0)) + ' en 7 días';
    $('#sy-agentes').innerHTML = a.map((x) => {
      const [nm, oficio, c, c2, h] = AG[x.agente] || [x.agente, '', '#26394B', '#1A2836', '#111'];
      const dinero = [usd(x.hoy_usd) && 'hoy ' + usd(x.hoy_usd), usd(x.semana_usd) && '7 días ' + usd(x.semana_usd)].filter(Boolean).join(' · ');
      return filaGasto(`<span class="av" data-ag="${esc(x.agente)}" style="--c:${c};--c2:${c2};--h:${h}"></span>`, nm, x.semana / max,
        `hoy ${tk(x.hoy)} · 7 días ${tk(x.semana)}`, `${esc(oficio)} · ${x.sesiones_semana} ${x.sesiones_semana === 1 ? 'sesión' : 'sesiones'}${dinero ? ' · <em>' + dinero + '</em>' : ''}`);
    }).join('');
  }
  if (!no(d.objetivos, '#sy-objetivos')) {
    const o = d.objetivos.data, max = Math.max(1, ...o.map((x) => x.tokens_hoy));
    $('#sy-obj-total').textContent = o.length ? tk(o.reduce((s, x) => s + x.tokens_hoy, 0)) + ' hoy' : '';
    $('#sy-objetivos').innerHTML = o.length ? o.map((x) => filaGasto(`<span class="sem ${x.semaforo}"></span>`, x.titulo, x.tokens_hoy / max, tk(x.tokens_hoy) + ' tokens',
      `${x.estado}${x.cupo_maximo ? ' · tope ' + esc(x.cupo_maximo.replace(/ de la ventana de 5 horas por día/, ' al día')) : ''} · ${x.tarjetas} ${x.tarjetas === 1 ? 'tarjeta' : 'tarjetas'}`)).join('')
      : '<li class="quiet">Aún no hay objetivos. Cuando le dé uno a Harvey, aquí verá lo que gasta cada día frente a su tope.</li>';
  }
  if (d.claude?.ok) {
    const c = d.claude.data;
    $('#sy-claude').innerHTML = `<div class="stats dos"><div><b>${tk(c.hoy)}</b><span>tokens hoy</span></div><div><b>${tk(c.semana)}</b><span>en 7 días · ${c.sesiones_semana} ${c.sesiones_semana === 1 ? 'sesión' : 'sesiones'}</span></div></div>
      <p class="note">Va con su plan de Claude. El porcentaje que le queda del plan solo se ve en claude.ai.</p>`;
  }
  if (!no(d.tareas, '#sy-tareas')) {
    const t = [...d.tareas.data].sort((a, b) => ((PRIMERO.indexOf(a.nombre) + 1 || 99) - (PRIMERO.indexOf(b.nombre) + 1 || 99)) || String(a.siguiente).localeCompare(String(b.siguiente)));
    const mal = t.filter((x) => x.estado && x.estado !== 'ok').length;
    $('#sy-tareas-n').textContent = mal ? `${mal} con fallos` : `${t.length} en marcha`;
    $('#sy-tareas-n').classList.toggle('mal', !!mal);
    $('#sy-tareas').innerHTML = t.map((x) => {
      const est = !x.ultima ? 'nunca' : x.estado === 'ok' ? 'ok' : 'mal';
      const reunion = x.nombre.endsWith('Reunión de dirección') ? ` · despertó a Harvey ${x.desperto ? isoAgo(x.desperto) : 'aún no'}` : '';
      return `<li class="${est}" title="${esc(x.error || '')}"><i></i><div><p><b>${esc(x.nombre)}</b><span>${esc(x.cuando)}</span></p>
        ${TAREAS[x.nombre] ? `<small class="d">${esc(TAREAS[x.nombre])}</small>` : ''}
        <small>última ${x.ultima ? isoAgo(x.ultima) : '—'}${est === 'mal' ? ` · <em>falló${x.fallos > 1 ? ` ${x.fallos} veces seguidas` : ''}</em>` : ''}${reunion}${x.siguiente ? ' · próxima ' + hora(x.siguiente) : ''}</small></div></li>`;
    }).join('') || '<li class="quiet">No hay tareas automáticas.</li>';
  }
  if (!no(d.avisos, '#sy-avisos')) {
    const a = d.avisos.data;
    $('#sy-avisos-n').textContent = a.length || '';
    $('#sy-avisos').innerHTML = a.map((x) => {
      const [et, tono] = AVISO_TIPO[x.tipo] || [x.tipo, ''], id = x.t + x.nombre, txt = x.texto.replace(/^📬\s*Correo importante\s*/i, '');
      return `<li><details data-id="${esc(id)}" ${syAbiertos.has(id) ? 'open' : ''}><summary><span class="pill ${tono}">${esc(et)}</span><span class="t">${esc(txt.split('\n')[0])}</span><small>${diaHora(x.t)}</small></summary>
        <p>${md(txt)}</p></details></li>`;
    }).join('') || '<li class="quiet">Ningún aviso esta semana.</li>';
  }
}
let syAt = 0, syBusy = false;
async function refreshSistema(forzar) {
  if (syBusy || (!forzar && Date.now() - syAt < 30_000)) return;
  syBusy = true;
  try { renderSistema(await api('sistema')); syAt = Date.now(); }
  catch (e) { $('#sy-tareas').innerHTML = `<li class="quiet">No llegan los datos: ${esc(e.message)}</li>`; }
  finally { syBusy = false; }
}
setInterval(() => { if (document.body.dataset.screen === 'sistema' && document.visibilityState === 'visible') refreshSistema(true); }, 60_000);
$('#sy-avisos').addEventListener('toggle', (e) => { const id = e.target.dataset?.id; if (id) e.target.open ? syAbiertos.add(id) : syAbiertos.delete(id); }, true);

const meter = (label, frac, txt, sub = '') => {
  const lvl = frac > 0.85 ? 'bad' : frac > 0.65 ? 'warn' : '';
  return `<div class="meter ${lvl}"><div class="mh"><span>${label}</span><b>${txt}</b></div><div class="bar"><i style="width:${Math.max(1.5, Math.min(1, frac) * 100)}%"></i></div>${sub ? `<small>${sub}</small>` : ''}</div>`;
};
function renderSystem(s, h) {
  const cpu = s.load[0] / s.cpus, mem = s.mem_used / s.mem_total, disk = s.disk_total ? s.disk_used / s.disk_total : 0;
  $('#meters').innerHTML = meter('Procesador', cpu, Math.round(cpu * 100) + ' %') + meter('Memoria', mem, `${(s.mem_used / 2 ** 30).toFixed(1)} de ${(s.mem_total / 2 ** 30).toFixed(0)} GB`)
    + meter('Disco', disk, Math.round(disk * 100) + ' %');
  if (h?.hoy) {
    const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : n);
    $('#today').innerHTML = [['charlas hoy', h.hoy.sesiones], ['acciones', h.hoy.herramientas], ['tokens', k(h.hoy.tokens || 0)], ['coste', (h.hoy.coste || 0).toFixed(2) + ' $']]
      .map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  }
}
const hora = (iso) => { const d = new Date(iso); return (isToday(d) ? 'hoy' : fmtDay(d)) + ' a las ' + fmtTime(d); };
function renderCupo(c) {
  const v = c.ventanas || [], ses = v.find((x) => x.label === 'Session'), sem = v.find((x) => x.label === 'Weekly');
  const queda = (x) => Math.max(0, Math.round(100 - (x?.used_percent || 0)));
  const el = $('#cupo');
  if (!ses) return;
  const q = queda(ses);
  el.className = 'cupo' + (c.freno || q <= 10 ? ' bad' : q <= 25 ? ' warn' : '');
  el.firstChild.textContent = c.freno ? 'freno de cupo' : `cupo ${q} %`;
  el.querySelector('i').style.width = q + '%';
  el.title = `Cupo de ChatGPT · ventana de 5 horas: queda el ${q} % (se renueva ${hora(ses.resets_at)})` + (sem ? ` · semanal: queda el ${queda(sem)} %` : '')
    + (c.freno ? ' · el freno tiene al equipo en pausa hasta que se renueve' : '');
  $('#cupo-plan').textContent = c.freno ? 'freno echado' : '';
  $('#sy-freno').className = 'sy-freno' + (c.freno ? ' on' : '');
  $('#sy-freno').innerHTML = c.freno ? '<b>Freno de cupo echado</b>: el equipo está en pausa hasta que se renueve la ventana.'
    : '<b>Freno de cupo suelto</b>: si queda un 10 % o menos, el equipo se para solo hasta que se renueve.';
  $('#cupo-meters').innerHTML = v.map((x) => meter(x.label === 'Session' ? 'Ventana de 5 horas' : x.label === 'Weekly' ? 'Semanal' : x.label,
    (x.used_percent || 0) / 100, `queda ${queda(x)} %`, 'se renueva ' + hora(x.resets_at))).join('');
}
const SRC = { telegram: 'Telegram', api_server: 'HUD o móvil', oneshot: 'Tarea', cron: 'Programada', cli: 'Consola' };
let lastHarvey = null;
function renderOps() {
  const h = lastHarvey; if (!h) return;
  const subs = h.delegaciones.filter((d) => !d.end).map((d) => `<li class="hoy"><span class="t">Subagente · ${esc(d.goal || 'tarea delegada')}</span><span class="k">${ago(d.start)}</span><span class="s">${esc(d.state)}</span></li>`);
  const ses = h.sesiones.filter((s) => s.title).slice(0, 8).map((s) => `<li><span class="t">${esc(s.title)}</span><span class="k">${s.last_activity_at ? ago(s.last_activity_at) : ''}</span><span class="s">${SRC[s.source] || esc(s.source)} · ${s.tool_call_count} acciones</span></li>`);
  $('#ops').innerHTML = [...subs, ...ses].join('') || '<li class="empty">Sin conversaciones recientes</li>';
}
const ccOpen = new Set(); // sesiones desplegadas: se conservan entre refrescos
const dur = (a, b) => { const s = Math.max(0, (new Date(b) - new Date(a)) / 1000); return s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`; };
function renderClaude(list) {
  $('#cc-count').textContent = list.some((c) => c.en_curso) ? 'trabajando' : list.length || '';
  $('#cc').innerHTML = list.length ? list.map((c) => `
    <details class="ccs ${c.en_curso ? 'run' : 'done'}" data-id="${esc(c.id)}" ${ccOpen.has(c.id) ? 'open' : ''}>
      <summary><span>${esc(c.titulo)}<small>${esc(c.proyecto)} · ${c.herramientas} acciones · ${dur(c.inicio, c.fin)}${c.en_curso ? ' · trabajando' : ''}</small></span><small>${c.fin ? ago(new Date(c.fin) / 1000) : ''}</small></summary>
      <div class="body"><h4>ENCARGO</h4><p>${esc(c.encargo)}</p>${c.resultado ? `<h4>${c.en_curso ? 'ÚLTIMO MENSAJE' : 'RESULTADO'}</h4><p>${esc(c.resultado)}</p>` : ''}
        ${c.archivos?.length ? `<h4>ARCHIVOS (${c.archivos.length})</h4><p>${c.archivos.map(esc).join(' · ')}</p>` : ''}</div>
    </details>`).join('') : '<p class="quiet">Harvey aún no ha delegado nada en Claude Code.</p>';
}
$('#cc').addEventListener('toggle', (e) => { const id = e.target.dataset?.id; if (id) e.target.open ? ccOpen.add(id) : ccOpen.delete(id); }, true);

// ---------- Datos: la foto del servidor (snapshot.py), cada minuto ----------
let snapAt = 0, snapBusy = false;
async function refresh() {
  refreshAprobaciones();
  if (snapBusy) return lastSnap || {};
  snapBusy = true;
  try {
    const s = await api('snapshot');
    snapAt = Date.now(); lastSnap = s;
    const ok = (b) => b?.ok;
    link('datos', ok(s.notion) && ok(s.gmail) && ok(s.calendar) ? 'on' : ok(s.system) ? 'warn' : 'off');
    for (const [id, b] of [['#p-agenda', s.calendar], ['#p-correo', s.gmail], ['#p-tareas', s.notion], ['#p-habitos', s.habitos], ['#p-equipo', s.equipo]]) $(id).classList.toggle('nosignal', !ok(b));
    if (ok(s.calendar)) renderAgenda(s.calendar.data);
    if (ok(s.notion)) renderTareas(s.notion.data.tareas);
    if (ok(s.gmail)) renderMail(s.gmail.data);
    if (ok(s.habitos) && !habPending) renderHabits(s.habitos.data);
    if (ok(s.equipo)) renderEquipo(s.equipo.data);
    if (ok(s.cupo)) renderCupo(s.cupo.data);
    if (ok(s.system)) renderSystem(s.system.data, s.harvey?.data);
    if (ok(s.harvey)) { lastHarvey = s.harvey.data; renderOps(); if (PC) adoptWakes(s.harvey.data.despertares); }
    if (ok(s.claude)) renderClaude(s.claude.data);
    renderParte();
    if (PC) proactive(s);
    return s;
  } catch (e) {
    link('datos', 'off');
    if (!PC && !/sesión/.test(e.message)) aviso('No llegan los datos: ' + e.message, true);
    return {};
  } finally { snapBusy = false; }
}
setInterval(() => { if (PC || document.visibilityState === 'visible') refresh(); }, 60_000);

// ---------- Avisos por iniciativa propia (PC; en el iPhone llegan por push) ----------
// Correos nuevos, citas a punto de empezar, tareas de hoy y lo que Harvey dice solo (pensamientos, recordatorios, el
// Cartero, el equipo). De 22:00 a 8:00 solo avisos visuales (salvo recordatorios); nunca interrumpe una orden.
const notified = { mails: null, avisos: null, events: new Set() };
// tipo de aviso → [título, resaltado, frase guardada para el modo «solo frases»]
const AVISO = {
  pensamiento: ['Harvey sugiere', false, 'pensamiento'], seguimiento: ['Harvey pregunta', false, 'pensamiento'],
  recordatorio: ['Recordatorio', true, 'recordatorio'], correo: ['Correo importante', true, 'correo_importante'],
  cupo: ['Cupo de ChatGPT', true, 'recordatorio'], equipo: ['Equipo de Harvey', true, 'recordatorio'],
};
function proactive(s) {
  const voiceKinds = [];
  // el primer vistazo solo memoriza; luego, aviso discreto (sin voz) por correo relevante que el Cartero no silencie
  if (s.gmail?.ok) {
    const mails = s.gmail.data, fresh = notified.mails ? mails.filter((m) => !notified.mails.has(m.id) && m.important && m.avisar !== false) : [];
    notified.mails = new Set([...(notified.mails || []), ...mails.map((m) => m.id)]);
    for (const m of fresh.slice(0, 3)) toast({ title: 'Correo nuevo', text: m.subject, sub: m.from,
      actions: [{ label: 'QUE HARVEY LO RESUMA', run: () => ask(`Resúmeme el correo de ${m.from} con asunto "${m.subject}"`) }] });
  }
  if (s.calendar?.ok) {
    for (const e of s.calendar.data) {
      const start = new Date(evStart(e)), mins = (start - Date.now()) / 60000, key = e.title + evStart(e);
      if (!evStart(e).includes('T') || mins <= 0 || mins > 15 || notified.events.has(key)) continue;
      notified.events.add(key);
      toast({ title: `En ${Math.round(mins)} minutos`, text: e.title, sub: e.location || fmtTime(evStart(e)), warn: true, ttl: 60000 });
      voiceKinds.push(['reunion_pronto', `En ${Math.round(mins)} minutos empieza «${e.title}»`]);
    }
  }
  // una vez al día (desde las 8:00): tareas que vencen hoy o atrasadas
  if (s.notion?.ok && !quietHours() && load('avisos.' + dayKey(), false) === false) {
    save('avisos.' + dayKey(), true);
    const due = s.notion.data.tareas.filter((t) => t.fecha && t.fecha.slice(0, 10) <= dayKey());
    if (due.length) {
      toast({ title: due.length === 1 ? 'Tarea para hoy' : `${due.length} tareas para hoy`, text: due.map((t) => t.title).join(' · '), ttl: 30000,
        actions: [{ label: 'ORGANIZAR EL DÍA', run: () => ask('Ayúdame a organizar las tareas que vencen hoy.') }] });
      voiceKinds.push(['tareas_hoy', 'Tareas que vencen hoy: ' + due.map((t) => t.title).join(', ')]);
    }
  }
  // lo que Harvey dice sin que se le pregunte (vps/vivo.py), una vez cada uno; al abrir solo memoriza
  if (s.avisos?.ok) {
    const fresh = notified.avisos ? s.avisos.data.filter((a) => !notified.avisos.has(a.id)) : [];
    notified.avisos = new Set([...(notified.avisos || []), ...s.avisos.data.map((a) => a.id)]);
    for (const a of fresh) {
      a.texto = a.texto.replace(/^📬\s*Correo importante\s*/i, '');
      const [title, warn] = AVISO[a.tipo] || AVISO.pensamiento;
      if (a.tipo === 'equipo') push({ who: 'harvey', text: a.texto }); // la entrega del equipo queda en la conversación (con su enlace)
      toast({ title, text: a.texto, warn, ttl: 180000,
        actions: a.texto.trim().endsWith('?') ? [{ label: 'SÍ, ADELANTE', run: () => ask('Sí, adelante.') }, { label: 'NO, GRACIAS', run: () => ask('No, gracias.') }] : [] });
    }
    // los recordatorios suenan también de noche: los pidió el señor para esa hora
    const last = fresh.at(-1);
    if (last && (!quietHours() || last.tipo === 'recordatorio') && !live && state === 'idle') {
      if (voiceMode === 'full') speak((last.tipo === 'correo' ? 'Correo importante. ' : '') + last.texto); else phrase(AVISO[last.tipo]?.[2] || 'pensamiento');
      // tras un aviso le escucha 3 s (8 si pregunta) por si contesta; si contesta, empieza una conversación
      if (voiceMode !== 'off') listenAfterSpeech(last.texto.trim().endsWith('?') ? 8000 : 3000, last.texto);
      return;
    }
  }
  // como mucho una frase por ronda, nunca en horas de silencio ni con una orden en marcha
  if (voiceKinds.length && !quietHours() && !live && state === 'idle') {
    const [kind, ctx] = voiceKinds[0];
    phrase(kind);
    if (voiceMode !== 'off') listenAfterSpeech(3000, ctx);
  }
}

// ---------- Modo conversación del PC: tecla º (aunque el HUD esté detrás), clic en el núcleo o «Oye Harvey, hablemos» ----------
// Tras cada respuesta vuelve a escuchar sin «Oye Harvey». Termina con º, despidiéndose, cuando Harvey la cierra ([FIN])
// o tras 10 s sin que el señor diga nada.
function startConvo(silent) {
  if (convo) return;
  convo = true; document.body.classList.add('en-convo');
  setState(state);
  if (!silent && !live) listenAfterSpeech(10_000);
}
function endConvo(despedida) {
  if (!convo) return;
  convo = false; document.body.classList.remove('en-convo');
  next = null; ear.stop();
  setState(state);
  if (despedida) phrase('fin_conversacion', { show: hint });
}
// con «en vivo» encendido (vivo.js), º abre y cierra la conversación con Gemini Live
const toggleConvo = () => (Vivo.activo || Vivo.abierto ? Vivo.alternar() : convo ? endConvo(false) : startConvo());

// ---------- Oído del PC: «Oye Harvey» + conversación (Web Speech API de Edge) ----------
const ear = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  // sin tildes y en minúsculas, conservando posiciones para recortar el texto original
  const fold = (s) => [...s].map((c) => c.normalize('NFD')[0].toLowerCase()).join('');
  // el reconocedor en español escribe «Harvey» de muchas formas
  const WAKE = /(?:^|\s)(?:oye|oie|olle|hoye|hey|ey)[\s,.:]+(?:harvey|harvy|harvi|harvie|harvei|harbi|harbey|jarvi|jarvy|jarvis|jarbi|jarvey|arvi|arbi|garvi)(?![a-z])[\s,.:;!?¡¿]*/;
  let rec, running = false, enabled = load('oido', true), muted = false, deafUntil = 0;
  let cap = null; // orden que se está capturando: { src: 'wake'|'follow', finals, interim, timer, aviso }
  // despedidas que cierran la conversación (dichas solas; «gracias, ¿y mañana?» no cierra)
  const BYE = /^(?:muchas gracias|gracias|eso es todo|nada mas|ya esta|hasta luego|adios|terminamos|termina|vale gracias|perfecto gracias|ok gracias)$/;
  let lastSent = { text: '', at: 0 };
  const afterWake = (t) => { const chars = [...t], m = fold(t).match(WAKE); return m ? chars.slice(m.index + m[0].length).join('') : null; };
  const text = () => `${cap.finals} ${cap.interim}`.replace(/\s+/g, ' ').trim();

  function start() {
    if (!PC || !SR || running || muted || !(enabled || convo)) return;
    rec = new SR();
    rec.lang = 'es-ES'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) heard(e.results[i][0].transcript, e.results[i].isFinal); };
    rec.onend = () => { running = false; setTimeout(start, 250); };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { enabled = false; paint(); link('oido', 'off'); } };
    try { rec.start(); running = true; } catch {}
  }
  // ms: tiempo para empezar a hablar (7 s tras «Oye Harvey»; sin «Oye Harvey», el que diga quien escucha)
  function begin(src, ms = 7000) {
    clearTimeout(cap?.timer);
    cap = { src, finals: '', interim: '', timer: null, aviso: null };
    setState('listening'); micLevel(true);
    chime(); arm(ms);
  }
  function arm(ms) { clearTimeout(cap.timer); cap.timer = setTimeout(submit, ms); }
  function cancel() { clearTimeout(cap?.timer); cap = null; micLevel(false); if (state === 'listening') setState('idle'); }
  function submit() {
    if (!cap) return;
    const t = text(), { src, aviso } = cap;
    cancel();
    if (t.length < 2) { if (convo && src === 'follow') endConvo(true); return; } // silencio: se cierra la conversación
    // las órdenes de control se comparan sin tildes ni signos, y casi siempre la frase entera
    const f = fold(t).replace(/[^a-z0-9 ]/g, ' ').replace(/\bharvey\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (live?.approval && /^(si|aprueba|apruebalo|aprobado|adelante|vale|hazlo|de acuerdo|ok|okey)\b/.test(f)) return resolveApproval('once');
    if (live?.approval && /^(no|rechaza|rechazalo|deniega)\b/.test(f)) return resolveApproval('deny');
    if (/^(hablemos|vamos a hablar|conversemos|modo conversacion)\b/.test(f)) return startConvo();
    if (BYE.test(f)) return convo ? endConvo(true) : phrase('fin_conversacion');
    if (/^(nueva conversacion|nuevo chat|empecemos de nuevo|borra(r)? la conversacion)( por favor)?$/.test(f)) return newChat();
    if (/^(cancela|cancelalo|cancelar|para|parate|detente|deten|stop|olvidalo|calla|callate)( (eso|ya|ahora|por favor|para|stop|calla))*$/.test(f)) {
      stopSpeaking();
      if (live) cancelRun('Orden cancelada, señor.'); else if (convo) listenAfterSpeech(10_000);
      return;
    }
    if (t === lastSent.text && Date.now() - lastSent.at < 15000) return; // el reconocedor a veces repite el final
    lastSent = { text: t, at: Date.now() };
    if (aviso) { avisoCtx = aviso; startConvo(true); } // contestar a un aviso abre la conversación
    ask(t, { voz: true });
  }
  function heard(raw, final) {
    // anti-eco: nada de lo que se oiga mientras (o justo después de que) Harvey habla cuenta
    if (muted || Date.now() < deafUntil) return;
    const rest = afterWake(raw);
    if (!cap) {
      if (rest == null) return;
      begin('wake');
    }
    const piece = (rest ?? raw).trim();
    if (final) { cap.finals += ' ' + piece; cap.interim = ''; } else cap.interim = piece;
    if (text()) hint(`«${text()}»`);
    if (text()) arm(final ? 900 : 1600); // envía tras una pausa breve
  }
  // tecla º (Backquote en teclado español): abre o cierra la conversación. Con tecla-global.ps1 en marcha, Windows entrega
  // la º a ese programa y llega por /api/tecla aunque el HUD esté detrás.
  addEventListener('keydown', (e) => {
    if (!PC || e.code !== 'Backquote' || e.repeat || ['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName)) return;
    e.preventDefault(); toggleConvo();
  });
  function paint() {
    const b = $('.links [data-k="oido"]');
    link('oido', !SR ? 'off' : enabled ? 'on' : 'warn');
    b.title = !SR ? 'Este navegador no puede escuchar' : enabled ? 'Escucha «Oye Harvey» (toque para desactivarla)' : 'No escucha «Oye Harvey» (toque para activarla)';
  }
  $('.links [data-k="oido"]').addEventListener('click', () => {
    enabled = !enabled; save('oido', enabled); paint();
    if (enabled) start(); else { try { rec?.abort(); } catch {} }
  });
  paint();
  return {
    start,
    stop: cancel,
    // escucha sin «Oye Harvey» (ms para empezar a hablar); aviso: lo que Harvey acaba de decir, por si se le contesta
    follow(ms = 8000, aviso = null) { if (PC && SR && (enabled || convo) && !muted && !cap) { begin('follow', ms); cap.aviso = aviso; start(); } },
    mute(on) {
      muted = on;
      if (on) { if (cap) cancel(); try { rec?.abort(); } catch {} running = false; }
      else { deafUntil = Date.now() + 1200; start(); }
    },
  };
})();
// nivel del micrófono en el núcleo mientras escucha (PC)
let micAnalyser;
async function micLevel(on) {
  if (!on) { if (state !== 'speaking') Core.feed(null); return; }
  try {
    const ctx = audioCtx();
    if (!micAnalyser) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micAnalyser = ctx.createAnalyser(); micAnalyser.fftSize = 128;
      ctx.createMediaStreamSource(stream).connect(micAnalyser);
    }
    if (state === 'listening') Core.feed(micAnalyser);
  } catch {}
}

// ---------- iPhone: hoja «Más», avisos push, llave de Siri ----------
function openSheet() {
  $('#sheet').hidden = false;
  if ('PushManager' in window) navigator.serviceWorker?.ready.then((r) => r.pushManager.getSubscription()).then((s) => paintPush(!!s)).catch(() => {});
}
$('#voice-pill').addEventListener('click', openSheet);
$('#sheet').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) $('#sheet').hidden = true; });
const paintPush = (on) => { $('#push-on').textContent = on ? 'Avisos activados ✓ · probar' : 'Activar avisos'; };
$('#push-on').addEventListener('click', async () => {
  if (!('PushManager' in window) || !navigator.serviceWorker) return aviso('Para recibir avisos, abra Harvey desde su icono de la pantalla de inicio (iOS 16.4 o superior).');
  try {
    if (await Notification.requestPermission() !== 'granted') return aviso('Avisos bloqueados: actívelos en Ajustes › Notificaciones › Harvey.', true);
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api('push-key');
    const applicationServerKey = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    const r = await api('push-subscribe', sub.toJSON());
    aviso(r.ok ? 'Avisos activados: le llega uno de prueba.' : `Suscrito, pero el aviso de prueba falló (${r.code}).`);
    paintPush(true);
  } catch (e) { aviso('No se pudieron activar: ' + e.message, true); }
});
// llave del atajo de Siri al portapapeles (Safari exige pedirla dentro del mismo toque: ClipboardItem con promesa)
$('#siri-key').addEventListener('click', async () => {
  const text = fetch('/api/siri-token').then((r) => r.json()).then((j) => { if (!j.header) throw new Error(j.error || 'Sin llave'); return j.header; });
  try {
    if (window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })]);
    else await navigator.clipboard.writeText(await text);
    aviso('Llave copiada. Péguela en el atajo, en la cabecera Authorization.');
  } catch (e) { aviso(await text.then(() => 'No se pudo copiar: ' + e.message, (x) => x.message), true); }
});
// el servidor del VPS solo manda avisos push si la app no está a la vista
const tellVisible = () => { if (!PC) navigator.sendBeacon?.('/api/visible', JSON.stringify({ v: document.visibilityState === 'visible' })); };
document.addEventListener('visibilitychange', () => {
  tellVisible();
  if (document.visibilityState !== 'visible') return;
  if (live?.id && !live.es) recover();
  if (Date.now() - snapAt > 45_000) refresh();
});

// ---------- Acceso (solo el iPhone: contraseña una vez; el teléfono la recuerda un año) ----------
function showLogin() { $('#login').hidden = false; setTimeout(() => $('#password').focus(), 50); }
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    await api('login', { password: $('#password').value });
    location.reload(); // con la sesión ya abierta carga todo, también el arte de la Oficina (solo se sirve con sesión)
  } catch (err) { $('#login-error').textContent = err.message; }
});

// ---------- Arranque del PC: corto y con comprobaciones de verdad ----------
async function boot() {
  const box = $('#boot'), list = $('#boot-log');
  box.hidden = false;
  const step = async (txt, fn) => {
    const li = document.createElement('li'); li.textContent = txt; list.append(li);
    let ok = true; try { ok = (await fn()) !== false; } catch { ok = false; }
    li.className = ok ? 'ok' : 'warn';
    return ok;
  };
  const harveyOk = await step('Conectando con Harvey', async () => (await fetch('/api/health')).ok);
  link('harvey', harveyOk ? 'on' : 'off');
  let snap = {};
  await step('Trayendo agenda, correo y tareas', async () => { snap = await refresh(); return !!snap.notion?.ok; });
  await step('Preparando la voz y el oído', async () => { ear.start(); return !!(window.SpeechRecognition || window.webkitSpeechRecognition); });
  await sleep(350);
  box.classList.add('out'); setTimeout(() => { box.hidden = true; }, 500);
  if (live) return; // ya recogió una orden a medias o un turno del despertador: sin saludo que lo pise
  setState('idle');
  const mails = snap.gmail?.ok ? snap.gmail.data.length : 0;
  greet(mails ? ` Tiene ${mails} ${mails === 1 ? 'correo' : 'correos'} sin leer.` : '');
}

// Al abrir: si quedó una orden a medias (app cerrada o recargada mientras Harvey trabajaba), se recupera
let started = false;
function start() {
  if (started) return refresh(); // tras volver a entrar con la contraseña
  started = true;
  setState('idle');
  renderAll();
  const saved = load('run', null);
  if (saved?.id && chat[saved.idx]) {
    live = { ...saved, msg: chat[saved.idx], es: null, dicho: saved.dicho || 0, lastEvent: Date.now() };
    live.msg.text = saved.out || ''; render(live.msg);
    setBusy(true); setState('thinking'); recover();
  } else save('run', null);
  if (PC) {
    new EventSource('/api/tecla').onmessage = toggleConvo;
    return boot();
  }
  link('harvey', 'on');
  refresh(); tellVisible(); greet();
  // al tocar un aviso push la app se abre con ?tab=…, ?run=…&session=… o ?responder=<texto del aviso>
  const q = new URLSearchParams(location.search);
  if (location.search) history.replaceState(null, '', '/');
  if (ORDER.includes(q.get('tab'))) show(q.get('tab'));
  if (q.get('responder')) { // lista para contestar: el aviso en la conversación y el micro latiendo
    avisoCtx = q.get('responder');
    show('harvey'); push({ who: 'harvey', text: avisoCtx });
    document.body.classList.add('responder');
  }
  if (/^movil-/.test(q.get('session') || '')) adopt(q.get('run'), q.get('session'), /^movil-siri-/.test(q.get('session')) ? 'Orden por Siri' : 'Orden recuperada');
  navigator.serviceWorker?.register('sw.js').catch(() => {});
}

(async () => {
  let r;
  try { r = await fetch('/api/ping'); } catch { return aviso('Sin conexión con Harvey', true); }
  const j = r.ok ? await r.json().catch(() => ({})) : {}; // sin sesión (401) solo puede ser el iPhone
  PC = !!j.pc; PREFIX = PC ? 'hud-' : 'movil-'; Vivo.pintar();
  document.body.classList.add(PC ? 'pc' : 'movil');
  if (!PC) input.placeholder = 'Escriba a Harvey…';
  if (r.status === 401) return showLogin();
  start();
})();
