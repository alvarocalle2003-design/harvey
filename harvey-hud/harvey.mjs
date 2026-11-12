// Canal Claude Code -> Harvey. Uso: node harvey-hud/harvey.mjs "mensaje para Harvey"
// Necesita el servidor del HUD encendido (arranca solo con Windows). Imprime la respuesta de Harvey.
const text = process.argv.slice(2).join(' ').trim();
if (!text) { console.error('Uso: node harvey.mjs "mensaje para Harvey"'); process.exit(2); }
try {
  const r = await fetch('http://127.0.0.1:7777/api/claude', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
  });
  const j = await r.json();
  console.log(j.output ?? j.error);
  process.exit(j.ok ? 0 : 1);
} catch (e) {
  console.error('No se pudo contactar con el HUD de Harvey (¿está encendido?):', e.message);
  process.exit(1);
}
