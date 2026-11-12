// Convierte harvey-wiki/manual/MANUAL.md en la página web del manual. Uso: node construir-manual.mjs <MANUAL.md> <salida.html>
import { readFileSync, writeFileSync } from 'node:fs';
// Necesita marked 12 junto a este archivo: npm i marked@12.0.2 --prefix npm   (una vez)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { marked } = require('./npm/node_modules/marked');

const [entrada, salida] = process.argv.slice(2);
let md = readFileSync(entrada, 'utf8').replace(/\r\n/g, '\n');

// slug ASCII (las anclas con tildes no sobreviven bien en el enlace del artefacto)
const slug = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/<[^>]+>/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// cabecera: título, cita de versión e índice los pinta la página
const versión = (md.match(/^> \*\*(Versión[^*]+)\*\*/m) || [])[1] || '';
md = md.replace(/^# .*\n/, '').replace(/^> [\s\S]*?\n\n/m, '').replace(/## Índice\n[\s\S]*?\n---\n/, '');
// enlaces internos al mismo slug que los títulos
md = md.replace(/\]\(#([^)]+)\)/g, (_, a) => `](#${slug(decodeURIComponent(a).replace(/-/g, ' '))})`);

const toc = [];
const renderer = new marked.Renderer();
renderer.heading = (text, level, raw) => {
  const id = slug(raw);
  if (level === 2) toc.push({ id, text: raw });
  return `<h${level} id="${id}">${text}</h${level}>\n`;
};
renderer.code = (code, lang) => lang === 'mermaid'
  ? `<figure class="diagrama"><pre class="mermaid">${esc(code)}</pre></figure>\n`
  : `<pre class="bloque"><code>${esc(code)}</code></pre>\n`;
renderer.table = (header, body) => `<div class="tabla"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>\n`;
renderer.image = (href, title, text) => `<figure class="captura"><img src="${href}" alt="${esc(text)}" loading="lazy"></figure>`;
renderer.hr = () => '';
marked.use({ renderer, gfm: true });

// las secciones van en <section> para separarlas con aire
const cuerpo = marked.parse(md).split(/(?=<h2 )/).map((s) => s.trim() ? `<section>${s}</section>` : '').join('\n');
const indice = toc.map((t) => `<li><a href="#${t.id}">${esc(t.text).replace(/^(\d+)\. /, '<span>$1</span>')}</a></li>`).join('');
const plantilla = readFileSync(new URL('./manual-plantilla.html', import.meta.url), 'utf8');
writeFileSync(salida, plantilla.replace('{{VERSION}}', esc(versión)).replace('{{INDICE}}', indice).replace('{{CUERPO}}', cuerpo));
console.log(`ok: ${toc.length} secciones, ${(cuerpo.length / 1024).toFixed(0)} KB`);
