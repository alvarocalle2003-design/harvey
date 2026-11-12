// HUD de bolsillo: servidor de la app del iPhone. Vive DENTRO del contenedor de Harvey (servicio s6 «harvey-movil»),
// así habla con el API de Harvey en 127.0.0.1:8642 sin exponerlo. Traefik lo publica con HTTPS; aquí se pide contraseña.
// Sin dependencias: node /opt/data/hud/movil/server.mjs
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, createWriteStream, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { loadVapid, sendPush } from './push.mjs';
import { tts as voz, tipo, hablable, enviarEnDirecto, VOICE, MODEL } from './voz.mjs';

const PORT = +process.env.PORT || 7780, HARVEY = 'http://127.0.0.1:8642';
const PUBLIC = join(import.meta.dirname, 'public');
const UPLOADS = '/opt/data/workspace/hud';
const PY = '/opt/hermes/.venv/bin/python';
const ACK_DIR = join(import.meta.dirname, 'voz-cache');
mkdirSync(ACK_DIR, { recursive: true });

// Claves en el .env de Harvey: API_SERVER_KEY (ya existía) y HUD_MOVIL_PASSWORD (la pone el señor con clave-movil.ps1).
// Al guardar claves se reinicia el contenedor, y con él este servidor: basta leerlas al arrancar.
const env = Object.fromEntries(readFileSync('/opt/data/.env', 'utf8').split('\n')
  .map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim().replace(/^(['"])(.*)\1$/, '$2')]));
const PASSWORD = process.env.HUD_MOVIL_PASSWORD || env.HUD_MOVIL_PASSWORD || ''; // la variable de entorno solo sirve para pruebas
// La cookie es una firma de la contraseña: cambiar la contraseña cierra la sesión en todos los dispositivos
const TOKEN = PASSWORD && createHmac('sha256', PASSWORD).update('harvey-movil-v1').digest('hex');

const MOBILE_RULES = `Estás respondiendo al señor en la app de Harvey de su iPhone: tu respuesta se leerá ENTERA en voz alta con tu voz.
La app ya le ha confirmado que has recibido la orden: NO empieces con "Recibido" ni repitas la orden; ve directo al resultado.
Escribe para ser escuchado y dilo todo, sin recortar: frases naturales, sin markdown, viñetas, tablas, emojis ni símbolos.
Nunca metas enlaces ni direcciones de correo en las frases; si uno es útil, ponlo solo en la última línea (se ve en pantalla, no se lee).
Si necesitas que confirme algo (enviar un correo, crear un evento...), termina con una pregunta de sí o no: la app le mostrará botones.
Los archivos y fotos que adjunta desde el móvil están en ${UPLOADS}/; para imágenes usa vision_analyze con esa ruta.`;
const SIRI_RULES = `El señor te habla por Siri desde su iPhone, normalmente sin mirar ni tocar la pantalla (por ejemplo, conduciendo).
Tu respuesta sonará ENTERA en voz alta con tu voz: dilo todo, pero hablado, en frases naturales, sin markdown, listas, tablas,
enlaces, direcciones de correo, emojis ni símbolos. No empieces con "Recibido" ni repitas la orden.
La conversación sigue: tras tu respuesta él puede volver a hablarte. Si algo necesita su confirmación (enviar un correo,
crear un evento...), no lo hagas aún: pregúntaselo y él te contestará en el siguiente turno.`;
// Siri entra con su propia llave (cabecera Authorization: Bearer), puesta por el señor con clave-siri.ps1
const SIRI_TOKEN = process.env.HUD_SIRI_TOKEN || env.HUD_SIRI_TOKEN || ''; // la variable de entorno solo sirve para pruebas

// ---------- El PC (harvey-hud/server.mjs) entra por un túnel SSH fijo a un puerto aparte (PC_PORT) ----------
// Ese puerto no lo publica Traefik (solo se alcanza desde el propio servidor) y pide la llave del API de Harvey,
// que el PC ya tiene en su secrets.json. Así el PC deja de abrir un ssh + docker exec por cada dato (antes 18.000 al día).
const PC_PORT = +process.env.PC_PORT || 7790;
const VOICE_RULES = `Estás respondiendo por voz desde el HUD del escritorio del señor: tu respuesta se leerá ENTERA en voz alta.
No empieces con "Recibido", "Entendido" ni repitas la orden; ve directo al resultado.
Escribe para ser escuchado y dilo todo, sin recortar: frases naturales, sin markdown, viñetas, tablas, emojis ni símbolos.
Nunca metas enlaces ni direcciones de correo en las frases; si uno es útil, ponlo solo en la última línea (se ve en pantalla, no se lee).
Si necesitas que el señor confirme algo (enviar un correo, crear un evento...), termina con una pregunta de sí o no: el HUD le mostrará botones para responder.
Los archivos que el señor adjunta desde el HUD están en ${UPLOADS}/; para imágenes usa vision_analyze con esa ruta.`;
// Modo conversación (tecla º): el HUD vuelve a escuchar solo tras cada respuesta
const CONVO_RULES = `
Estáis en una conversación por voz continua: tras tu respuesta el HUD vuelve a escucharle sin que diga «Oye Harvey». Contesta como en una charla.
Si el señor da la conversación por terminada (se despide, dice que eso es todo...), despídete en una frase y termina tu respuesta exactamente con [FIN].`;
const CLAUDE_RULES = `Este mensaje te lo envía Claude Code, el agente programador del señor que trabaja en su PC, no el señor directamente.
Colaboráis como equipo: contesta de forma directa y técnica, sin formalidades. Puedes usar tus herramientas (Notion, Gmail, Calendar...) para ayudarle.
Para acciones con efectos fuera (enviar correos, borrar, crear eventos) aplica las mismas reglas de confirmación que con el señor.`;

// ---------- Voz de Harvey (voz.mjs, Gemini), igual que el HUD del PC ----------
// shortcut: frases.json es una copia del de harvey-hud/; si se edita allí, volver a subirla aquí.
const frases = () => JSON.parse(readFileSync(join(import.meta.dirname, 'frases.json'), 'utf8'));
const any = (list) => list[Math.floor(Math.random() * list.length)];
const ackList = (text) => frases().ack.find(r => !r.si || new RegExp(`\\b(?:${r.si})`, 'i').test(text)).frases;
// Las frases cortas se guardan en disco (se generan una sola vez); las respuestas, en memoria un rato
const ttsMemo = new Map();
const cacheFile = (text) => text.length <= 80 && join(ACK_DIR, createHash('sha1').update(VOICE + MODEL + text).digest('hex') + '.mp3');
async function tts(text) {
  if (ttsMemo.has(text)) return ttsMemo.get(text);
  const file = cacheFile(text);
  if (file && existsSync(file)) return readFileSync(file);
  const buf = await voz(text, env.GEMINI_API_KEY);
  console.log(`[voz] ${text.length} caracteres generados`);
  if (file) writeFileSync(file, buf);
  else { ttsMemo.set(text, buf); if (ttsMemo.size > 30) ttsMemo.delete(ttsMemo.keys().next().value); }
  return buf;
}
const sendMp3 = (res, buf, extra = {}) => {
  res.writeHead(200, { 'Content-Type': tipo(buf), 'Content-Length': buf.length, 'Cache-Control': 'no-store', ...extra });
  res.end(buf);
};
// Frase de una lista: mp3 (texto en X-Ack-Text) o solo { phrase } si la voz está en silencio.
// «Solo frases» (cachedOnly): únicamente variantes ya guardadas; si no hay ninguna, solo texto. Nunca gasta.
async function sendPhrase(res, list, { silent, cachedOnly }) {
  if (silent) return json(res, { phrase: any(list) });
  if (cachedOnly) {
    const saved = list.filter(p => cacheFile(p) && existsSync(cacheFile(p)));
    if (!saved.length) return json(res, { phrase: any(list) });
    const p = any(saved);
    return sendMp3(res, readFileSync(cacheFile(p)), { 'X-Ack-Text': encodeURIComponent(p) });
  }
  const p = any(list);
  sendMp3(res, await tts(p), { 'X-Ack-Text': encodeURIComponent(p) });
}

// ---------- Oído: Whisper local de Harvey, cargado una vez y reutilizado (se apaga tras 10 min sin uso) ----------
let stt = null, sttWait = null, sttIdle, sttChain = Promise.resolve();
function sttProc() {
  if (stt) return stt;
  stt = spawn(PY, [join(import.meta.dirname, 'transcribir.py')], { cwd: '/opt/data', stdio: ['pipe', 'pipe', 'inherit'] });
  createInterface({ input: stt.stdout }).on('line', (l) => {
    if (!l.startsWith('@@')) return; // Hermes puede escribir otras cosas por la salida
    const w = sttWait; sttWait = null; w?.ok(JSON.parse(l.slice(2)));
  });
  stt.on('exit', () => { stt = null; sttWait?.ko(new Error('El transcriptor se ha cerrado')); sttWait = null; });
  return stt;
}
const transcribe = (file) => (sttChain = sttChain.catch(() => {}).then(() => new Promise((ok, ko) => {
  clearTimeout(sttIdle);
  const guard = setTimeout(() => stt?.kill(), 90_000); // si se atasca, se reinicia en la siguiente
  sttWait = { ok: (r) => { clearTimeout(guard); ok(r); }, ko: (e) => { clearTimeout(guard); ko(e); } };
  sttProc().stdin.write(file + '\n');
})).finally(() => { sttIdle = setTimeout(() => stt?.kill(), 600_000); }));

// Agenda, correo, Notion, sistema y actividad de Harvey (snapshot.py, el mismo del HUD del PC), cacheada 45 s
const snap = { at: 0, json: '{}', pending: null };
// Marca un hábito en Notion (habitos.py), devuelve la semana y corrige la foto cacheada
async function marcarHabito(habito, valor, fecha) {
  const out = await new Promise((ok, ko) => execFile(PY, ['/opt/data/hud/habitos.py', 'marcar', habito, valor, '--fecha', fecha], { cwd: '/opt/data', timeout: 60_000 },
    (err, stdout, stderr) => (err ? ko(new Error(stderr.trim().split('\n').at(-1) || err.message)) : ok(stdout))));
  const data = JSON.parse(out);
  try { const s = JSON.parse(snap.json); if (s.habitos) { s.habitos = { ok: true, data }; snap.json = JSON.stringify(s); } } catch {}
  return data;
}
// Un script de /opt/data/hud (aprobaciones.py, tablero.py)
function hud(script, args, input = '') {
  return new Promise((ok, ko) => {
    const p = execFile(PY, ['/opt/data/hud/' + script, ...args], { cwd: '/opt/data', timeout: 120_000, maxBuffer: 8e6 },
      (err, stdout, stderr) => (err ? ko(new Error(stderr.trim().split('\n').at(-1) || err.message)) : ok(stdout)));
    p.stdin.end(input);
  });
}
// Automatizaciones del iPhone (editable sin reiniciar)
const disparadores = () => JSON.parse(readFileSync(join(import.meta.dirname, 'disparadores.json'), 'utf8'));

// Conversaciones: movil-… desde el iPhone; el PC usa las suyas (hud-…)
const session = (s, pc = false) => (/^movil-[\w-]{1,40}$/.test(s || '') || (pc && /^hud-[\w-]{1,40}$/.test(s || '')) ? s
  : pc ? 'hud-escritorio' : 'movil-principal');
// El contenedor va en UTC: los días se cuentan en hora de Madrid
const madridDay = (t = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date(t));
// Siri: misma regla que la app, conversación nueva tras 1 h sin órdenes o al cambiar de día.
// pend: orden que tardó más de 10 s y aún no ha recogido el atajo ({ run, w }).
const siri = { key: '', at: 0, pend: null };
const siriSession = () => {
  const now = Date.now();
  if (now - siri.at > 3600_000 || madridDay(siri.at) !== madridDay(now)) siri.key = 'movil-siri-' + now.toString(36);
  siri.at = now;
  return siri.key;
};
const harvey = (path, init = {}, key = 'movil-principal') => fetch(HARVEY + path, {
  ...init, headers: { Authorization: `Bearer ${env.API_SERVER_KEY}`, 'X-Hermes-Session-Key': key, 'Content-Type': 'application/json', ...init.headers },
});

const readBody = (req) => new Promise((ok, ko) => {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > 1e6) { ko(new Error('Petición demasiado grande')); req.destroy(); } });
  req.on('error', ko);
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { ko(e); } });
});
const pipe = async (upstream, res) => {
  res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  if (upstream.body) Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res); else res.end();
};
// Si el iPhone corta (app en segundo plano), se suelta también el flujo con Harvey en vez de dejarlo colgado
const untilClosed = (res) => { const ac = new AbortController(); res.on('close', () => ac.abort()); return ac.signal; };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const json = (res, obj, status = 200, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra }); res.end(JSON.stringify(obj)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

// ---------- Avisos push (app cerrada) ----------
const SUBS = join(import.meta.dirname, 'push-subs.json');
const vapid = loadVapid(join(import.meta.dirname, 'vapid.json'));
let subs = existsSync(SUBS) ? JSON.parse(readFileSync(SUBS, 'utf8')) : [];
const saveSubs = () => writeFileSync(SUBS, JSON.stringify(subs), { mode: 0o600 });
const madridHour = () => +new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Madrid' }).format(new Date());
const quiet = () => { const h = madridHour(); return h >= 22 || h < 8; };
// Silencio de 22:00 a 8:00 salvo autorizaciones (urgent)
async function notify(payload, { urgent = false } = {}) {
  if (!urgent && quiet()) return console.log('[push] silencio nocturno:', payload.title);
  for (const s of [...subs]) {
    const code = await sendPush(vapid, s, payload, { urgent }).catch((e) => (console.error('[push]', e.message), 0));
    console.log('[push]', payload.tag, code); // 201 = aceptado por Apple
    if (code === 404 || code === 410) { subs = subs.filter((x) => x !== s); saveSubs(); }
  }
}
// Cada orden se vigila desde aquí: si Harvey pide autorización o termina y la app no la está mirando, aviso al móvil
let appVisible = true;                 // la app avisa al pasar a segundo plano (POST /api/visible)
const runs = new Map();                // run_id → { streams, siriWaiting, done }
const ENDS = ['run.completed', 'run.failed', 'run.interrupted', 'run.cancelled'];
// Texto del aviso push: máx. 300 caracteres cortando al final de una frase
const spoken = (t) => {
  const s = String(t || '').split(/\n\s*-{3,}/)[0].trim();
  if (s.length <= 300) return s;
  const cut = s.slice(0, 300), end = Math.max(...['. ', '? ', '! ', '; '].map((p) => cut.lastIndexOf(p)));
  return end > 100 ? cut.slice(0, end + 1).replace(/;$/, '.') : cut.replace(/\s+\S*$/, '…');
};
function watch(run, key, { siri = false } = {}) {
  const w = { streams: 0, siriWaiting: siri };
  const watching = () => appVisible && w.streams > 0;
  const url = `/?run=${encodeURIComponent(run)}&session=${encodeURIComponent(key)}`;
  runs.set(run, w);
  w.avisa = (ev) => {
    const ok = ev?.event === 'run.completed';
    notify({ title: ok ? 'Harvey ha terminado' : 'La orden no ha podido completarse', body: ok ? spoken(ev.output) || 'Listo, señor.' : String(ev?.error?.message || ev?.error || ''), url, tag: run });
  };
  const fin = (ev) => { if (!watching() && !w.siriWaiting) w.avisa(ev); return ev; };
  w.done = (async () => {
    // tope de 1 h por si Harvey se queda esperando una autorización que nunca llega
    const hasta = Date.now() + 3600_000;
    let last = -1;
    while (Date.now() < hasta) {
      const r = await harvey(`/v1/runs/${encodeURIComponent(run)}/events`, {
        signal: AbortSignal.timeout(hasta - Date.now()), headers: last >= 0 ? { 'Last-Event-ID': String(last) } : {},
      }, key).catch(() => null);
      if (r?.ok) for await (const l of createInterface({ input: Readable.fromWeb(r.body) })) {
        if (!l.startsWith('data: ')) continue;
        let ev; try { ev = JSON.parse(l.slice(6)); } catch { continue; }
        if (ev.seq != null) last = ev.seq;
        if (ev.event === 'approval.request' && !watching())
          notify({ title: '⚠ Harvey pide autorización', body: ev.description || ev.command || 'Toque para aprobar o rechazar.', url, tag: 'aprob-' + run }, { urgent: true });
        if (ENDS.includes(ev.event)) return fin(ev);
      }
      // el flujo se cortó sin el final (reinicio de Harvey, cliente lento...): ¿terminó la orden o sigue?
      const st = await harvey(`/v1/runs/${encodeURIComponent(run)}`, {}, key).then((x) => x.json()).catch(() => ({}));
      if (st.status === 'completed') return fin({ event: 'run.completed', output: st.output });
      if (['failed', 'cancelled', 'interrupted'].includes(st.status)) return fin({ event: 'run.' + st.status, error: st.error });
      if (st.error?.code === 'run_not_found') return null; // ya no existe: mejor callar que avisar en falso
      await sleep(3000);
    }
    return null;
  })().catch((e) => { console.error('[vigía]', run, e.message); return null; }).finally(() => setTimeout(() => runs.delete(run), 60_000));
  return w;
}
// Crons de Hermes que avisan al móvil: cada respuesta suya que no sea [SILENT] → aviso. Al tocarlo, la app se abre
// lista para contestar (?responder=texto del aviso).
// Misma regla que vps/vivo.py (tipo_aviso), más los Hábitos de las 22:00 (solo al iPhone). Cualquier cron de una sola
// vez es un recordatorio aunque Harvey no le ponga el prefijo (el 20/10 «Llamar a Beti» no llegó al iPhone).
const CRON_OUT = '/opt/data/cron/output';
const CRON_AVISOS = {
  correo: { title: '📬 Correo importante', tag: 'cartero' },
  // habitos.py --vigia y los recordatorios se saltan el silencio nocturno: llegan justo cuando tocan
  habitos: { title: '🏋️ Harvey · Hábitos', tag: 'habitos', urgent: true },
  pensamiento: { title: '💡 Harvey', tag: 'pensamiento' },
  seguimiento: { title: '💬 Harvey', tag: 'seguimiento' },
  recordatorio: { title: '⏰ Recordatorio', tag: 'recordatorio', urgent: true },
  cupo: { title: '⚠ Cupo de ChatGPT', tag: 'cupo' },
  equipo: { title: '🤝 Equipo de Harvey', tag: 'equipo' },
};
function avisoDe(dir, txt) {
  const name = txt.split('\n', 1)[0].replace(/^# Cron Job:\s*/, '');
  if (dir === '138ae670470c') return 'correo';      // Cartero
  if (dir === '6421874d67bd') return 'habitos';     // Hábitos 22:00
  if (name.startsWith('Pensamientos de Harvey')) return 'pensamiento';
  if (name.startsWith('Seguimiento')) return 'seguimiento';
  if (name.startsWith('Cupo de ChatGPT')) return 'cupo';
  if (name.startsWith('Equipo de Harvey')) return 'equipo';
  if (name.startsWith('Recordatorio') || txt.slice(0, 400).includes('\n**Schedule:** once at')) return 'recordatorio';
  return null;
}
const cronDirs = () => { try { return readdirSync(CRON_OUT); } catch { return []; } };
const cronFiles = (id) => { try { return readdirSync(join(CRON_OUT, id)).filter((f) => f.endsWith('.md')).sort(); } catch { return []; } };
const cronLast = new Map(cronDirs().map((d) => [d, cronFiles(d).at(-1) || ''])); // al arrancar no se repite nada antiguo
const vigilaCrons = () => {
  for (const d of cronDirs()) for (const f of cronFiles(d).filter((f) => f > (cronLast.get(d) ?? ''))) {
    cronLast.set(d, f);
    const txt = readFileSync(join(CRON_OUT, d, f), 'utf8'), tipo = avisoDe(d, txt), c = CRON_AVISOS[tipo];
    // los crons sin IA no tienen «## Response»: su texto va tras la primera «---» (misma regla que vivo.respuesta)
    const out = (txt.split('\n## Response\n')[1] ?? (txt.slice(0, 400).includes('**Mode:** no_agent') ? txt.split('\n---\n')[1] : '') ?? '').trim();
    if (!c || !out || out.includes('[SILENT]')) continue;
    const body = out.replace(/^📬\s*Correo importante\s*/i, '').slice(0, 400);
    // cada recordatorio con su etiqueta: en iOS uno nuevo con la misma etiqueta borraría el anterior
    notify({ title: c.title, body, url: '/?responder=' + encodeURIComponent(body), tag: tipo === 'recordatorio' ? `recordatorio-${d}` : c.tag }, { urgent: c.urgent });
  }
};
setInterval(vigilaCrons, 60_000);

// ---------- Despertador: Harvey sigue solo cuando acaban sus subagentes ----------
// Hermes lanza SIEMPRE los subagentes en segundo plano y, en el API (HUD, app, Siri), guarda su resultado en la
// conversación SIN despertar a Harvey: «el cliente es dueño del siguiente turno» (gateway/wake.py). Así se quedó parado
// el 28/10 el informe de clientes de Bizkaia. Cada 20 s se buscan resultados que ningún turno ha recogido y se abre uno en
// esa conversación. El HUD del PC lo adopta (snapshot → harvey.despertares) y el móvil recibe aviso al terminar (watch).
const DESPERTARES = '/opt/data/hud/despertares.json';
const WAKE_RULES = `Este turno no lo escribe el señor: lo abre el despertador automático porque tus subagentes en segundo plano han
terminado y sus resultados están justo antes en esta conversación. Continúa tú solo la tarea que te encargó el señor hasta
terminarla del todo, sin preguntarle si quiere que sigas: aprovecha lo que han traído, consigue con datos lo que falte
(puedes lanzar otra tanda de subagentes; al acabar te volverá a despertar este aviso) y entrega el resultado final.
Rigor es aportar pruebas y datos, no llenar el texto de cautelas. Si aún quedan subagentes de esta misma tarea trabajando, no adelantes el resultado: di en una frase qué falta y termina.`;
const HUD_WAKE_RULES = `Respondes en el HUD del escritorio: lo que escribas antes de una línea con --- se lee en voz alta (frases naturales,
sin markdown, emojis ni enlaces); debajo de --- va el detalle completo en markdown, que solo se ve en pantalla.
Si el resultado es un informe largo, entrégalo además como documento en Drive (Entregables de Harvey) con el enlace en la última línea.`;
const wakeRules = (key) => WAKE_RULES + '\n' + (key.startsWith('hud-') ? HUD_WAKE_RULES
  : key.startsWith('movil-') ? MOBILE_RULES + '\nSi el resultado es un informe largo, entrégalo como documento en Drive (Entregables de Harvey) y pon el enlace en la última línea.' : '');
let despertares = existsSync(DESPERTARES) ? JSON.parse(readFileSync(DESPERTARES, 'utf8')) : [];
let stateDb;
const libre = `not exists (select 1 from session_turn_leases l where l.conversation_id in (s.id, s.session_key) and l.expires_at > :now)`;
// Desde Hermes 0.22.5 (29/10) sessions.session_key es «agent:main:api_server:dm:run_…»; la clave del cliente (hud-…, movil-…)
// vive en state_meta «gateway.api.conversation.v1.<clave>» → id de la sesión. Y los turnos del señor llevan
// display_kind 'internal_notification' (antes NULL).
const CLAVE = `coalesce((select substr(k.key, 29) from state_meta k where k.key like 'gateway.api.conversation.v1.%' and k.value = s.id), s.session_key)`;
const TURNO = `u.role = 'user' and (u.display_kind is null or u.display_kind = 'internal_notification')`;
// Dos casos, de las últimas 6 h y con la conversación sin turno en marcha:
// 1) resultado guardado (fila async_delegation_complete) sin un turno real posterior que lo recogiera;
// 2) resultado DESCARTADO: si acaba mientras Harvey está en mitad de un turno, Hermes reintenta 8 veces en ~14 s y lo da por
//    «dropped» sin meterlo en la conversación (28/10 17:29: la auditoría del informe se perdió). Se le entrega en el turno.
function pendientes() {
  stateDb ??= new DatabaseSync('/opt/data/state.db', { readOnly: true });
  const now = Date.now() / 1000, desde = now - 6 * 3600;
  const filas = stateDb.prepare(`select m.id, ${CLAVE} as key from messages m join sessions s on s.id = m.session_id
    where m.display_kind = 'async_delegation_complete' and m.timestamp > :desde and s.source = 'api_server'
      and not exists (select 1 from messages u where u.session_id = m.session_id and u.id > m.id and ${TURNO})
      and ${libre}`).all({ desde, now });
  const perdidos = stateDb.prepare(`select d.delegation_id as id, d.result_json as res, ${CLAVE} as key from async_delegations d
    join sessions s on s.id = coalesce(d.origin_session_id, d.parent_session_id)
    where d.delivery_state = 'dropped' and d.completed_at > :desde and s.source = 'api_server' and ${libre}`)
    .all({ desde, now }).filter((p) => !despertares.some((d) => d.row === p.id && d.run)); // ya entregado
  // sin clave del cliente no hay a quién despertar (abrir otra conversación con la clave interna no serviría)
  return [...filas, ...perdidos].filter((p) => p.key && !p.key.startsWith('agent:'));
}
// Resultado descartado → texto para el turno (resúmenes de cada subagente, con tope por si fuese enorme)
const resultado = (json) => {
  let res = []; try { res = JSON.parse(json || '{}').results || []; } catch {}
  return res.map((t, i) => `### Subagente ${i + 1} (${t.status || '?'})\n${t.summary || t.error || 'sin resumen'}`).join('\n\n').slice(0, 40_000);
};
async function despertador() {
  const now = Date.now() / 1000;
  for (const p of pendientes()) {
    const previos = despertares.filter((d) => d.row === p.id);
    // freno: 3 intentos por resultado y 8 despertares por conversación cada 6 h (por si Harvey entrase en bucle)
    if (previos.length >= 3 || despertares.filter((d) => d.session === p.key && now - d.at < 6 * 3600).length >= 8) continue;
    if (previos.some((d) => now - d.at < 120)) continue; // ya despertado: dale tiempo a que el turno arranque
    const input = p.res === undefined ? '[Aviso automático: tus subagentes han terminado. Sigue con la tarea del señor.]'
      : `[Aviso automático: unos subagentes terminaron mientras estabas ocupado y su resultado no llegó a la conversación (${p.id}). Aquí lo tienes. Sigue con la tarea del señor.]\n\n${resultado(p.res)}`;
    const r = await harvey('/v1/runs', {
      method: 'POST', headers: { 'Idempotency-Key': `despertar-${p.id}-${previos.length}` },
      body: JSON.stringify({ input, instructions: wakeRules(p.key) }),
    }, p.key).catch((e) => ({ ok: false, status: e.message }));
    const j = r.ok ? await r.json().catch(() => ({})) : {};
    console.log(`[despertador] ${p.key} fila ${p.id} → ${j.run_id || 'falló ' + r.status}`);
    despertares = [...despertares, { row: p.id, session: p.key, run: j.run_id || null, at: now }].slice(-50);
    writeFileSync(DESPERTARES, JSON.stringify(despertares));
    if (j.run_id) watch(j.run_id, p.key);
  }
}
// solo el servidor de verdad (la copia gemela de pruebas lleva PORT) para no despertar dos veces
if (!process.env.PORT) setInterval(() => despertador().catch((e) => console.error('[despertador]', e.message)), 20_000);

// ---------- Acceso ----------
const cookie = (req) => (req.headers.cookie || '').match(/(?:^|;\s*)hm=([a-f0-9]{64})/)?.[1];
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const authed = (req) => !!TOKEN && !!cookie(req) && same(cookie(req), TOKEN);
// Freno contra adivinar la contraseña: 5 fallos seguidos bloquean el acceso 15 minutos (un solo usuario)
const guard = { fails: 0, until: 0 };

// ---------- Siri ----------
// Comprueba la llave del atajo y devuelve cómo contestar: mp3 con ?voz; si no, { text } ya limpio para «Leer texto»
function siriReply(req, res, url) {
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!SIRI_TOKEN || !same(given, SIRI_TOKEN)) { json(res, { text: 'No tengo permiso: revise la llave del atajo de Siri.' }, 401); return null; }
  return async (say, extra = {}, status = 200) => (url.searchParams.has('voz') ? sendMp3(res, await tts(say)) : json(res, { text: hablable(say), ...extra }, status));
}
const siriAnswer = (ev) => {
  if (ev?.event !== 'run.completed') return 'No he podido completarlo, señor.';
  const t = String(ev.output || '').trim();
  return hablable(t) ? t : 'Hecho, señor. Lo tiene en la app.';
};
// Respuesta muda para /api/siri/sigue cuando no queda nada pendiente (el atajo siempre reproduce algo)
let silenceMp3;
const silence = async () => (silenceMp3 ??= await new Promise((ok, ko) => execFile('ffmpeg',
  ['-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '0.3', '-f', 'mp3', 'pipe:1'],
  { encoding: 'buffer' }, (e, out) => (e ? ko(e) : ok(out)))));

const routes = {
  'POST /api/login': async (req, res) => {
    if (!PASSWORD) return json(res, { error: 'Aún no hay contraseña: ejecute clave-movil.ps1 en el PC.' }, 503);
    if (Date.now() < guard.until) return json(res, { error: 'Demasiados intentos. Espere unos minutos.' }, 429);
    const { password } = await readBody(req);
    const given = createHmac('sha256', String(password || '')).update('harvey-movil-v1').digest('hex');
    if (!same(given, TOKEN)) {
      if (++guard.fails >= 5) Object.assign(guard, { fails: 0, until: Date.now() + 15 * 60_000 });
      await new Promise((r) => setTimeout(r, 1000));
      return json(res, { error: 'Contraseña incorrecta.' }, 401);
    }
    guard.fails = 0;
    json(res, { ok: true }, 200, { 'Set-Cookie': `hm=${TOKEN}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict` });
  },
  'GET /api/ping': async (req, res) => json(res, { ok: true }),
  'GET /api/health': async (req, res) => pipe(await harvey('/v1/health'), res),
  // Lanza una orden; devuelve { run_id }. Desde el PC: reglas de voz del HUD (y de conversación con convo) y sin push
  'POST /api/ask': async (req, res) => {
    const { text, session: s, convo } = await readBody(req);
    if (!text?.trim()) return json(res, { error: 'Orden vacía' }, 400);
    const key = session(s, req.pc), instructions = req.pc ? VOICE_RULES + (convo ? CONVO_RULES : '') : MOBILE_RULES;
    const r = await harvey('/v1/runs', { method: 'POST', body: JSON.stringify({ input: text, instructions }) }, key);
    const j = await r.json();
    if (j.run_id && !req.pc) watch(j.run_id, key);
    json(res, j, r.status);
  },
  // Canal de Claude Code (harvey-hud/harvey.mjs, solo desde el PC): conversación por día y respuesta completa al terminar
  'POST /api/claude': async (req, res) => {
    if (!req.pc) return json(res, { error: 'Solo desde el PC' }, 403);
    const { text } = await readBody(req);
    if (!text?.trim()) return json(res, { error: 'Mensaje vacío' }, 400);
    const sesion = 'claude-code-' + madridDay();
    const run = await (await harvey('/v1/runs', { method: 'POST', body: JSON.stringify({ input: text, instructions: CLAUDE_RULES }) }, sesion)).json();
    if (!run.run_id) return json(res, { error: run.error?.message || 'Harvey no aceptó el mensaje' }, 502);
    // el flujo termina al acabar la ejecución; tope de 10 min por si Harvey se queda esperando
    const sse = await (await harvey(`/v1/runs/${run.run_id}/events`, { signal: AbortSignal.timeout(600_000) }, sesion)).text();
    const done = sse.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6))).findLast((e) => e.event?.startsWith('run.'));
    json(res, { ok: done?.event === 'run.completed', output: done?.output ?? done?.error ?? 'sin respuesta' });
  },
  // Eventos en directo (SSE). Harvey numera cada evento: al volver a la app se pide desde el último visto (last_seq)
  'GET /api/events': async (req, res, url) => {
    const q = url.searchParams, last = req.headers['last-event-id'] || q.get('last_seq');
    const run = encodeURIComponent(q.get('run') || ''), w = runs.get(q.get('run'));
    if (w) { w.streams++; res.on('close', () => w.streams--); }
    pipe(await harvey(`/v1/runs/${run}/events`, { signal: untilClosed(res), headers: /^\d+$/.test(last || '') ? { 'Last-Event-ID': last } : {} },
      session(q.get('session'), req.pc)), res);
  },
  // Estado y resultado final de una orden (si la app estuvo cerrada mientras Harvey trabajaba)
  'GET /api/run': async (req, res, url) => pipe(await harvey(`/v1/runs/${encodeURIComponent(url.searchParams.get('run') || '')}`, {},
    session(url.searchParams.get('session'), req.pc)), res),
  'POST /api/stop': async (req, res) => {
    const { run, session: s } = await readBody(req);
    await pipe(await harvey(`/v1/runs/${encodeURIComponent(run)}/stop`, { method: 'POST', body: '{}' }, session(s, req.pc)), res);
  },
  'POST /api/approval': async (req, res) => {
    const { run, choice, request_id, session: s } = await readBody(req);
    await pipe(await harvey(`/v1/runs/${encodeURIComponent(run)}/approval`, {
      method: 'POST', body: JSON.stringify({ choice, ...(request_id ? { request_id } : {}) }),
    }, session(s, req.pc)), res);
  },
  // Voz: texto → mp3 (o en directo con stream); confirmación inmediata según la orden; frase del repositorio por tipo
  'POST /api/tts': async (req, res) => {
    const { text, stream } = await readBody(req);
    if (!text?.trim()) return json(res, { error: 'Texto vacío' }, 400);
    if (stream) return enviarEnDirecto(res, text, env.GEMINI_API_KEY);
    sendMp3(res, await tts(text));
  },
  'POST /api/ack': async (req, res) => { const b = await readBody(req); await sendPhrase(res, ackList(b.text || ''), b); },
  'POST /api/phrase': async (req, res) => {
    const b = await readBody(req), list = frases()[b.kind];
    if (!Array.isArray(list) || typeof list[0] !== 'string') return json(res, { error: 'Tipo de frase desconocido' }, 404);
    await sendPhrase(res, list, b);
  },
  // Nota de voz del micrófono → texto
  'POST /api/stt': async (req, res) => {
    const size = +req.headers['content-length'] || 0, type = req.headers['content-type'] || '';
    if (!size || size > 10e6) return json(res, { error: 'Audio vacío o demasiado largo' }, 413);
    const file = `/tmp/movil-voz-${Date.now()}.${/mp4|m4a|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : /mpeg|mp3/.test(type) ? 'mp3' : 'webm'}`;
    await pipeline(req, createWriteStream(file));
    try {
      const r = await transcribe(file);
      if (!r.success) return json(res, { error: r.error || 'No se pudo transcribir' }, 502);
      json(res, { text: (r.transcript || '').trim() });
    } finally { try { unlinkSync(file); } catch {} }
  },
  'GET /api/snapshot': async (req, res) => {
    if (!snap.at || Date.now() - snap.at > 45_000) {
      snap.pending ??= new Promise((ok, ko) => execFile(PY, ['/opt/data/hud/snapshot.py'], { cwd: '/opt/data', timeout: 60_000, maxBuffer: 4e6 },
        (err, out) => (err ? ko(err) : ok(out)))).then((out) => Object.assign(snap, { at: Date.now(), json: out })).finally(() => { snap.pending = null; });
      await snap.pending;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(snap.json);
  },
  // Bandeja: tarjetas del equipo que esperan al señor (aprobaciones.py, la misma del HUD del PC)
  'GET /api/aprobaciones': async (req, res) => json(res, JSON.parse(await hud('aprobaciones.py', ['listar']))),
  // Tablero del equipo: objetivos, tarjetas por columna y la bandeja (tablero.py, el mismo del HUD del PC)
  'GET /api/tablero': async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(await hud('tablero.py', ['tablero']));
  },
  // Mensaje del señor en la tarjeta de un agente (Oficina); el texto va por stdin
  'POST /api/comentario': async (req, res) => {
    const { tablero, id, texto = '' } = await readBody(req);
    if (!/^[a-z0-9_-]{1,40}$/.test(tablero) || !/^t_[0-9a-f]{6,16}$/.test(id) || !String(texto).trim()) return json(res, { error: 'Datos no válidos' }, 400);
    try { json(res, JSON.parse(await hud('tablero.py', ['comentar', tablero, id], String(texto).slice(0, 2000)))); }
    catch (e) { json(res, { error: e.message }, 400); }
  },
  // Sistema: gasto por agente y objetivo, Claude Code, tareas automáticas y avisos (sistema.py, el mismo del PC)
  'GET /api/sistema': async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(await hud('sistema.py', []));
  },
  // Biblioteca: las notas de la wiki y sus últimos cambios; guardar = uno de los tres formularios (biblioteca.py, el mismo del PC)
  'GET /api/biblioteca': async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(await hud('biblioteca.py', ['indice']));
  },
  'POST /api/biblioteca': async (req, res) => {
    const { ruta, base, campos } = await readBody(req);
    if (!/^(objetivos|negocio\/clientes|negocio\/linkedin)\/[\w-]{1,80}\.md$/.test(ruta) || !/^[0-9a-f]{40}$/.test(base) || typeof campos !== 'object')
      return json(res, { error: 'Datos no válidos' }, 400);
    try { json(res, JSON.parse(await hud('biblioteca.py', ['guardar'], JSON.stringify({ ruta, base, campos })))); }
    catch (e) { json(res, { error: e.message }, 400); }
  },
  'POST /api/aprobaciones': async (req, res) => {
    const { tablero, id, accion, texto = '' } = await readBody(req);
    if (!/^[a-z0-9_-]{1,40}$/.test(tablero) || !/^t_[0-9a-f]{6,16}$/.test(id) || !['aprobar', 'rechazar', 'responder'].includes(accion))
      return json(res, { error: 'Datos no válidos' }, 400);
    try { json(res, JSON.parse(await hud('aprobaciones.py', ['responder', tablero, id, accion], String(texto).slice(0, 4000)))); }
    catch (e) { json(res, { error: e.message }, 400); }
  },
  // Marca un hábito en Notion (habitos.py) y devuelve la semana actualizada; también corrige la foto cacheada
  'POST /api/habito': async (req, res) => {
    const { habito, valor, fecha } = await readBody(req);
    if (!['gym', 'lectura', 'instagram'].includes(habito) || !/^(si|no|nada|\d{1,4})$/.test(valor) || !/^\d{4}-\d\d-\d\d$/.test(fecha))
      return json(res, { error: 'Datos de hábito no válidos' }, 400);
    json(res, await marcarHabito(habito, valor, fecha));
  },
  // Siri, sin tocar el teléfono (p. ej. en el coche). El atajo repite: dictar → POST /api/siri → suena →
  // varias veces GET /api/siri/sigue → suena. Si Harvey tarda más de 10 s, contesta «Un momento, señor» y cada
  // /sigue espera hasta 40 s más: suena la respuesta o «Sigo con ello». Sin nada pendiente, /sigue da un silencio
  // al instante. Si nadie recoge la respuesta en 45 s (Siri se cerró), llega el aviso al móvil como siempre.
  // Con ?voz la respuesta llega como mp3 con la voz de Harvey para «Reproducir sonido»; sin él, { text } para «Leer texto».
  'POST /api/siri': async (req, res, url) => {
    const reply = siriReply(req, res, url);
    if (!reply) return;
    // ?disparador=<nombre>: automatizaciones del iPhone (alarma, salir/llegar a casa, gimnasio), ver disparadores.json
    const trig = url.searchParams.get('disparador'), d = trig && disparadores()[trig];
    if (trig && (!d || trig.startsWith('_'))) return reply('No conozco ese disparador, señor.', {}, 400);
    if (d?.habito) { // sin IA: marca el hábito y contesta con una frase guardada (solo se genera la primera vez)
      await marcarHabito(...d.habito, new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date()));
      return reply(any(frases()[d.frase]));
    }
    const text = d ? d.orden : (await readBody(req)).text;
    if (!text?.trim()) return reply('No le he oído, señor.', {}, 400);
    const key = siriSession();
    const r = await (await harvey('/v1/runs', { method: 'POST', body: JSON.stringify({ input: text, instructions: SIRI_RULES }) }, key)).json();
    if (!r.run_id) return reply('Harvey no puede atenderle ahora: ' + (r.error?.message || 'sigue con otra orden.'), {}, 502);
    if (siri.pend) { const old = siri.pend; siri.pend = null; old.w.done.then((fin) => old.w.avisa(fin)); } // la anterior, sin recoger: al móvil
    const w = watch(r.run_id, key, { siri: true });
    const ev = await Promise.race([w.done, new Promise((ok) => setTimeout(ok, 10_000, 'tarde'))]);
    if (ev !== 'tarde') return reply(siriAnswer(ev), { run: r.run_id });
    siri.pend = { run: r.run_id, w };
    // si Siri no la recoge a tiempo, al móvil
    w.done.then((fin) => setTimeout(() => { if (siri.pend?.run === r.run_id) { siri.pend = null; w.avisa(fin); } }, 45_000));
    reply(any(frases().un_momento), { run: r.run_id, sigue: true });
  },
  'GET /api/siri/sigue': async (req, res, url) => {
    const reply = siriReply(req, res, url), p = siri.pend;
    if (!reply) return;
    if (!p) return url.searchParams.has('voz') ? sendMp3(res, await silence()) : json(res, { text: '' });
    const ev = await Promise.race([p.w.done, new Promise((ok) => setTimeout(ok, 40_000, 'tarde'))]);
    if (ev === 'tarde') return reply(any(frases().espera), { run: p.run, sigue: true });
    if (siri.pend === p) siri.pend = null;
    reply(siriAnswer(ev), { run: p.run });
  },
  // La app copia la llave de Siri para pegarla en el atajo (solo con la sesión de la app abierta)
  'GET /api/siri-token': async (req, res) => (SIRI_TOKEN ? json(res, { header: 'Bearer ' + SIRI_TOKEN })
    : json(res, { error: 'Aún no hay llave: ejecute clave-siri.ps1 en el PC.' }, 404)),
  'GET /api/push-key': async (req, res) => json(res, { key: vapid.publicKey }),
  'POST /api/push-subscribe': async (req, res) => {
    const s = await readBody(req);
    if (!/^https:\/\//.test(s.endpoint || '') || !s.keys?.p256dh || !s.keys?.auth) return json(res, { error: 'Suscripción no válida' }, 400);
    subs = [...subs.filter((x) => x.endpoint !== s.endpoint), { endpoint: s.endpoint, keys: s.keys }];
    saveSubs();
    const code = await sendPush(vapid, s, { title: 'Avisos activados', body: 'Le avisaré aquí cuando termine una orden, necesite su permiso o llegue correo importante.', tag: 'prueba' });
    json(res, { ok: code < 300, code });
  },
  'POST /api/visible': async (req, res) => { const v = !!(await readBody(req)).v; if (!req.pc) appVisible = v; json(res, { ok: true }); },
  // Foto o archivo del señor → carpeta de trabajo de Harvey; devuelve su ruta allí
  'POST /api/upload': async (req, res, url) => {
    const size = +req.headers['content-length'] || 0;
    if (!size || size > 25e6) return json(res, { error: 'El archivo está vacío o supera 25 MB' }, 413);
    const name = (url.searchParams.get('name') || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(-80) || 'archivo';
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const path = join(UPLOADS, `${stamp}_${name}`);
    mkdirSync(UPLOADS, { recursive: true });
    await pipeline(req, createWriteStream(path));
    json(res, { path, size, type: req.headers['content-type'] || '' });
  },
};

process.on('uncaughtException', (e) => console.error('[error]', e)); // un fallo puntual no tumba el servidor

const atiende = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY'); // nadie puede meter la app en un marco de otra web
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    const route = routes[`${req.method} ${url.pathname}`];
    if (req.pc) { // puerto del PC: solo la API, con la llave del API de Harvey
      const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!env.API_SERVER_KEY || !same(given, env.API_SERVER_KEY)) return json(res, { error: 'Llave no válida' }, 401);
      if (!route || url.pathname.startsWith('/api/siri') || url.pathname === '/api/login') return json(res, { error: 'No existe' }, 404);
      return await route(req, res, url);
    }
    if (route) {
      if (!['/api/login', '/api/siri', '/api/siri/sigue'].includes(url.pathname) && !authed(req)) return json(res, { error: 'Necesita iniciar sesión' }, 401);
      return await route(req, res, url);
    }
    // Archivos de la app: públicos (no contienen datos); todo lo que trae datos pasa por /api con contraseña.
    // El arte de la Oficina (LimeZu) solo con sesión: su licencia no deja redistribuirlo y esta web da a internet.
    if (url.pathname.startsWith('/arte/') && !authed(req)) { res.writeHead(401); return res.end(); }
    const file = join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
    if (req.method !== 'GET' || !file.startsWith(PUBLIC + '/') || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, { error: String(e.message || e) }, 502); else res.end();
  }
};
http.createServer(atiende)
  .listen(PORT, '0.0.0.0', () => console.log(`[${new Date().toISOString()}] HUD de bolsillo en :${PORT}${PASSWORD ? '' : ' (SIN contraseña: nadie puede entrar)'}`));
// Traefik solo publica PORT; este lo alcanza el túnel del PC desde el propio servidor
http.createServer((req, res) => { req.pc = true; atiende(req, res); })
  .listen(PC_PORT, '0.0.0.0', () => console.log(`[${new Date().toISOString()}] Entrada del PC en :${PC_PORT}`));
