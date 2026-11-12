// Compara el código de Harvey de este PC con lo desplegado en el servidor y sube lo cambiado con copia previa.
//   node harvey-tools/desplegar.mjs                  → tabla: igual / DISTINTO / FALTA en el servidor
//   node harvey-tools/desplegar.mjs subir <archivo…> → sube esos archivos (rutas locales); antes guarda la versión del
//        servidor en /opt/data/backups/despliegue/<fecha>/ y se niega si el servidor tiene un cambio que no está aquí
//        (su versión no es ni la local ni la del último commit) salvo con --forzar.
//   node harvey-tools/desplegar.mjs --prueba         → autoprueba del mapa de rutas, sin red
// Tras subir: movil/server.mjs necesita `s6-svc -r /run/service/harvey-movil`; el resto se lee en cada uso.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import assert from 'node:assert/strict';

const RAIZ = join(import.meta.dirname, '..');
const SSH = ['-i', join(process.env.USERPROFILE, '.ssh', 'hermes_vps'), '-o', 'ConnectTimeout=10', 'root@72.60.46.112'];
const DATOS = '/docker/hermes-agent-ndkm/data'; // = /opt/data dentro del contenedor

// Ruta local (con «/», desde la carpeta Claude) → ruta dentro del contenedor, o null si no se despliega
export function destino(p) {
  const m = (re) => p.match(re);
  let x;
  if ((x = m(/^harvey-hud\/vps\/([^/]+\.py)$/))) return '/opt/data/hud/' + x[1];
  if ((x = m(/^harvey-hud\/movil\/(server\.mjs|push\.mjs|voz\.mjs|transcribir\.py|frases\.json|disparadores\.json|prueba-push\.mjs|prueba-voz\.mjs)$/))) return '/opt/data/hud/movil/' + x[1];
  if ((x = m(/^harvey-hud\/app\/(.+)$/))) return '/opt/data/hud/movil/public/' + x[1];
  if ((x = m(/^harvey-tools\/cron\/(informe_hoy\.py|prompt_\w+\.txt)$/))) return '/opt/data/hud/' + x[1];
  if ((x = m(/^harvey-tools\/cron\/skill-informe\/SKILL\.md$/))) return '/opt/data/skills/productivity/informe-matutino/SKILL.md';
  if ((x = m(/^harvey-tools\/cron\/([^/]+\.(?:py|sh))$/))) return '/opt/data/scripts/' + x[1];
  if ((x = m(/^harvey-tools\/equipo\/(equipo\.py|prueba_claude_encargo\.py|ficha-senor\.md)$/))) return '/opt/data/hud/' + x[1];
  if ((x = m(/^harvey-tools\/bin\/([^/]+)$/))) return '/opt/data/bin/' + x[1];
  if ((x = m(/^harvey-tools\/skills\/([\w-]+)\/SKILL\.md$/))) return `/opt/data/skills/productivity/${x[1]}/SKILL.md`;
  if (p === 'harvey-tools/skills/claude-code-harvey.CLAUDE.md') return '/opt/data/home/.claude/CLAUDE.md';
  if ((x = m(/^harvey-tools\/prospeccion\/(.+)$/))) return '/opt/data/skills/productivity/prospeccion-comercial/' + x[1];
  if (p === 'harvey-tools/vivo/SOUL.md') return '/opt/data/SOUL.md';
  return null;
}
// El SOUL de Harvey lleva un bloque que reescribe equipo.py desde la wiki: no cuenta como diferencia
const SIN_BLOQUE = String.raw`/<!-- equipo:inicio/,/<!-- equipo:fin -->/d`;
const normal = (p, buf) => (p.endsWith('SOUL.md') ? Buffer.from(buf.toString('utf8').replace(/<!-- equipo:inicio[\s\S]*?<!-- equipo:fin -->\n?/, '')) : buf);
const sha = (buf) => createHash('sha1').update(buf).digest('hex');
const ejecutable = (d) => d.startsWith('/opt/data/bin/') || d.endsWith('.sh');

function archivos(dir) {
  return readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    return e.isDirectory() ? archivos(p) : [p];
  });
}
const local = () => ['harvey-hud', 'harvey-tools'].flatMap(archivos).map((p) => [p, destino(p)]).filter(([, d]) => d);

