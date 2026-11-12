// Voz de Harvey: Gemini TTS de Google con la voz diseñada «harvey_v2». Pieza única para el HUD del PC, la app del
// móvil, Siri y las notas de voz de Telegram (Hermes la usa como proveedor «command»).
// Como programa (Telegram): node voz.mjs entrada.txt salida.mp3   (la clave se lee de /opt/data/.env)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

export const VOICE = 'voice_yej0xv7cqw37', MODEL = 'gemini-3.8-flash-tts';

// Nada de enlaces, correos, símbolos de formato, viñetas ni emojis en voz alta: el señor no quiere oírlos nunca.
// Cada línea se cierra con punto para que una lista suene como frases y no como una ristra de palabras.
export const hablable = (text) => String(text || '').replace(/\[FIN\]/g, '').split('\n')
  .map((l) => l.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')             // [texto](enlace) → texto
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')                       // enlaces
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '')                          // direcciones de correo
    .replace(/\p{Extended_Pictographic}|[️✓✔✗✘☐☑]/gu, '')       // emojis y marcas
    .replace(/^\s*(?:[-*•–>]+|\d+[.)])\s+/, '')                       // viñetas y listas numeradas
    .replace(/\s*[→⇒➜►▶·]\s*/g, ', ').replace(/&/g, ' y ')
    .replace(/[*_#`|~^<>{}[\]\\=]+/g, ' ')                            // símbolos de formato
    .replace(/\s+/g, ' ').trim())
  .filter((l) => l && !/^[-–—\s]+$/.test(l))
  .map((l) => (/[.!?…:;,]$/.test(l) ? l : l + '.'))
  .join(' ').replace(/\s+([,.;:!?])/g, '$1').replace(/,([.!?])/g, '$1').trim();

// La respuesta trae el audio en algún bloque { type: 'audio', data }: se busca sin depender del anidamiento exacto
const audioData = (o) => {
  if (Array.isArray(o)) return o.map(audioData).filter(Boolean).at(-1);
  if (!o || typeof o !== 'object') return null;
  return o.type === 'audio' && o.data ? o.data : audioData(Object.values(o));
};

// Google entrega WAV; con ffmpeg (PC y VPS lo tienen) pasa a mp3, diez veces más ligero para el móvil
const aMp3 = (wav) => new Promise((ok) => {
  const p = spawn('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-b:a', '96k', '-f', 'mp3', 'pipe:1']), out = [];
  p.stdout.on('data', (d) => out.push(d));
  p.on('error', () => ok(wav)); // sin ffmpeg se queda en WAV, que también suena
  p.on('close', (code) => ok(code === 0 && out.length ? Buffer.concat(out) : wav));
  p.stdin.on('error', () => {});
  p.stdin.end(wav);
});
export const tipo = (buf) => (buf.subarray(0, 4).toString() === 'RIFF' ? 'audio/wav' : 'audio/mpeg');

async function pedir(text, key, stream = false) {
  if (!key) throw new Error('Falta la clave de Gemini para la voz');
  for (let intento = 0; ; intento++) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions' + (stream ? '?alt=sse' : ''), {
      method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, ...(stream && { stream: true }),
        input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: 'calm and courteous' }] }] }],
        response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: VOICE }] },
      }),
    });
    if (r.status === 429 && intento < 3) { // tope de Google: 10 por minuto
      console.error(`[voz] Google dice «demasiadas peticiones»: reintento ${intento + 1} en 15 s`);
      await new Promise((ok) => setTimeout(ok, 15_000)); continue;
    }
    if (!r.ok) throw new Error(`Voz de Google ${r.status}: ${(await r.text()).replace(/AIza[\w-]+/g, '<clave>').slice(0, 200)}`);
    return r;
  }
}

export async function tts(text, key) {
  const t = hablable(text);
  if (!t) throw new Error('No hay nada que decir en voz alta');
  const data = audioData(await (await pedir(t, key)).json());
  if (!data) throw new Error('Google no ha devuelto audio');
  return aMp3(Buffer.from(data, 'base64'));
}

// En directo: suelta el audio (PCM 16 bits little-endian, 24 kHz, mono) según Google lo genera. El primer trozo
// llega a ~2,5 s en vez de esperar ~5 s a la frase entera. Google lo manda como eventos SSE «step.delta».
export const PCM_TYPE = 'audio/L16;rate=24000;channels=1';
export async function* ttsStream(text, key) {
  const t = hablable(text);
  if (!t) return;
  const r = await pedir(t, key, true), dec = new TextDecoder();
  let buf = '', i;
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const data = buf.slice(0, i).match(/^data: (\{.*)$/m)?.[1];
      buf = buf.slice(i + 2);
      const delta = data && JSON.parse(data).delta;
      if (delta?.type === 'audio') yield Buffer.from(delta.data, 'base64');
    }
  }
}
// Sirve la voz en directo por una respuesta HTTP (HUD del PC y app del móvil). Si Google falla antes del primer
// trozo, el error sale como siempre (502); si el oyente corta (Esc), se deja de pedir a Google.
export async function enviarEnDirecto(res, text, key) {
  const t0 = Date.now(), it = ttsStream(text, key), first = await it.next();
  res.writeHead(200, { 'Content-Type': PCM_TYPE, 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  if (!first.done) res.write(first.value);
  console.log(`[voz] directo ${text.length} caracteres, primer sonido en ${Date.now() - t0} ms`);
  for await (const c of it) { if (res.destroyed) break; res.write(c); }
  res.end();
}

if (import.meta.main) {
  const [entrada, salida] = process.argv.slice(2);
  const key = readFileSync('/opt/data/.env', 'utf8').match(/^GEMINI_API_KEY=(.*)$/m)?.[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  writeFileSync(salida, await tts(readFileSync(entrada, 'utf8'), key));
}
