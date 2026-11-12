// Mide la latencia de Harvey con órdenes triviales. Modo «pc» (por el HUD del PC y el túnel) o «directo» (gateway en el contenedor).
// Uso: node harvey-tools/mide-latencia.mjs pc  |  ssh … "docker exec -i <contenedor> node --input-type=module - directo" < harvey-tools/mide-latencia.mjs
import { readFileSync } from 'node:fs';
const modo = process.argv[2] || 'pc';
const ORDENES = ['Di solo: listo.', '¿Cuánto es dos más dos? Contesta en una palabra.', 'Di solo: hola, señor.'];
const ses = 'hud-prueba-medida-' + Date.now().toString(36);
let base, h = { 'Content-Type': 'application/json' };
if (modo === 'pc') base = 'http://127.0.0.1:7777';
else {
  base = 'http://127.0.0.1:8642';
  const k = readFileSync('/opt/data/.env', 'utf8').match(/^API_SERVER_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
  h = { ...h, Authorization: `Bearer ${k}`, 'X-Hermes-Session-Key': ses };
}
const s = (t0) => ((performance.now() - t0) / 1000).toFixed(2);
for (const texto of ORDENES) {
  const t0 = performance.now();
  const r = modo === 'pc'
    ? await fetch(base + '/api/ask', { method: 'POST', headers: h, body: JSON.stringify({ text: texto, session: ses, convo: true }) })
    : await fetch(base + '/v1/runs', { method: 'POST', headers: h, body: JSON.stringify({ input: texto }) });
  const { run_id } = await r.json();
  const tRun = s(t0);
  const ev = await fetch(modo === 'pc' ? `${base}/api/events?run=${run_id}&session=${ses}` : `${base}/v1/runs/${run_id}/events`, { headers: h });
  const dec = new TextDecoder(); let buf = '', primero = null, fin = null, salida = '', tipos = [];
  for await (const c of ev.body) {
    buf += dec.decode(c, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!l.startsWith('data: ')) continue;
      let e; try { e = JSON.parse(l.slice(6)); } catch { continue; }
      if (e.event !== 'message.delta' && tipos.length < 12) tipos.push(`${e.event}@${s(t0)}`);
      if (e.event === 'message.delta') { primero ??= s(t0); salida += e.delta ?? ''; }
      if (e.event?.startsWith('run.') && e.event !== 'run.started') { fin = s(t0); salida ||= e.output ?? ''; }
    }
    if (fin) break;
  }
  let voz = '-';
  if (modo === 'pc') { // primer sonido: primer trozo de audio del /api/tts en directo
    const t1 = performance.now();
    const a = await fetch(base + '/api/tts', { method: 'POST', headers: h, body: JSON.stringify({ text: salida.slice(0, 80) || 'Listo, señor.', stream: true }) });
    for await (const _ of a.body) { voz = s(t1); break; }
    a.body.cancel?.().catch(() => {});
  }
  console.log(JSON.stringify({ texto, run_id_s: tRun, primer_delta_s: primero, completado_s: fin, primer_audio_s: voz, salida: salida.slice(0, 60), eventos: tipos }));
}
console.log('sesion', ses);