// Una sola conexión: huella de cada archivo del servidor (FALTA si no existe)
function remotas(destinos) {
  const guion = destinos.map((d) => {
    const f = DATOS + d.slice('/opt/data'.length);
    const h = d.endsWith('SOUL.md') ? `sed '${SIN_BLOQUE}' '${f}' | sha1sum` : `sha1sum < '${f}'`;
    return `if [ -f '${f}' ]; then ${h} | cut -c1-40; else echo FALTA; fi`;
  }).join('\n');
  const out = execFileSync('ssh', [...SSH, 'bash -s'], { input: guion, encoding: 'utf8', maxBuffer: 8e6 }).trim().split('\n');
  assert.equal(out.length, destinos.length, 'respuesta incompleta del servidor');
  return out;
}
const enCommit = (p) => { // versión del último commit del repositorio «harvey» (null si no está)
  try { return execFileSync('sh', [join(RAIZ, 'harvey-tools/repo.sh'), 'show', `HEAD:${p}`], { cwd: RAIZ, maxBuffer: 8e6, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return null; }
};

function comparar() {
  const pares = local(), hs = remotas(pares.map(([, d]) => d));
  let distintos = 0;
  pares.forEach(([p, d], i) => {
    const l = sha(normal(p, readFileSync(join(RAIZ, p))));
    const estado = hs[i] === 'FALTA' ? 'FALTA' : hs[i] === l ? 'igual' : 'DISTINTO';
    if (estado !== 'igual') { distintos++; console.log(`${estado.padEnd(9)} ${p}  →  ${d}`); }
  });
  console.log(`\n${pares.length} archivos comparados; ${pares.length - distintos} iguales, ${distintos} con diferencias.`);
}

function subir(rutas, forzar) {
  const pares = rutas.map((r) => {
    const p = relative(RAIZ, join(process.cwd(), r)).split(sep).join('/'), d = destino(p);
    if (!d) throw new Error(`No sé dónde va ${p} en el servidor`);
    return [p, d];
  });
  const hs = remotas(pares.map(([, d]) => d)), fecha = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  for (const [[p, d], h] of pares.map((x, i) => [x, hs[i]])) {
    const buf = readFileSync(join(RAIZ, p)), viejo = enCommit(p);
    if (h === sha(normal(p, buf))) { console.log(`igual     ${p}`); continue; }
    if (h !== 'FALTA' && !forzar && !(viejo && h === sha(normal(p, viejo)))) {
      console.log(`NO SUBO   ${p}: el servidor tiene un cambio que no está en este PC (tráigalo o use --forzar)`); continue;
    }
    const f = DATOS + d.slice('/opt/data'.length), copia = `${DATOS}/backups/despliegue/${fecha}${d.slice('/opt/data'.length)}`;
    const guion = `set -e; t=$(mktemp); cat > "$t"
      if [ -f '${f}' ]; then install -D -o 10000 -g 10000 -m 600 '${f}' '${copia}'; fi
      install -D -o 10000 -g 10000 -m ${ejecutable(d) ? 755 : 644} "$t" '${f}'; rm -f "$t"`;
    execFileSync('ssh', [...SSH, guion], { input: buf });
    console.log(`subido    ${p}  →  ${d}${h === 'FALTA' ? ' (nuevo)' : ''}`);
  }
}

function prueba() {
  assert.equal(destino('harvey-hud/vps/tareas.py'), '/opt/data/hud/tareas.py');
  assert.equal(destino('harvey-hud/app/arte/LEEME.txt'), '/opt/data/hud/movil/public/arte/LEEME.txt');
  assert.equal(destino('harvey-hud/movil/server.mjs'), '/opt/data/hud/movil/server.mjs');
  assert.equal(destino('harvey-hud/movil/docker-compose.yml'), null);
  assert.equal(destino('harvey-tools/cron/informe_hoy.py'), '/opt/data/hud/informe_hoy.py');
  assert.equal(destino('harvey-tools/cron/wiki_sync.sh'), '/opt/data/scripts/wiki_sync.sh');
  assert.equal(destino('harvey-tools/cron/prompt_cartero.txt'), '/opt/data/hud/prompt_cartero.txt');
  assert.equal(destino('harvey-tools/bin/claude'), '/opt/data/bin/claude');
  assert.equal(destino('harvey-tools/skills/foto-rapida/SKILL.md'), '/opt/data/skills/productivity/foto-rapida/SKILL.md');
  assert.equal(destino('harvey-tools/auditoria/aplicar-hoy.ps1'), null);
  assert.equal(normal('x/SOUL.md', Buffer.from('a\n<!-- equipo:inicio x -->\nb\n<!-- equipo:fin -->\nc\n')).toString(), 'a\nc\n');
  assert.ok(ejecutable('/opt/data/bin/claude') && ejecutable('/opt/data/scripts/wiki_sync.sh') && !ejecutable('/opt/data/hud/tareas.py'));
  console.log('OK: mapa de rutas');
}

const [orden, ...resto] = process.argv.slice(2);
if (orden === '--prueba') prueba();
else if (orden === 'subir') subir(resto.filter((r) => r !== '--forzar'), resto.includes('--forzar'));
else comparar();
