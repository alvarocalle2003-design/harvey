// HUD de Harvey: servidor local (solo 127.0.0.1) de la ventana del PC. Hace solo lo que no puede hacer el servidor:
// servir la app, la tecla º global y la voz con su caché en disco. Todo lo demás (órdenes, datos, tablero, biblioteca…)
// lo atiende el servidor de la app en el VPS (movil/server.mjs, mismas rutas) y llega por UN túnel SSH fijo.
// Antes cada dato abría su propio ssh + docker exec: 18.000 conexiones al día y sesiones colgadas (auditoría 11/11).
// Sin dependencias: node server.mjs
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync, renameSync, createWriteStream } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { homedir } from 'node:os';
import { format } from 'node:util';
import { createHash } from 'node:crypto';
import { tts as voz, tipo, enviarEnDirecto, VOICE, MODEL } from './movil/voz.mjs'; // la misma voz que el móvil, Siri y Telegram

// PORT y TUNNEL_PORT por variable de entorno solo para pruebas (una copia gemela al lado del HUD de verdad)
const PORT = +process.env.PORT || 7777, TUNNEL_PORT = +process.env.TUNNEL_PORT || 18790;
const SSH = ['-i', join(homedir(), '.ssh', 'hermes_vps'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'root@72.60.46.112'];
// Voz en vivo: Gemini Live solo trae voces prediseñadas (la harvey_v2 a medida no vale aquí); Charon = grave y sobria
const VIVO_MODELO = 'models/gemini-3.8-live', VIVO_VOZ = 'Charon';
const CONTAINER = 'hermes-agent-ndkm-hermes-agent-1', APP_PORT = +process.env.APP_PORT || 7790; // entrada del PC del servidor de la app
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

// ---------- Túnel fijo al servidor de la app ----------
// Un solo ssh -N -L que vive mientras viva el HUD; si se cae (sin red, reinicio del VPS) se reabre solo con espera
// creciente. La IP del contenedor se pregunta al abrirlo (cambia si se recrea). Lo que pase mientras está caído
// devuelve 502 y la app enseña «sin señal», como antes.
let tunel = null, espera = 1000;
function abrirTunel() {
  execFile('ssh', [...SSH, `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' ${CONTAINER}`],
    { timeout: 20_000 }, (err, out) => {
      const ip = !err && out.trim().split(/\s+/)[0];
      if (!ip) { console.error('[túnel] no encuentro el contenedor:', err?.message || out); return reintentar(); }
      tunel = spawn('ssh', [...SSH.slice(0, -1), '-N', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15',
        '-o', 'ServerAliveCountMax=3', '-L', `127.0.0.1:${TUNNEL_PORT}:${ip}:${APP_PORT}`, SSH.at(-1)], { stdio: ['ignore', 'ignore', 'pipe'] });
      const abierto = Date.now();
      tunel.stderr.on('data', (d) => console.error('[túnel]', String(d).trim()));
      tunel.on('exit', (code) => {
        tunel = null;
        if (Date.now() - abierto > 60_000) espera = 1000; // vivió un rato: no era un fallo de arranque
        console.log(`[túnel] cerrado (código ${code}); lo reabro en ${espera / 1000} s`);
        reintentar();
      });
      console.log(`Túnel al servidor de la app listo en localhost:${TUNNEL_PORT} → ${ip}:${APP_PORT}`);
    });
}
// Si el HUD se cerró a la fuerza, su ssh puede seguir vivo con el puerto: si contesta, sirve y no se abre otro.
// shortcut: un túnel huérfano que apunte a una IP vieja (contenedor recreado) no se mata solo; reiniciar el PC o matar ssh.exe.
async function reintentar() {
  const vivo = await fetch(`http://127.0.0.1:${TUNNEL_PORT}/api/ping`, { headers: { Authorization: `Bearer ${secrets.harvey}` },
    signal: AbortSignal.timeout(5000) }).then((r) => r.ok).catch(() => false);
  if (vivo) return setTimeout(reintentar, 60_000);
  setTimeout(abrirTunel, espera); espera = Math.min(espera * 2, 60_000);
}
for (const s of ['exit', 'SIGINT', 'SIGTERM']) process.on(s, () => { tunel?.kill(); if (s !== 'exit') process.exit(0); });

// Reenvía la petición tal cual (método, cuerpo en flujo, consulta) y devuelve la respuesta en flujo (también SSE)
async function reenvia(req, res, url) {
  const headers = { Authorization: `Bearer ${secrets.harvey}` };
  for (const h of ['content-type', 'content-length', 'last-event-id']) if (req.headers[h]) headers[h] = req.headers[h];
  const ac = new AbortController();
  res.on('close', () => ac.abort()); // la ventana corta un flujo → se corta también aquí
  const conCuerpo = !['GET', 'HEAD'].includes(req.method);
  const r = await fetch(`http://127.0.0.1:${TUNNEL_PORT}${url.pathname}${url.search}`, {
    method: req.method, headers, signal: ac.signal, ...(conCuerpo ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
  });
  res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  if (r.body) Readable.fromWeb(r.body).on('error', () => res.end()).pipe(res); else res.end();
}

// ---------- Voz (en el PC: la caché de frases vive en disco aquí) ----------
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
const json = (res, obj, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

// Lo que se atiende aquí; cualquier otra ruta /api/… va al servidor de la app por el túnel
const routes = {
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
  // Conversación en vivo (app/vivo.js): token de Gemini Live de UN uso y 1 minuto para abrirla, atado al modelo.
  // La ventana habla directamente con Google con él; la clave de Gemini no sale de este servidor.
  'POST /api/vivo-token': async (req, res) => {
    const ahora = Date.now();
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST', headers: { 'x-goog-api-key': secrets.gemini, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uses: 1, expireTime: new Date(ahora + 20 * 60_000).toISOString(),
                // sin bidiGenerateContentSetup: si el token fija la configuración, Google ignora la de la ventana (instrucciones y herramienta)
        newSessionExpireTime: new Date(ahora + 60_000).toISOString() }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.name) return json(res, { error: j.error?.message || `Google respondió ${r.status}` }, 502);
    json(res, { token: j.name, model: VIVO_MODELO, voice: VIVO_VOZ });
  },
  // la app es la misma en el PC y en el iPhone: así sabe que está en el PC (oído de Edge, tecla º, arranque)
  'GET /api/ping': async (req, res) => json(res, { ok: true, pc: true }),
  // el iPhone avisa de si la app está a la vista (para el push); en el PC no hay push
  'POST /api/visible': async (req, res) => json(res, { ok: true }),
};

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
    if (url.pathname.startsWith('/api/')) return await reenvia(req, res, url);
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
  abrirTunel();
});
