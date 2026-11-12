// HUD de Harvey: servidor local (solo 127.0.0.1) que conecta la interfaz con Harvey (VPS) y la voz de Google.
// Sin dependencias: node server.mjs
import http from 'node:http';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync, renameSync, createWriteStream } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { homedir } from 'node:os';
import { format } from 'node:util';
import { createHash } from 'node:crypto';
import { tts as voz, tipo, enviarEnDirecto, VOICE, MODEL } from './movil/voz.mjs'; // la misma voz que el móvil, Siri y Telegram

// PORT y TUNNEL_PORT por variable de entorno solo para pruebas (una copia gemela al lado del HUD de verdad)
const PORT = +process.env.PORT || 7777, TUNNEL_PORT = +process.env.TUNNEL_PORT || 18642;
const SSH = ['-i', join(homedir(), '.ssh', 'hermes_vps'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=20', '-T', 'root@72.60.46.112'];
const CONTAINER = 'hermes-agent-ndkm-hermes-agent-1';
// HUD_PUBLIC por variable de entorno solo para la copia gemela: sirve el HUD nuevo (app/) sin tocar el de verdad
const PUBLIC = process.env.HUD_PUBLIC ? resolve(import.meta.dirname, process.env.HUD_PUBLIC) : join(import.meta.dirname, 'public');
const DATA = join(process.env.LOCALAPPDATA, 'HarveyHUD');
const ACK_DIR = join(DATA, 'voz-cache');
mkdirSync(ACK_DIR, { recursive: true });

// Registro propio en %LOCALAPPDATA%\HarveyHUD\servidor.log. Antes lo escribía la redirección «>>» del lanzador, que al
// arrancar con Windows no llegaba a escribir nada (el registro estaba mudo desde el 16/10). Pasa de 2 MB → servidor.log.1
if (!process.env.PORT) {
  const LOG = join(DATA, 'servidor.log');
  try { if (statSync(LOG).size > 2e6) renameSync(LOG, LOG + '.1'); } catch {}
  const file = createWriteStream(LOG, { flags: 'a' });
  for (const k of ['log', 'error']) {
    const orig = console[k];
    console[k] = (...a) => { orig(...a); file.write(`[${new Date().toLocaleString('es-ES')}] ${format(...a)}\n`); };
  }
}
const secrets = JSON.parse(readFileSync(join(process.env.APPDATA, 'HarveyHUD', 'secrets.json'), 'utf8'));

const VOICE_RULES = `Estás respondiendo por voz desde el HUD del escritorio del señor: tu respuesta se leerá ENTERA en voz alta.
No empieces con "Recibido", "Entendido" ni repitas la orden; ve directo al resultado.
Escribe para ser escuchado y dilo todo, sin recortar: frases naturales, sin markdown, viñetas, tablas, emojis ni símbolos.
Nunca metas enlaces ni direcciones de correo en las frases; si uno es útil, ponlo solo en la última línea (se ve en pantalla, no se lee).
Si necesitas que el señor confirme algo (enviar un correo, crear un evento...), termina con una pregunta de sí o no: el HUD le mostrará botones para responder.
Los archivos que el señor adjunta desde el HUD están en /opt/data/workspace/hud/; para imágenes usa vision_analyze con esa ruta.`;
// Modo conversación (tecla º): el HUD vuelve a escuchar solo tras cada respuesta
const CONVO_RULES = `
Estáis en una conversación por voz continua: tras tu respuesta el HUD vuelve a escucharle sin que diga «Oye Harvey». Contesta como en una charla.
Si el señor da la conversación por terminada (se despide, dice que eso es todo...), despídete en una frase y termina tu respuesta exactamente con [FIN].`;

const CLAUDE_RULES = `Este mensaje te lo envía Claude Code, el agente programador del señor que trabaja en su PC, no el señor directamente.
Colaboráis como equipo: contesta de forma directa y técnica, sin formalidades. Puedes usar tus herramientas (Notion, Gmail, Calendar...) para ayudarle.
Para acciones con efectos fuera (enviar correos, borrar, crear eventos) aplica las mismas reglas de confirmación que con el señor.`;

// Repositorio de frases (frases.json, editable): saludos, confirmaciones, avisos... Se relee en cada uso para que
// los cambios del usuario valgan sin reiniciar. Cada frase se genera una vez y queda en disco (ver tts()).
const FRASES = join(import.meta.dirname, 'frases.json');
const frases = () => JSON.parse(readFileSync(FRASES, 'utf8'));
const any = (list) => list[Math.floor(Math.random() * list.length)];
const ackList = (text) => frases().ack.find(r => !r.si || new RegExp(`\\b(?:${r.si})`, 'i').test(text)).frases;

// Responde con una frase de la lista: mp3 (texto en X-Ack-Text) o solo { phrase } si la voz está silenciada.
// Modo «solo frases» (cachedOnly): únicamente variantes ya guardadas en disco; si no hay ninguna, solo texto.
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

// Túnel a Harvey: el API server solo escucha en 127.0.0.1 dentro del contenedor, así que cada conexión
// local se puentea por SSH + docker exec (data/hud/bridge.py). Nada nuevo expuesto a internet.
function openTunnel() {
  net.createServer(sock => {
    const b = spawn('ssh', [...SSH, `docker exec -i -u hermes ${CONTAINER} /opt/hermes/.venv/bin/python /opt/data/hud/bridge.py`]);
    sock.pipe(b.stdin); b.stdout.pipe(sock);
    b.stdin.on('error', () => {});
    sock.on('error', () => b.kill()); sock.on('close', () => b.kill());
    b.on('exit', () => sock.destroy());
  }).on('error', fatal).listen(TUNNEL_PORT, '127.0.0.1', () => console.log(`Túnel a Harvey listo en localhost:${TUNNEL_PORT}`));
}

// Conversación del HUD: el botón «Nueva conversación» genera otra clave (hud-xxxx); solo se aceptan claves de ese formato
const hudSession = (s) => (/^hud-[\w-]{1,40}$/.test(s || '') ? s : 'hud-escritorio');
// Cada canal tiene su propia conversación con Harvey (HUD y Claude Code no se pisan el turno)
const harvey = (path, init = {}, session = 'hud-escritorio') => fetch(`http://127.0.0.1:${TUNNEL_PORT}${path}`, {
  ...init, headers: { Authorization: `Bearer ${secrets.harvey}`, 'X-Hermes-Session-Key': session, 'Content-Type': 'application/json', ...init.headers },
});
// Genera el audio completo de cada texto (una petición a Google). Las frases cortas (saludos, confirmaciones)
// se guardan además en disco: tras la primera vez salen al instante.
const ttsMemo = new Map();
const cacheFile = (text) => text.length <= 80 && join(ACK_DIR, createHash('sha1').update(VOICE + MODEL + text).digest('hex') + '.mp3');
async function tts(text) {
  if (ttsMemo.has(text)) return ttsMemo.get(text);
  const file = cacheFile(text);
  if (file && existsSync(file)) return readFileSync(file);
  const buf = await voz(text, secrets.gemini);
  console.log(`[voz] ${text.length} caracteres generados`);
  if (file) writeFileSync(file, buf);
  else {
    ttsMemo.set(text, buf);
    if (ttsMemo.size > 30) ttsMemo.delete(ttsMemo.keys().next().value);
  }
  return buf;
}
const sendMp3 = (res, buf, extra = {}) => {
  res.writeHead(200, { 'Content-Type': tipo(buf), 'Content-Length': buf.length, 'Cache-Control': 'no-store', ...extra });
  res.end(buf);
};
// Ventanas del HUD esperando la tecla º global (tecla-global.ps1 la registra en Windows y avisa con POST /api/tecla)
const teclas = new Set();

const readBody = req => new Promise((ok, ko) => {
  let b = '';
  req.on('data', c => { b += c; if (b.length > 1e6) { ko(new Error('Petición demasiado grande')); req.destroy(); } });
  req.on('error', ko);
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { ko(e); } });
});
// Solo esta app: otra web abierta en el navegador no puede mandar órdenes a Harvey (petición entre sitios) ni leer sus datos
// apuntando su dominio a este PC (DNS rebinding). Los scripts locales (tecla-global.ps1, harvey.mjs) no mandan Origin.
const PROPIO = [`localhost:${PORT}`, `127.0.0.1:${PORT}`];
const ajeno = (req) => !PROPIO.includes(req.headers.host) || (!!req.headers.origin && !PROPIO.some((h) => req.headers.origin === `http://${h}`));
const pipe = async (upstream, res) => {
  res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (upstream.body) Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res); else res.end();
};
// Si la ventana del HUD corta un flujo, se corta también la petición a Harvey (y con ella su proceso ssh)
const untilClosed = (res) => { const ac = new AbortController(); res.on('close', () => ac.abort()); return ac.signal; };
const json = (res, obj, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const snap = { at: 0, json: '{}', pending: null };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const routes = {
  // Lanza una petición a Harvey; devuelve { run_id }
  'POST /api/ask': async (req, res) => {
    const { text, session, convo } = await readBody(req);
    if (!text?.trim()) return json(res, { error: 'Orden vacía' }, 400);
    const instructions = VOICE_RULES + (convo ? CONVO_RULES : '');
    await pipe(await harvey('/v1/runs', { method: 'POST', body: JSON.stringify({ input: text, instructions }) }, hudSession(session)), res);
  },
  // Tecla º pulsada en cualquier ventana de Windows → abre o cierra la conversación en el HUD
  'POST /api/tecla': async (req, res) => {
    for (const r of teclas) r.write('data: conversacion\n\n');
    json(res, { ok: true, ventanas: teclas.size });
  },
  'GET /api/tecla': async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write(': conectado\n\n');
    teclas.add(res); req.on('close', () => teclas.delete(res));
  },
  // Canal de Claude Code (harvey.mjs): conversación propia y respuesta completa al terminar
  'POST /api/claude': async (req, res) => {
    const { text } = await readBody(req);
    if (!text?.trim()) return json(res, { error: 'Mensaje vacío' }, 400);
    // una conversación por día, como el HUD: la de siempre llegó a arrastrar dos semanas de pruebas en cada encargo
    const sesion = 'claude-code-' + new Date().toLocaleDateString('sv-SE');
    const run = await (await harvey('/v1/runs', { method: 'POST', body: JSON.stringify({ input: text, instructions: CLAUDE_RULES }) }, sesion)).json();
    if (!run.run_id) return json(res, { error: run.error?.message || 'Harvey no aceptó el mensaje' }, 502);
    // el flujo termina al acabar la ejecución; tope de 10 min por si Harvey se queda esperando
    const sse = await (await harvey(`/v1/runs/${run.run_id}/events`, { signal: AbortSignal.timeout(600_000) }, sesion)).text();
    const done = sse.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6))).findLast(e => e.event?.startsWith('run.'));
    json(res, { ok: done?.event === 'run.completed', output: done?.output ?? done?.error ?? 'sin respuesta' });
  },
  // Detiene una petición en curso (tecla Esc en el HUD)
  'POST /api/stop': async (req, res) => {
    const { run, session } = await readBody(req);
    await pipe(await harvey(`/v1/runs/${encodeURIComponent(run)}/stop`, { method: 'POST', body: '{}' }, hudSession(session)), res);
  },
  // Eventos en directo de esa petición (texto, herramientas, subagentes, final) como SSE. Harvey numera los eventos:
  // tras un corte, el HUD los pide desde el último que vio (last_seq)
  'GET /api/events': async (req, res, url) => {
    const last = url.searchParams.get('last_seq');
    pipe(await harvey(`/v1/runs/${encodeURIComponent(url.searchParams.get('run'))}/events`,
      { signal: untilClosed(res), headers: /^\d+$/.test(last || '') ? { 'Last-Event-ID': last } : {} }, hudSession(url.searchParams.get('session'))), res);
  },
  // Estado y resultado de una orden (si el flujo se cortó mientras Harvey trabajaba)
  'GET /api/run': async (req, res, url) => pipe(await harvey(`/v1/runs/${encodeURIComponent(url.searchParams.get('run') || '')}`, {},
    hudSession(url.searchParams.get('session'))), res),
  // Texto -> voz de Harvey: mp3 entero o, con stream, en directo (empieza a sonar ~2 s antes)
  'POST /api/tts': async (req, res) => {
    const { text, stream } = await readBody(req);
    if (!text?.trim()) return json(res, { error: 'Texto vacío' }, 400);
    if (stream) return enviarEnDirecto(res, text, secrets.gemini);
    sendMp3(res, await tts(text));
  },
  // Confirmación inmediata según la orden: mp3 (cacheado en disco) con su texto en X-Ack-Text,
  // o solo el texto si la voz está silenciada.
  'POST /api/ack': async (req, res) => {
    const body = await readBody(req);
    await sendPhrase(res, ackList(body.text || ''), body);
  },
  // Frase del repositorio por tipo (saludo_tarde, espera, correo_importante...): mp3 + texto, o solo texto
  'POST /api/phrase': async (req, res) => {
    const body = await readBody(req);
    const list = frases()[body.kind];
    if (!Array.isArray(list) || typeof list[0] !== 'string') return json(res, { error: 'Tipo de frase desconocido' }, 404);
    await sendPhrase(res, list, body);
  },
  // Responde a una petición de autorización de Harvey (botones Aprobar / Rechazar del HUD)
  'POST /api/approval': async (req, res) => {
    const { run, choice, request_id, session } = await readBody(req);
    await pipe(await harvey(`/v1/runs/${encodeURIComponent(run)}/approval`, {
      method: 'POST', body: JSON.stringify({ choice, ...(request_id ? { request_id } : {}) }),
    }, hudSession(session)), res);
  },
  // Sube un archivo del señor a la carpeta de trabajo de Harvey en el VPS; devuelve su ruta allí
  'POST /api/upload': async (req, res, url) => {
    const size = +req.headers['content-length'] || 0;
    if (!size || size > 25e6) return json(res, { error: 'El archivo está vacío o supera 25 MB' }, 413);
    const name = (url.searchParams.get('name') || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(-80) || 'archivo';
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const path = `/opt/data/workspace/hud/${stamp}_${name}`; // solo [\w./-]: seguro dentro de comillas simples
    await new Promise((ok, ko) => {
      const p = spawn('ssh', [...SSH, `docker exec -i -u hermes ${CONTAINER} sh -c 'mkdir -p /opt/data/workspace/hud && cat > ${path}'`]);
      req.pipe(p.stdin);
      p.stdin.on('error', () => {});
      p.on('error', ko);
      p.on('exit', code => code === 0 ? ok() : ko(new Error(`No se pudo subir el archivo (código ${code})`)));
    });
    console.log(`[archivo] ${path} (${size} bytes)`);
    json(res, { path, size, type: req.headers['content-type'] || '' });
  },
  // Foto de agenda, correo, Notion, sistema y actividad de Harvey (vps/snapshot.py), cacheada 45 s
  'GET /api/snapshot': async (req, res) => {
    if (!snap.at || Date.now() - snap.at > 45_000) {
      snap.pending ??= new Promise((ok, ko) => execFile('ssh', [...SSH,
        `docker exec -u hermes ${CONTAINER} /opt/hermes/.venv/bin/python /opt/data/hud/snapshot.py`],
        { timeout: 60_000, maxBuffer: 4e6 }, (err, out) => err ? ko(err) : ok(out)))
        .then(out => Object.assign(snap, { at: Date.now(), json: out })).finally(() => { snap.pending = null; });
      await snap.pending;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(snap.json);
  },
  // Marca un hábito en Notion (vps/habitos.py) y devuelve la semana actualizada; también corrige la foto cacheada
  'POST /api/habito': async (req, res) => {
    const { habito, valor, fecha } = await readBody(req);
    // validación estricta: estos valores viajan dentro de una orden de ssh
    if (!['gym', 'lectura', 'instagram'].includes(habito) || !/^(si|no|nada|\d{1,4})$/.test(valor) || !/^\d{4}-\d\d-\d\d$/.test(fecha))
      return json(res, { error: 'Datos de hábito no válidos' }, 400);
    const out = await new Promise((ok, ko) => execFile('ssh', [...SSH,
      `docker exec -u hermes ${CONTAINER} /opt/hermes/.venv/bin/python /opt/data/hud/habitos.py marcar ${habito} ${valor} --fecha ${fecha}`],
      { timeout: 60_000 }, (err, stdout, stderr) => (err ? ko(new Error(stderr.trim().split('\n').at(-1) || err.message)) : ok(stdout))));
    const data = JSON.parse(out);
    try { const s = JSON.parse(snap.json); if (s.habitos) { s.habitos = { ok: true, data }; snap.json = JSON.stringify(s); } } catch {}
    json(res, data);
  },
  // Bandeja: tarjetas del equipo que esperan al señor (vps/aprobaciones.py)
  'GET /api/aprobaciones': async (req, res) => json(res, JSON.parse(await hud('aprobaciones.py', ['listar']))),
  'POST /api/aprobaciones': async (req, res) => {
    const { tablero, id, accion, texto = '' } = await readBody(req);
    // validación estricta: viajan dentro de una orden de ssh (el texto va aparte, por stdin)
    if (!/^[a-z0-9_-]{1,40}$/.test(tablero) || !/^t_[0-9a-f]{6,16}$/.test(id) || !['aprobar', 'rechazar', 'responder'].includes(accion))
      return json(res, { error: 'Datos no válidos' }, 400);
    try { json(res, JSON.parse(await hud('aprobaciones.py', ['responder', tablero, id, accion], String(texto).slice(0, 4000)))); }
    catch (e) { json(res, { error: e.message }, 400); }
  },
  // Tablero del equipo: objetivos, tarjetas por columna y la bandeja (vps/tablero.py)
  'GET /api/tablero': async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(await hud('tablero.py', ['tablero']));
  },
  // Mensaje del señor en la tarjeta de un agente (Oficina); el texto va por stdin, nunca en la orden de ssh
  'POST /api/comentario': async (req, res) => {
    const { tablero, id, texto = '' } = await readBody(req);
    if (!/^[a-z0-9_-]{1,40}$/.test(tablero) || !/^t_[0-9a-f]{6,16}$/.test(id) || !String(texto).trim()) return json(res, { error: 'Datos no válidos' }, 400);
    try { json(res, JSON.parse(await hud('tablero.py', ['comentar', tablero, id], String(texto).slice(0, 2000)))); }
    catch (e) { json(res, { error: e.message }, 400); }
  },
  // Biblioteca: las notas de la wiki y sus últimos cambios; guardar = uno de los tres formularios (vps/biblioteca.py)
  'GET /api/biblioteca': async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(await hud('biblioteca.py', ['indice']));
  },
  'POST /api/biblioteca': async (req, res) => {
    const { ruta, base, campos } = await readBody(req);
    // todo va por stdin; aun así, solo las tres clases de nota que se pueden cambiar (biblioteca.py lo vuelve a mirar)
    if (!/^(objetivos|negocio\/clientes|negocio\/linkedin)\/[\w-]{1,80}\.md$/.test(ruta) || !/^[0-9a-f]{40}$/.test(base) || typeof campos !== 'object')
      return json(res, { error: 'Datos no válidos' }, 400);
    try { json(res, JSON.parse(await hud('biblioteca.py', ['guardar'], JSON.stringify({ ruta, base, campos })))); }
    catch (e) { json(res, { error: e.message }, 400); }
  },
  // Sistema: gasto por agente y objetivo, Claude Code, tareas automáticas y avisos (vps/sistema.py)
  'GET /api/sistema': async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(await hud('sistema.py', []));
  },
  'GET /api/health': async (req, res) => pipe(await harvey('/v1/health'), res),
  // la app es la misma en el PC y en el iPhone: así sabe que está en el PC (oído de Edge, tecla º, arranque)
  'GET /api/ping': async (req, res) => json(res, { ok: true, pc: true }),
  // el iPhone avisa de si la app está a la vista (para el push); en el PC no hay push, pero la app puede avisar antes del ping
  'POST /api/visible': async (req, res) => json(res, { ok: true }),
};
// Un script de /opt/data/hud en el VPS (solo nombres y argumentos fijos o ya validados: viajan dentro de una orden de ssh)
function hud(script, args, input = '') {
  return new Promise((ok, ko) => {
    const p = execFile('ssh', [...SSH, `docker exec -i -u hermes ${CONTAINER} /opt/hermes/.venv/bin/python /opt/data/hud/${script} ${args.join(' ')}`],
      { timeout: 120_000, maxBuffer: 8e6 }, (err, stdout, stderr) => (err ? ko(new Error(stderr.trim().split('\n').at(-1) || err.message)) : ok(stdout)));
    p.stdin.end(input);
  });
}

function fatal(e) {
  // Si ya hay otro HUD encendido, este se retira sin ruido (el lanzador solo abre la ventana).
  if (e.code === 'EADDRINUSE') { console.log('Ya había un servidor del HUD encendido.'); process.exit(0); }
  throw e;
}
process.on('uncaughtException', e => console.error('[error]', e)); // un fallo puntual no tumba el HUD

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (ajeno(req)) { res.writeHead(403); return res.end(); }
  try {
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return await route(req, res, url);
    const file = join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(PUBLIC) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, { error: String(e.message || e) }, 502); else res.end();
  }
}).on('error', fatal).listen(PORT, '127.0.0.1', () => {
  console.log(`HUD de Harvey en http://localhost:${PORT}`); // el registro ya pone fecha y hora
  openTunnel();
  fetch(`http://127.0.0.1:${PORT}/api/snapshot`).catch(() => {}); // precarga: la ventana ya encuentra los datos listos
});
