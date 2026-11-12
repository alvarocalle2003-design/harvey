// Deja grabadas en la caché de voz del PC las frases de frases.json que aún no lo estén (tras editar el archivo),
// para que salgan al instante. Se las pide al HUD encendido (localhost:7777): es él quien escribe en su caché.
//   node harvey-tools/grabar-frases.mjs
// Ojo: cada frase nueva es una petición a Google y la voz tiene un tope de 100 al día (Tier 1) que comparte con las
// respuestas habladas de Harvey: si Google dice basta, para. Sin grabar funcionan igual: se graban al primer uso.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const frases = JSON.parse(readFileSync(join(import.meta.dirname, '../harvey-hud/frases.json'), 'utf8'));
const todas = [...new Set(Object.values(frases).filter(Array.isArray).flatMap((l) => l.flatMap((x) => x.frases || [x])))];
let nuevas = 0;
for (const text of todas) {
  const t0 = Date.now();
  const r = await fetch('http://127.0.0.1:7777/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!r.ok) { console.log(`Paro aquí (${nuevas} grabadas): ${(await r.text()).slice(0, 220)}`); process.exit(1); }
  await r.arrayBuffer();
  if (Date.now() - t0 > 800) { nuevas++; console.log('grabada:', text); }
}
console.log(`${todas.length} frases, todas grabadas (${nuevas} nuevas).`);
