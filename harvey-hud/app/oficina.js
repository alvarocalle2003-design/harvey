// Oficina de Harvey: la planta vista desde arriba en pixel art, con los agentes moviéndose según lo que pasa de verdad en los
// tableros (vps/tablero.py, el mismo dato que el Tablero). Plano y reglas: diseno/nuevo-hud.html § 2.2.
// Arte: «Modern Interiors» de LimeZu, versión gratuita (app/arte/, uso no comercial; ver arte/LEEME.txt). Dibujado aquí a
// mano, a juego con LimeZu: la vista de la ría con el Puente Colgante, Las Arenas y Portugalete; las sillas de oficina, el
// buzón, la encimera, la cafetera, el caballete, el micro y las letras. Si el arte no carga, se ven los dibujos sencillos.
// Lo usa hud.js: Oficina.datos(tablero), Oficina.sinSenal(sí/no). Usa de hud.js: AG, LIBRE, libreDe, toolLabel, lapso, ago,
// esc, api, live, lastSnap, tb, toast, load, save, audioCtx.
window.Oficina = (() => {
  const T = 16, COLS = 30, FILAS = 20, W = COLS * T, H = FILAS * T;
  // X = pared de los ventanales (por ellos se ve la ría) · W = su zócalo · # = pared · d = puerta · letras = suelo de cada sala
  const MAPA = [
    'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    '#aaaaaaaa#bbbbbbbbbb#cccccccc#',
    '#aaaaaaaa#bbbbbbbbbb#cccccccc#',
    '#aaaaaaaadbbbbbbbbbbdcccccccc#',
    '#aaaaaaaa#bbbbbbbbbb#cccccccc#',
    '#aaaaaaaa#bbbbbbbbbb#cccccccc#',
    '####dd#######dd#######dd######',
    '#eeeeeeee#ffffffffff#gggggggg#',
    '#eeeeeeee#ffffffffff#gggggggg#',
    '#eeeeeeeedffffffffffdgggggggg#',
    '#eeeeeeee#ffffffffff#gggggggg#',
    '#eeeeeeee#ffffffffff#gggggggg#',
    '####dd#######dd#######dd######',
    '#hhhhhhhhhhhhhhhhhhhhhhhhhhhh#',
    '#hhhhhhhhhhhhhhhhhhhhhhhhhhhh#',
    '##############################',
  ];
  const SALAS = {
    a: ['Dirección', '#3D4A57'], b: ['Reuniones', '#55503F'], c: ['Negocio', '#5A4636'], e: ['Producción', '#41513F'],
    f: ['Calidad y biblioteca', '#4B4560'], g: ['Cocina', '#5C4A3E'], h: ['Su buzón', '#4A3F33'],
  };
  // piezas de LimeZu: [x, y, ancho, alto] en píxeles de Interiors_free_16x16.png, medidas por sus píxeles no transparentes
  // (muchas no encajan en casillas de 16 px; recortarlas por casillas las dejaba cortadas)
  const P = {
    mesa: [80, 885, 32, 21], mesaOsc: [80, 949, 32, 21], mesaReu: [93, 161, 38, 37],
    sillaFr: [64, 341, 16, 26], sillaDer: [146, 497, 13, 21], sillaIzq: [145, 529, 13, 21], sillaEsp: [65, 497, 14, 14],
    palmera: [213, 704, 23, 31], arbol: [167, 713, 18, 31], arbusto: [193, 722, 14, 23], maceta: [2, 790, 12, 14],
    estA: [80, 224, 32, 33], estB: [80, 257, 32, 31], pizarra: [160, 640, 31, 25], nevera: [192, 641, 15, 31],
    frutero: [0, 890, 16, 22], sofa: [16, 1157, 48, 27], sofaBlanco: [64, 1157, 48, 27], alfombra: [114, 244, 60, 40], cuadro: [130, 330, 28, 13],
    acuario: [6, 330, 21, 14], corcho: [3, 656, 26, 13], globo: [193, 1057, 13, 21], lampara: [176, 887, 15, 25],
    monitor: [48, 58, 13, 11],
  };
  // Muebles en casillas: x, y, w, h es lo que corta el paso (salvo «pisable»); p es la pieza de LimeZu (P) y d la dibujada a
  // mano (DIBUJO). Se dibujan centrados en su hueco y apoyados en su borde de abajo; o = ajuste en píxeles. Capa «suelo»
  // (alfombras) y «pared» (colgado en la cara de la pared) van al fondo; lo demás se ordena con los agentes por sus pies.
  const MUEBLES = [
    // Dirección
    { t: 'alfombra', x: 2, y: 7, w: 4, h: 3, p: 'alfombra', capa: 'suelo', pisable: true },
    { t: 'mesa', x: 3, y: 6, w: 2, p: 'mesa', de: 'default', cosa: 'papeles' },
    { t: 'planta', x: 1, y: 9, p: 'palmera', o: [5, 0] }, { t: 'lampara', x: 8, y: 5, p: 'lampara', o: [-1, 0] },
    { t: 'globo', x: 1, y: 6, p: 'globo', o: [1, 0] },
    // Reuniones: la pizarra de objetivos y la mesa con sus sillas
    { t: 'pizarra', x: 11, y: 6, w: 2, p: 'pizarra' }, { t: 'mesareu', x: 14, y: 6, w: 3, h: 2, p: 'mesaReu' },
    { t: 'silla', x: 14, y: 5, p: 'sillaFr', o: [6, 0] }, { t: 'silla', x: 16, y: 5, p: 'sillaFr', o: [-6, 0] },
    { t: 'silla', x: 14, y: 8, p: 'sillaEsp', o: [6, -2] }, { t: 'silla', x: 16, y: 8, p: 'sillaEsp', o: [-6, -2] },
    { t: 'silla', x: 13, y: 7, p: 'sillaDer', o: [4, -2] }, { t: 'silla', x: 17, y: 7, p: 'sillaIzq', o: [-4, -2] },
    { t: 'planta', x: 19, y: 9, p: 'arbol', o: [-2, 0] },
    // Negocio
    { t: 'mesa', x: 22, y: 6, w: 2, p: 'mesa', de: 'jordan', cosa: 'plantita' }, { t: 'mesa', x: 26, y: 6, w: 2, p: 'mesa', de: 'eco', cosa: 'papeles' },
    { t: 'caballete', x: 28, y: 8, d: 'caballete' }, { t: 'micro', x: 21, y: 9, d: 'micro' }, { t: 'planta', x: 28, y: 5, p: 'arbusto' },
    // Producción
    { t: 'mesa', x: 2, y: 12, w: 2, p: 'mesa', de: 'sherlock', cosa: 'libros' }, { t: 'globo', x: 1, y: 12, p: 'globo', o: [1, 0] },
    { t: 'mesa', x: 5, y: 12, w: 3, d: 'mesaLarga', de: 'leonardo', pantallas: 3 },
    { t: 'corcho', x: 7, y: 10, p: 'corcho', capa: 'pared' }, { t: 'planta', x: 1, y: 15, p: 'arbusto', o: [2, 0] },
    // Calidad y biblioteca
    { t: 'mesa', x: 11, y: 12, w: 2, p: 'mesaOsc', de: 'lince', cosa: 'papeles' },
    { t: 'estanteria', x: 15, y: 11, w: 2, p: 'estA' }, { t: 'estanteria', x: 17, y: 11, w: 2, p: 'estB' },
    { t: 'mesa', x: 17, y: 13, w: 2, p: 'mesaOsc', de: 'tomo', cosa: 'libros' }, { t: 'planta', x: 19, y: 15, p: 'maceta' },
    // Cocina
    { t: 'nevera', x: 24, y: 11, p: 'nevera', o: [0, 2] }, { t: 'cocina', x: 25, y: 11, w: 2, d: 'encimera', o: [0, 2] },
    { t: 'frutero', x: 28, y: 12, p: 'frutero' }, { t: 'sofa', x: 25, y: 14, w: 3, p: 'sofa' }, { t: 'planta', x: 21, y: 15, p: 'maceta' },
    // Su buzón
    { t: 'buzon', x: 16, y: 17, d: 'buzon' }, { t: 'planta', x: 1, y: 18, p: 'palmera', o: [5, 0] }, { t: 'planta', x: 28, y: 18, p: 'arbol', o: [-2, 0] },
    { t: 'cuadro', x: 6, y: 16, w: 2, p: 'cuadro', capa: 'pared' }, { t: 'banco', x: 9, y: 17, w: 3, p: 'sofaBlanco' },
    { t: 'cuadro', x: 19, y: 16, p: 'acuario', capa: 'pared' }, { t: 'planta', x: 20, y: 17, p: 'maceta' },
  ];
  // sitios: [casilla x, casilla y, hacia dónde mira]
  // Harvey se sienta detrás de su mesa, de cara (se le ven las gafas); los demás, de espaldas en la suya
  const CASA = { default: [4, 5, 'down'], jordan: [22, 7, 'up'], eco: [26, 7, 'up'], sherlock: [2, 13, 'up'], leonardo: [6, 13, 'up'],
    lince: [11, 13, 'up'], tomo: [17, 14, 'up'] };
  const SITIO = {
    reunion: [11, 7, 'up'], caballete: [27, 8, 'right'], micro: [22, 9, 'left'], estanteria: [16, 12, 'up'], buzon: [15, 17, 'right'],
  };
  // los sitios libres, con el mismo texto que la lista del equipo (hud.js: LIBRE)
  const LUGARES = { 'en la cocina': [[25, 12, 'up'], [26, 12, 'up'], [24, 12, 'up']], 'mirando la ría': [[13, 5, 'up'], [18, 5, 'up'], [25, 5, 'up'], [24, 5, 'up']],
    'en el sofá': [[25, 15, 'down'], [26, 15, 'down'], [27, 15, 'down']], 'tomando un café': [[28, 13, 'up'], [27, 12, 'right'], [27, 13, 'right']] };
  const ORDEN = ['default', 'sherlock', 'jordan', 'eco', 'leonardo', 'lince', 'tomo'];
  // cada mesa con dueño lleva su silla de oficina donde se sienta
  for (const m of MUEBLES.filter((x) => x.de && x.de !== 'default')) MUEBLES.push({ t: 'sillaof', x: CASA[m.de][0], y: CASA[m.de][1], d: 'silla', pisable: true });

  const pisa = MAPA.map((fila) => [...fila].map((c) => /[a-hd]/.test(c)));
  for (const m of MUEBLES) if (!m.pisable && !m.capa) for (let i = 0; i < (m.w || 1); i++) for (let j = 0; j < (m.h || 1); j++) pisa[m.y + j][m.x + i] = false;
  const sala = (x, y) => MAPA[y]?.[x];

  // camino más corto entre casillas (anchura primero; el plano es pequeño)
  function ruta(a, b) {
    const k = (x, y) => y * COLS + x, prev = new Map([[k(...a), null]]), cola = [a];
    while (cola.length) {
      const [x, y] = cola.shift();
      if (x === b[0] && y === b[1]) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!pisa[ny]?.[nx] || prev.has(k(nx, ny))) continue;
        prev.set(k(nx, ny), [x, y]); cola.push([nx, ny]);
      }
    }
    if (!prev.has(k(...b))) return [];
    const out = [];
    for (let p = b; p; p = prev.get(k(...p))) out.unshift(p);
    return out.slice(1);
  }
  // autoprueba: todos los sitios tienen camino desde el despacho de Harvey (un mueble mal puesto puede tapar una puerta)
  for (const s of [...Object.values(CASA), ...Object.values(SITIO), ...Object.values(LUGARES).flat()])
    if (!pisa[s[1]][s[0]] || (ruta(CASA.default, s).length === 0 && s !== CASA.default)) console.warn('Oficina: sitio sin camino', s);
  // una casilla libre al lado de otra (para quien lleva algo a la mesa de un compañero)
  const alLado = ([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0]].map(([dx, dy]) => [x + dx, y + dy, dx > 0 ? 'left' : dx < 0 ? 'right' : dy > 0 ? 'up' : 'down'])
    .find(([nx, ny]) => pisa[ny]?.[nx]) || [x, y, 'up'];

  // ---------- piezas dibujadas a mano, a juego con LimeZu (su contorno es #3A3A50) ----------
  const PAL = { k: '#3A3A50', d: '#565972', m: '#6C6E85', s: '#9A9CB0', w: '#F4F4F4', e: '#D9D9E0', y: '#F2C230', Y: '#C9971E',
    l: '#FFE27A', o: '#8B6B4A', O: '#6E5238', c: '#E2B57E', r: '#D9534A', n: '#1E2230', b: '#46D9FF', g: '#6DAA4E', G: '#3F7A3A',
    u: '#7FB6E0', f: '#E8C26A', F: '#C9A04E', p: '#B5603A' };
  const DIBUJO = {
    // silla de oficina vista por detrás (tapa las piernas de quien se sienta)
    silla: ['...kkkkkk...', '..kmmmmmmk..', '.kmssssssmk.', '.kmmmmmmmmk.', '.kmmmmmmmmk.', '.kdmmmmmmdk.', '.kddddddddk.',
      '..kkkkkkkk..', 'kddddddddddk', 'kkkkkkkkkkkk', '.....kk.....', '...kkkkkk...', '..k..kk..k..'],
    buzon: ['..kkkkkkkk..', '.kllllllllk.', 'kllyyyyyyyyk', 'klyyyyyyyyYk', 'klnnnnnnnnYk', 'klyyyyyyyyYk', 'klyywwwwyyYk',
      'klyywkkwyyYk', 'klyywwwwyyYk', 'klyyyyyyyyYk', 'kYYYYYYYYYYk', '.kkkkkkkkkk.', '....kmdk....', '....kmdk....',
      '....kmdk....', '....kmdk....', '...kkkkkk...', '..kddddddk..', '..kkkkkkkk..'],
    cafetera: ['.kkkkkkk.', 'kmmmmmmmk', 'kmnnnnnmk', 'kmnbbbnmk', 'kmnnnnnmk', 'kmmmmrmmk', 'kmkkkkkmk', 'kmkwwwkmk', 'kmkwwwkmk',
      'kdddddddk', 'kkkkkkkkk'],
    caballete: ['kkkkkkkkkkkkkk', 'kuuuuuuuuuyyuk', 'kuuuuuuuuuyyuk', 'kuuuuuuuuuuuuk', 'kuuuggguuuuuuk', 'kuuggggggguGGk',
      'kggggggggGGGGk', 'kGGGGGGGGGGGGk', 'kkkkkkkkkkkkkk', '.kooooooooook.', '...ko....ok...', '...ko....ok...', '..ko......ok..',
      '..ko......ok..', '..ko......ok..', '.ko........ok.', '.ko........ok.', '.kk........kk.'],
    micro: ['..kkkk..', '.kssssk.', '.ksmmsk.', '.ksmmsk.', '.ksmmsk.', '.kssssk.', '..kkkk..', '...kk...', '..kddk..', '...kk...',
      '...kk...', '...kk...', '...kk...', '...kk...', '...kk...', '...kk...', '...kk...', '...kk...', '..kkkk..', '.kddddk.', 'kkkkkkkk'],
    papeles: ['.kkkkkk.', 'kwwwwwwk', 'kweeeewk', 'kwwwwwwk', 'kkkkkkkk'],
    libros: ['.kkkkk..', 'krrrrrk.', 'kkkkkkkk', 'kuuuuuuk', 'kkkkkkkk', '.kgggggk', '.kkkkkkk'],
    plantita: ['.g..g.', 'gGggGg', '.gGGg.', '.kkkk.', '.kppk.', '..kk..'],
    carpeta: ['kkkk.....', 'kfffkkkkk', 'kfffffffk', 'kfffffffk', 'kFFFFFFFk', 'kkkkkkkkk'],
  };
  const SPR = {};
  for (const [n, filas] of Object.entries(DIBUJO)) {
    console.assert(filas.every((f) => f.length === filas[0].length), 'Oficina: dibujo desigual', n);
    const c = document.createElement('canvas'); c.width = filas[0].length; c.height = filas.length;
    const x = c.getContext('2d');
    filas.forEach((f, j) => [...f].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, j, 1, 1); } }));
    SPR[n] = c;
  }
  // la encimera de la cocina: encimera de madera con fregadero y puertas blancas (32×22)
  SPR.encimera = (() => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 22;
    const x = c.getContext('2d'), r = (col, a, b, w, h) => { x.fillStyle = PAL[col] || col; x.fillRect(a, b, w, h); };
    r('k', 0, 0, 32, 22); r('c', 1, 1, 30, 5); r('#F0CC98', 1, 1, 30, 1); r('o', 1, 6, 30, 1);
    r('k', 17, 1, 11, 5); r('s', 18, 2, 9, 3); r('m', 18, 4, 9, 1); r('k', 22, 0, 2, 3); // fregadero y grifo
    r('w', 1, 8, 30, 11); r('e', 1, 8, 30, 1); r('e', 11, 8, 1, 11); r('e', 21, 8, 1, 11);
    r('m', 9, 11, 1, 3); r('m', 13, 11, 1, 3); r('m', 23, 11, 1, 3); r('d', 1, 19, 30, 2);
    return c;
  })();
  // la mesa larga de Leonardo (tres pantallas): la mesa de LimeZu alargada por el centro; se rellena al cargar el arte
  SPR.mesaLarga = Object.assign(document.createElement('canvas'), { width: 48, height: 21 });
  const tam = (m) => (m.p ? P[m.p].slice(2) : [SPR[m.d].width, SPR[m.d].height]);
  for (const m of MUEBLES) {
    const [sw, sh] = tam(m), w = m.w || 1, h = m.h || 1, [ox, oy] = m.o || [0, 0];
    const px = Math.round((m.x + w / 2) * T - sw / 2) + ox;
    const py = (m.capa === 'suelo' ? Math.round((m.y + h / 2) * T - sh / 2) : m.capa === 'pared' ? m.y * T + 3 : (m.y + h) * T - sh) + oy;
    m.pos = [px, py, sw, sh]; m.k = py + sh;
  }
  const VOLUMEN = MUEBLES.filter((m) => !m.capa);
  const pieza1 = (t) => MUEBLES.find((m) => m.t === t);

  // ---------- letras de píxel (3×5; M y N más anchas) para carteles, nombres y burbujas ----------
  const LETRA = {
    A: '010/101/111/101/101', B: '110/101/110/101/110', C: '011/100/100/100/011', D: '110/101/101/101/110', E: '111/100/110/100/111',
    F: '111/100/110/100/100', G: '011/100/101/101/011', H: '101/101/111/101/101', I: '111/010/010/010/111', J: '001/001/001/101/010',
    L: '100/100/100/100/111', M: '10001/11011/10101/10001/10001', N: '1001/1101/1011/1001/1001', O: '010/101/101/101/010',
    P: '110/101/110/100/100', R: '110/101/110/101/101', S: '011/100/010/001/110', T: '111/010/010/010/010', U: '101/101/101/101/111',
    V: '101/101/101/101/010', Y: '101/101/010/010/010', Z: '111/001/010/100/111', '·': '0/0/1/0/0', ' ': '00/00/00/00/00',
    '!': '1/1/1/0/1', '?': '111/001/011/000/010', '…': '00000/00000/00000/00000/10101', '$': '011/110/010/011/110',
    '♪': '011/010/010/110/110', '♥': '01010/11111/11111/01110/00100', '☕': '1110/1011/1010/1110/0000',
  };
  const glifo = Object.fromEntries(Object.entries(LETRA).map(([k, v]) => [k, v.split('/')]));
  const ACENTO = { Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N' };
  const anchoTexto = (s, e = 1) => [...s].reduce((n, ch) => n + ((glifo[ACENTO[ch] || ch] || glifo['?'])[0].length + 1) * e, -e);
  function letras(c, s, x, y, col, e = 1) {
    c.fillStyle = col;
    for (const ch of s) {
      const gl = glifo[ACENTO[ch] || ch] || glifo['?'], w = gl[0].length;
      gl.forEach((fila, j) => [...fila].forEach((b, i) => b === '1' && c.fillRect(x + i * e, y + j * e, e, e)));
      if (ch === 'Ñ') c.fillRect(x + e, y - 2 * e, 2 * e, e); else if (ACENTO[ch]) c.fillRect(x + ((w - 1) >> 1) * e + e, y - 2 * e, e, e);
      x += (w + 1) * e;
    }
  }
  // cartel de madera con el nombre de la sala (10 px de alto: la tilde cabe encima)
  function cartel(c, s, x, y) {
    const w = anchoTexto(s) + 6;
    c.fillStyle = '#3A3A50'; c.fillRect(x, y, w, 10); c.fillStyle = '#8B6B4A'; c.fillRect(x + 1, y + 1, w - 2, 8);
    c.fillStyle = '#A9865F'; c.fillRect(x + 1, y + 1, w - 2, 1); letras(c, s, x + 3, y + 3, '#FBF3E2');
  }

  // ---------- arte de LimeZu ----------
  // Cada agente lleva uno de los cuatro personajes gratuitos con la ropa del color de su cara en la lista del equipo
  // (Tomo, además, con el pelo gris). Cuatro van disfrazados (DISFRAZ): Harvey de CEO (Bob canoso con traje oscuro, camisa
  // blanca, corbata cian y gafas), Jordan de broker de Wall Street (traje azul marino, camisa blanca y corbata roja),
  // Sherlock con gorra de cazador y pipa, Leonardo con boina y barba blanca larga.
  const PJ = { default: ['Bob', '#2B303B'], sherlock: ['Adam', '#7A6448', '#5A4330'], jordan: ['Alex', '#26324F', '#7A5530'], eco: ['Amelia', '#B5603A'],
    leonardo: ['Bob', '#A83636', '#DAD4C8'], lince: ['Alex', '#2F6A94'], tomo: ['Bob', '#8A7A62', '#C9C2B5'] };
  // Disfraces: píxeles por encima del personaje teñido, por dirección (la izquierda es la derecha en espejo) y en filas
  // contadas desde lo alto de la cabeza de cada fotograma (así siguen al personaje cuando respira o corre)
  const PAL_D = { k: '#3A3A50', h: '#8F7650', H: '#6B5536', o: '#7A4A2A', O: '#4E2E1A', b: '#4A2A33', B: '#36202A',
    w: '#EEEAE2', W: '#C8C1B4', r: '#B3263A', R: '#7E1A28', s: '#F4F4F4',
    g: '#7A5530', G: '#C9A06A', I: '#FFCBB0', e: '#4A3322', // g/G pelo engominado y su brillo · I piel · e cejas
    q: '#4E5263', T: '#1F7EA1', t: '#46D9FF' }; // q montura de las gafas · T/t corbata cian de Harvey
  const GORRA = ['....kkkkkkkk....', '..kkhHhHhHhHkk..', '.khHhHhHhHhHhHk.', '.kHhHhHhHhHhHhk.', '.khHhHhHhHhHhHk.',
    'kkkkkkkkkkkkkkkk', '.kHk........kHk.', '.kHk........kHk.', '..k..........k..'];
  const BOINA = ['....kkkkkkk.....', '..kkbbbbbbbkk...', '.kbbbbbbbbbbbk..', '.kBBBBBBBBBBBBk.', '..kkkkkkkkkkkk..'];
  const DISFRAZ = {
    default: { // gafas (los ojos de Bob van en la fila 10 desde lo alto de la cabeza), cuello blanco y corbata cian
      down: [[9, ['...qqqq..qqqq...', '...q..qqqq..q...', '...qqqq..qqqq...']],
        [14, ['......ssss......', '......sTts......', '.......Tt.......', '.......tT.......']]],
      right: [[9, ['.........qqqq...', '.......qqq..q...', '.........qqqq...']], [14, ['..........s.....', '..........T.....']]],
    },
    sherlock: { // gorra de cazador (con orejeras) y, de lado, la pipa
      down: [[-1, GORRA]], up: [[-1, GORRA]],
      right: [[-1, ['.....kkkkkk.....', '...kkhHhHhHkk...', '..khHhHhHhHhHk..', '..kHhHhHhHhHhk..', '.kkhHhHhHhHhHkkk', 'kHkkkkkkkkkkkkHk', '.kHk............', '.kHk............']],
        [10, ['..............kk', '..............ok', '...........ooook']]],
    },
    leonardo: { // boina, barba blanca larga y melena hasta los hombros
      down: [[-1, BOINA], [10, ['.ww.w......w.ww.', '.wwwwwwwwwwwwww.', '.w.wWwwwwwwWw.w.', '....wwwwwwww....', '....wWwwwwWw....', '.....wwwwww.....', '......wwww......', '.......ww.......']]],
      up: [[-1, BOINA], [12, ['...wwwwwwwwww...', '...wWwwwwwwWw...', '....wwwwwwww....']]],
      right: [[-1, BOINA], [10, ['..www...........', '..www...wwwww...', '..ww...wwwwwww..', '........wwwww...', '.........www....', '..........w.....']]],
    },
    jordan: { // pelo engominado hacia atrás con brillo y la frente despejada (Lince, también Alex, lleva flequillo; de frente,
      // la punta del flequillo junto al ojo derecho se tapa con piel), cuello blanco y corbata roja (el traje azul marino es el tinte)
      down: [[0, ['....kkkkkkkk....', '...kgGggGgggk...', '..kggGggGgggGk..', '..kgGggGgggGgk..', '.kggGggGgggGggk.', '.kgggggggggggggk',
        '.kgIIIIIIIIIIgk.', '.kgIIIIIIIIIIgk.', '.kgIIIIIIIIIIgk.', '.kgIeeIIIIeeIgk.', '...........I....', '...........I....']],
        [13,['......ssss......', '......sRRs......', '.......rr.......', '.......rr.......', '.......Rr.......']]],
      up: [[0, ['....kkkkkkkk....', '...kgGggGgggk...', '..kggGggGgggGk..', '..kgGggGgggGgk..', '.kggGggGgggGggk.', '.kgGggGgggGgggk.',
        '.kggGggGgggGggk.', '.kgggGggGgggggk.', '.kggggggggggggk.', '..kggggggggggk..']]],
      right: [[0, ['....kkkkkkk.....', '...kgGggGggk....', '..kggGggGgggk...', '..kgGggGgggGgk..', '.kgGggGgggGggk..', '.kggGggGgggggGk.',
        '.kgGggGgIIIIIIk.', '.kggGgggIIIIIIk.', '.kgggggIIIIIIk..', '.kggggIIIIeeIk..']],
        [13, ['.........ss.....', '..........R.....', '..........r.....']]],
    },
  };
  const espejo = (filas) => filas.map((f) => [...f].reverse().join(''));
  for (const d of Object.values(DISFRAZ)) if (d.right) d.left = d.right.map(([dy, f]) => [dy, espejo(f)]);
  // pinta el disfraz en cada fotograma de 16×32 (6 por dirección: derecha, arriba, izquierda, abajo; el del teléfono, de frente)
  function disfraza(c, id, deFrente) {
    const d = DISFRAZ[id];
    if (!d) return c;
    const x = c.getContext('2d'), px = x.getImageData(0, 0, c.width, c.height).data;
    for (let n = 0; n < c.width / 16; n++) {
      let alto = 0; // lo más alto de la cabeza en este fotograma
      while (alto < 22 && ![...Array(16)].some((_, i) => px[(alto * c.width + n * 16 + i) * 4 + 3])) alto++;
      for (const [dy, filas] of d[deFrente ? 'down' : ['right', 'up', 'left', 'down'][Math.floor(n / 6) % 4]] || [])
        filas.forEach((f, j) => [...f].forEach((ch, i) => { if (PAL_D[ch]) { x.fillStyle = PAL_D[ch]; x.fillRect(n * 16 + i, alto + dy + j, 1, 1); } }));
    }
    return c;
  }
  const ARTE = { listo: false };
  const carga = (n) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error(n)); i.src = 'arte/' + n; });
  const aHsl = (r, g2, b) => {
    r /= 255; g2 /= 255; b /= 255;
    const mx = Math.max(r, g2, b), mn = Math.min(r, g2, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1)), h = mx === r ? ((g2 - b) / d) % 6 : mx === g2 ? (b - r) / d + 2 : (r - g2) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  };
  const aRgb = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g2, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g2 + m) * 255), Math.round((b + m) * 255)];
  };
  const deHex = (h) => aHsl(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
  const CONTORNO = new Set(['3a3a50', '46465e', '565972']);
  // tiñe la ropa (de la fila 23 de cada fotograma hacia abajo) y, si se pide, el pelo; la piel y el contorno no se tocan
  function tinta(img, ropa, pelo) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    if (!ropa && !pelo) return c;
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data, R = ropa && deHex(ropa), P2 = pelo && deHex(pelo);
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      const hex = ((p[i] << 16) | (p[i + 1] << 8) | p[i + 2]).toString(16).padStart(6, '0'), y = (i / 4 / c.width) | 0;
      if (CONTORNO.has(hex) || hex === 'c9a495' || hex === 'bba386' || (y < 23 && hex === '6c6e85')) continue; // contorno, sombra de la piel, ojos
      const [h, s, l] = aHsl(p[i], p[i + 1], p[i + 2]);
      if (s > 0.3 && l > 0.55 && (h <= 40 || h >= 340)) continue; // piel
      const n = y >= 23 && R ? aRgb(R[0], Math.max(R[1], 0.35), Math.min(0.8, Math.max(0.14, l * R[2] / 0.45)))
        : y < 23 && P2 ? aRgb(P2[0], P2[1], Math.min(0.9, l * P2[2] / 0.45)) : null;
      if (n) [p[i], p[i + 1], p[i + 2]] = n;
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  Promise.all([carga('Interiors_free_16x16.png'), carga('Room_Builder_free_16x16.png'),
    ...['Adam', 'Alex', 'Amelia', 'Bob'].flatMap((n) => [carga(n + '_idle_anim_16x16.png'), carga(n + '_run_16x16.png')]), carga('Alex_phone_16x16.png')])
    .then(([int, room, ...pj]) => {
      const base = { Adam: [pj[0], pj[1]], Alex: [pj[2], pj[3]], Amelia: [pj[4], pj[5]], Bob: [pj[6], pj[7]] }, tel = pj[8];
      ARTE.pj = Object.fromEntries(Object.entries(PJ).map(([id, [n, ropa, pelo]]) => [id, {
        quieto: disfraza(tinta(base[n][0], ropa, pelo), id), corre: disfraza(tinta(base[n][1], ropa, pelo), id),
        tel: n === 'Alex' ? disfraza(tinta(tel, ropa, pelo), id, true) : null }]));
      Object.assign(ARTE, { int, room, listo: true });
      const [mx, my, , mh] = P.mesa, ml = SPR.mesaLarga.getContext('2d');
      for (const [desde, a] of [[0, 0], [8, 16], [16, 32]]) ml.drawImage(int, mx + desde, my, 16, mh, a, 0, 16, mh);
      // la misma cara en la lista del equipo y en las tarjetas del Tablero (hud.js pinta .av con data-ag)
      const caras = Object.entries(ARTE.pj).map(([id, p]) => {
        const c = document.createElement('canvas'); c.width = c.height = 16;
        c.getContext('2d').drawImage(p.quieto, 18 * 16, 7, 16, 16, 0, 0, 16, 16); // desde la fila 7: caben la gorra y la boina
        return `.av[data-ag="${id}"]{background:url(${c.toDataURL()}) center/100% no-repeat,var(--c);image-rendering:pixelated}.av[data-ag="${id}"]::before,.av[data-ag="${id}"]::after{display:none}`;
      });
      document.head.append(Object.assign(document.createElement('style'), { textContent: caras.join('') }));
      fondoClave = ''; // repinta el fondo con el arte
    })
    .catch((e) => console.warn('Oficina: sin arte de LimeZu, uso los dibujos sencillos', e.message));

  // ---------- estado ----------
  const cv = document.getElementById('oficina'), g = cv.getContext('2d');
  const capa = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const capas = { cielo: capa(), paisaje: capa(), interior: capa() };
  capas.paisaje.getContext('2d', { willReadFrequently: true }); // los reflejos y el tinte leen sus píxeles
  let k = 1, fondoClave = '', primeraVez = true, senal = true, datos = null, sel = null, raton = null, corriendo = false, mo = null;
  const libros = { n: 0 }, mesasCon = new Set(); // carpetas sobre las mesas (Lince revisando)
  const ag = Object.fromEntries(ORDEN.map((id) => {
    const [x, y, cara] = CASA[id];
    return [id, { id, x: x * T + 8, y: y * T + 14, cara, camino: [], recados: [], base: null, lleva: null, paso: 0, espera: 0,
      vidaT: id === 'default' ? 45 : undefined }]; // Harvey empieza un rato en su mesa
  }));

  function ajusta() {
    const caja = cv.parentElement.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    const cabe = Math.min((caja.width - 16) / W, (innerHeight * 0.72) / H) * dpr;
    k = cabe >= 2 ? Math.floor(cabe) : cabe; // píxeles enteros de la pantalla desde el doble (el iPhone también); por debajo, lo que quepa
    cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    cv.style.width = W * k / dpr + 'px'; cv.style.height = H * k / dpr + 'px';
  }
  new ResizeObserver(ajusta).observe(cv.parentElement);

  // ---------- qué hace cada uno según los tableros ----------
  const HORA_REUNION = 12 * 60_000; // la reunión dura en pantalla 12 minutos desde que Harvey se despierta
  const ACT = (paso) => (!paso ? 'teclea' : /web|browser|search|extract|read|vision|skill|kanban_show|kanban_list/.test(paso) ? 'lee'
    : /image/.test(paso) ? 'pinta' : /speech|tts/.test(paso) ? 'habla' : 'teclea');
  function lugarLibre(id, usados) {
    const texto = LIBRE[libreDe(id)], sitios = LUGARES[texto] || LUGARES['en la cocina'];
    // si su sitio está lleno, el primero libre de otro (nunca dos en la misma casilla)
    const libre = (lista) => lista.find((p) => !usados.has(p.join()));
    const s = libre(sitios) || libre(Object.values(LUGARES).flat()) || sitios[0];
    usados.add(s.join());
    return { sitio: s, texto };
  }
  function calcula(d) {
    const usados = new Set(), out = {};
    const reunida = d.reunion?.cambio && Date.now() - new Date(d.reunion.cambio) < HORA_REUNION;
    out.default = reunida ? { sitio: SITIO.reunion, act: 'pizarra', texto: 'en la reunión de dirección' }
      : { sitio: CASA.default, act: 'teclea', texto: (typeof live !== 'undefined' && live) ? 'atendiéndole' : 'trabajando en su despacho' };
    for (const id of ORDEN.slice(1)) {
      const t = d.tarjetas.find((x) => x.agente === id && (x.columna === 'trabajando' || (x.columna === 'revision' && x.estado === 'running')));
      const e = d.espera.find((x) => x.agente === id);
      if (t) {
        const act = t.columna === 'revision' ? 'revisa' : ACT(t.paso);
        // pintar y poner voz se hacen en el caballete y en el micro; lo demás, en su mesa
        const sitio = act === 'pinta' ? SITIO.caballete : act === 'habla' && id !== 'jordan' ? SITIO.micro : CASA[id];
        out[id] = { sitio, act, tarjeta: t, texto: t.columna === 'revision' ? 'revisa «' + t.titulo + '»' : t.titulo };
      } else if (e) out[id] = { sitio: CASA[id], burbuja: e.tipo === 'aprobar' ? '!' : '?', tarjeta: e, texto: e.tipo === 'aprobar' ? 'espera su visto bueno' : 'le ha preguntado algo' };
      else out[id] = { ...lugarLibre(id, usados), act: 'libre' };
    }
    return out;
  }
  // recados: lo que pasa entre una foto y la siguiente (llevar la carpeta a Lince, el sobre al buzón, un libro a la estantería…)
  function recado(id, sitio, lleva, ms, luego) { corta(ag[id]); ag[id].recados.push({ sitio, lleva, ms, luego }); }
  function cambios(antes, ahora) {
    const A = Object.fromEntries(antes.tarjetas.map((t) => [t.id, t]));
    for (const t of ahora.tarjetas) {
      const a = A[t.id];
      // pide revisión: el autor lleva la carpeta a la mesa de Lince
      if (t.columna === 'revision' && a && a.columna === 'trabajando' && t.autor && t.autor !== 'lince' && ag[t.autor])
        recado(t.autor, alLado(CASA.lince), 'carpeta', 1200, () => mesasCon.add('lince'));
      // Lince la devuelve: la carpeta vuelve con un pósit rojo
      if (t.columna === 'trabajando' && a && a.columna === 'revision' && t.agente !== 'lince' && ag[t.agente])
        recado('lince', alLado(CASA[t.agente]), 'roja', 1200, () => mesasCon.delete('lince'));
      // empieza una tarjeta y otro acaba de terminar una en ese tablero: le trae la carpeta
      if (t.columna === 'trabajando' && (!a || a.columna === 'cola') && ag[t.agente]) {
        const hecho = ahora.recientes.find((r) => r.tipo === 'completed' && r.tablero === t.tablero && r.agente !== t.agente && ag[r.agente]
          && Date.now() / 1000 - r.t < 600);
        if (hecho) recado(hecho.agente, alLado(CASA[t.agente]), 'carpeta', 1000);
        if (t.agente === 'tomo' && /^archivar/i.test(t.titulo)) recado('tomo', SITIO.estanteria, 'libro', 1600, () => { libros.n = Math.min(libros.n + 1, 9); });
      }
      if (t.columna === 'hecho' && a && a.columna !== 'hecho') mesasCon.delete('lince');
    }
    // algo nuevo que aprobar: su agente lleva el sobre al buzón
    const antesEsp = new Set(antes.espera.map((x) => x.id));
    for (const x of ahora.espera) if (!antesEsp.has(x.id) && x.tipo === 'aprobar' && ag[x.agente]) recado(x.agente, SITIO.buzon, 'sobre', 1400);
  }

  // ---------- movimiento ----------
  const VEL = 38; // píxeles por segundo
  function ir(a, [tx, ty, cara]) {
    const desde = [Math.floor(a.x / T), Math.floor((a.y - 6) / T)];
    a.camino = ruta(desde, [tx, ty]).map(([x, y]) => [x * T + 8, y * T + 14]);
    if (!a.camino.length && (desde[0] !== tx || desde[1] !== ty)) { a.x = tx * T + 8; a.y = ty * T + 14; } // sin camino: que no se quede atascado
    a.destino = [tx, ty]; a.caraFinal = cara;
  }
  function paso(a, dt) {
    if (a.id === 'default') { // se sienta al llegar a su mesa y se levanta antes de echar a andar
      a.sit = Math.min(1, Math.max(0, (a.sit || 0) + (en(a, CASA.default) ? dt : -dt) * 2.5));
      if (a.camino.length && a.sit > 0) return;
    }
    if (a.camino.length) {
      const [x, y] = a.camino[0], dx = x - a.x, dy = y - a.y, dist = Math.hypot(dx, dy), v = VEL * dt;
      a.cara = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (dist <= v) { a.x = x; a.y = y; a.camino.shift(); } else { a.x += dx / dist * v; a.y += dy / dist * v; }
      const antes = Math.floor(a.paso);
      a.paso += dt * 8;
      if (Math.floor(a.paso) !== antes && antes % 2) suena('paso');
      if (!a.camino.length) { a.cara = a.caraFinal || a.cara; llega(a); }
      return;
    }
    if (a.espera > 0) { a.espera -= dt * 1000; if (a.espera <= 0) { a.espera = 0; a.lleva = null; a.gesto = null; a.recado?.luego?.(); a.recado = null; } return; }
    const r = a.recados.shift();
    if (r) { a.recado = r; a.lleva = r.lleva; a.gesto = null; ir(a, r.sitio); a.espera = r.ms; if (!a.camino.length) llega(a); return; }
    const b = a.base;
    if (b && (a.destino?.[0] !== b.sitio[0] || a.destino?.[1] !== b.sitio[1])) ir(a, b.sitio);
  }
  const quieto = (a) => !a.camino.length && !a.espera && !a.recados.length;
  const en = (a, s) => !a.camino.length && a.destino?.[0] === s[0] && a.destino?.[1] === s[1];
  const enSofa = (a) => LUGARES['en el sofá'].some((s) => en(a, s));
  // al llegar al sitio de un recado: su gesto (pintar, la lupa, el teléfono…) y, si es una charla, que el otro le mire
  function llega(a) {
    const r = a.recado;
    if (!r || r.llego) return;
    r.llego = true; a.gesto = r.gesto || null; r.alLlegar?.();
  }

  // ---------- vida: lo que hacen sin tarjeta (pasear, el café, charlar entre ellos, su afición) ----------
  // Son excursiones desde su sitio libre (el de la lista del equipo, que cambia cada hora): al acabar, vuelven a él.
  // Un recado de verdad o una tarjeta nueva las cortan al momento (corta).
  const azar = (a, b) => a + Math.random() * (b - a);
  const elige = (l) => l[Math.floor(Math.random() * l.length)];
  const esLibre = (a) => a.base?.act === 'libre';
  const enDespacho = (a) => a.id === 'default' && a.base?.sitio === CASA.default; // Harvey en su mesa: de vez en cuando, ronda
  const ocupado = (yo, s) => Object.values(ag).some((o) => o !== yo && o.destino?.[0] === s[0] && o.destino?.[1] === s[1]);
  const casillaDe = (a) => [Math.floor(a.x / T), Math.floor((a.y - 6) / T)];
  const hacia = (de, a) => { const dx = a.x - de.x, dy = a.y - de.y; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); };
  // lo que dice cada uno en una charla (glifos de LETRA): Jordan habla de dinero, Leonardo de ideas, Sherlock pregunta
  const DICE = { jordan: ['$', 'JA', '!', '$'], leonardo: ['…', '♪', '!', 'JA'], sherlock: ['?', '…', '!', '?'] };
  const DICE_TODOS = ['…', 'JA', '!', '?', '♪', '♥'];
  // la afición de cada uno: [sitio, gesto, texto de la ficha, segundos]
  const AFICION = {
    leonardo: () => [SITIO.caballete, 'pinta', 'dibujando un invento en el caballete', azar(10, 16)],
    sherlock: () => { const m = elige(MUEBLES.filter((x) => /planta|cuadro|globo|estanteria/.test(x.t))); return [alLado([m.x, m.y]), 'lupa', 'examinando algo con la lupa', azar(5, 8)]; },
    jordan: () => [elige(LUGARES['mirando la ría']), 'tel', 'al teléfono, cerrando un trato', azar(8, 12)],
    tomo: () => [SITIO.estanteria, 'lee', 'ordenando la estantería', azar(8, 12)],
    eco: () => [SITIO.micro, 'habla', 'ensayando en el micro', azar(6, 9)],
    lince: () => [elige(LUGARES['tomando un café']), 'cafe', 'tomando un café', azar(6, 9)],
  };
  function excursion(a, sitio, o) {
    if (!sitio || ocupado(a, sitio) || !pisa[sitio[1]]?.[sitio[0]]) return false;
    a.recados.push({ sitio, vida: true, ...o, ms: o.ms ?? 6000 });
    return true;
  }
  function corta(a) { // deja lo que estaba haciendo por gusto (no lo que le han encargado)
    a.recados = a.recados.filter((r) => !r.vida);
    if (a.recado?.vida) { a.camino = []; a.espera = 0; a.recado = null; a.gesto = null; a.destino = null; if (a.lleva === 'taza') a.lleva = null; }
    if (a.charla) { const o = a.charla.con(a); a.charla = o.charla = null; o.cara = o.caraFinal || o.cara; }
  }
  function charla(a, o) {
    const s = alLado(casillaDe(o)), ms = azar(6000, 9000);
    const ok = excursion(a, s, { ms, texto: 'charlando con ' + nombre(o.id), alLlegar() {
      if (!quieto(o) || o.charla) return;
      const c = { t0: performance.now(), hasta: performance.now() + ms, quien: [a, o], con: (x) => (x === a ? o : a) };
      a.charla = o.charla = c; o.cara = hacia(o, a); a.cara = hacia(a, o);
    }, luego() { if (o.charla) { o.charla = null; o.cara = o.caraFinal || o.cara; o.vidaT = azar(3, 8); } a.charla = null; } });
    if (ok) o.vidaT = 30; // que no se marche mientras llega
    return ok;
  }
  function vida(a, dt) {
    const ahora = performance.now();
    if (a.mira && ahora > a.mira) { a.mira = 0; if (!a.charla) a.cara = a.caraFinal || a.cara; }
    if (!quieto(a) || a.charla) return;
    if ((a.vidaT ??= azar(3, 12)) > 0) {
      a.vidaT -= dt;
      if (esLibre(a) && !a.mira && Math.random() < dt * 0.06) { a.cara = elige(['left', 'right', 'down']); a.mira = ahora + azar(900, 1800); } // mira alrededor
      return;
    }
    a.vidaT = azar(9, 20);
    if (a.lleva === 'taza') a.lleva = null;
    const trabajan = Object.values(ag).filter((o) => o !== a && /teclea|lee|revisa/.test(o.base?.act || '') && en(o, CASA[o.id]));
    if (enDespacho(a)) { // Harvey casi siempre trabaja en su mesa; a ratos se pasa por la de quien trabaja o mira la ría con un café
      a.vidaT = azar(40, 90);
      const r = Math.random();
      if (trabajan.length && r < 0.4) { const o = elige(trabajan); excursion(a, alLado(CASA[o.id]), { ms: 4000, gesto: 'pregunta', texto: 'viendo cómo va ' + nombre(o.id) }); }
      else if (r < 0.65) excursion(a, elige([[2, 5, 'up'], [6, 5, 'up']]), { ms: azar(6000, 9000), gesto: 'cafe', lleva: 'taza', texto: 'con un café, mirando la ría' });
      return;
    }
    if (!esLibre(a)) { if (Math.random() < 0.35) a.idea = ahora + 1600; return; } // quien trabaja: alguna idea («!»)
    const libres = Object.values(ag).filter((o) => o !== a && esLibre(o) && quieto(o) && !o.charla);
    const r = Math.random(), propia = AFICION[a.id]?.();
    if (libres.length && r < 0.35 && charla(a, elige(libres))) return;
    if (propia && r < 0.6 && excursion(a, propia[0], { gesto: propia[1], texto: propia[2], ms: propia[3] * 1000 })) return;
    if (r < 0.8) { // un café; a veces se lo lleva a quien está trabajando
      const o = trabajan.length && Math.random() < 0.4 ? elige(trabajan) : null;
      if (excursion(a, elige(LUGARES['tomando un café']), { ms: 2500, gesto: 'cafe', texto: 'cogiendo un café', luego: () => { a.lleva = 'taza'; } }) && o)
        excursion(a, alLado(CASA[o.id]), { lleva: 'taza', ms: 2500, gesto: 'regalo', texto: 'llevándole un café a ' + nombre(o.id) });
      return;
    }
    excursion(a, elige(Object.values(LUGARES).flat()), { ms: azar(5000, 9000), texto: 'dando una vuelta' });
  }

  // ---------- sonido opcional: lluvia, teclados y pasos, sintetizados (nada que descargar) ----------
  const sonido = { on: load('ofSonido', false), lluvia: null };
  function ruido(seg, vol, frec, tipo = 'bandpass') {
    const ctx = audioCtx(), n = Math.floor(ctx.sampleRate * seg), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), gn = ctx.createGain();
    src.buffer = buf; f.type = tipo; f.frequency.value = frec; gn.gain.value = vol;
    src.connect(f).connect(gn).connect(ctx.destination); src.start();
    return { src, gn };
  }
  function suena(que) {
    if (!sonido.on || !corriendo) return;
    try { if (que === 'paso') ruido(0.05, 0.05, 380); else if (que === 'tecla') ruido(0.025, 0.035, 2600 + Math.random() * 1200); } catch {}
  }
  function lluviaSuena(on) {
    try {
      if (on && !sonido.lluvia) { const r = ruido(4, 0.05, 1400, 'lowpass'); r.src.loop = true; sonido.lluvia = r; }
      else if (!on && sonido.lluvia) { sonido.lluvia.src.stop(); sonido.lluvia = null; }
    } catch {}
  }
  const botonSonido = document.getElementById('of-sonido');
  const pintaBoton = () => { botonSonido.setAttribute('aria-pressed', String(sonido.on)); botonSonido.lastChild.textContent = sonido.on ? ' sonido sí' : ' sonido no'; };
  botonSonido.addEventListener('click', () => { sonido.on = !sonido.on; save('ofSonido', sonido.on); pintaBoton(); if (!sonido.on) lluviaSuena(false); });
  pintaBoton();

  // ---------- la hora del cielo: el sol sale y se pone de verdad en Portugalete ----------
  const hora = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const llueve = () => /lluvia|llovizna|chubascos|tormenta/.test(lastSnap?.tiempo?.data?.ahora?.cielo || '');
  // salida y puesta del sol en Portugalete (43,32 N · 3,02 O), en horas locales del día d (fórmula de la NOAA, ±2 min)
  function sol(d = new Date()) {
    const r = Math.PI / 180, n = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5;
    const decl = -23.44 * r * Math.cos(2 * Math.PI / 365 * (n + 10)), B = 2 * Math.PI / 365 * (n - 81);
    const ecuacion = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutos
    const arco = Math.acos((Math.sin(-0.833 * r) - Math.sin(43.32 * r) * Math.sin(decl)) / (Math.cos(43.32 * r) * Math.cos(decl))) / r / 15;
    const mediodia = 12 + 3.02 / 15 - ecuacion / 60 - d.getTimezoneOffset() / 60;
    return [mediodia - arco, mediodia + arco];
  }
  { // autoprueba: el día más largo dura unas 15 h 25 min y el más corto unas 9 h en Portugalete
    const largo = sol(new Date(2026, 5, 21)), corto = sol(new Date(2026, 11, 21));
    console.assert(Math.abs(largo[1] - largo[0] - 15.4) < 0.15 && Math.abs(corto[1] - corto[0] - 9) < 0.15, 'Oficina: el sol no cuadra', largo, corto);
  }
  function momento() {
    const h = hora(), [sale, pone] = sol();
    const modo = h < sale - 0.6 || h >= pone + 0.6 ? 'noche' : h < sale + 0.6 ? 'alba' : h >= pone - 0.8 ? 'tarde' : 'dia';
    return { modo, lluvia: llueve(), luces: h < sale + 0.3 || h >= pone - 0.4 };
  }

  // ---------- la vista: cielo, Las Arenas a la izquierda, la ría, Portugalete en la ladera y el Puente Colgante ----------
  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mezcla = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  function semilla(n) { return () => { n = (n + 0x6D2B79F5) | 0; let t = Math.imul(n ^ (n >>> 15), 1 | n); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const VENTANA = [[22, 138], [166, 314], [342, 458]]; // x de los tres ventanales (Dirección, Reuniones, Negocio); cristal de y 7 a 56
  const TORRE = [180, 300], VIGA = 17, PIE = 48, ABAJO = 57; // x de las torres; y de la viga, del pie de las torres y del fondo del cristal
  const orillaIzq = (x) => Math.round(51 - x * 4 / 176), orillaDer = (x) => Math.round(47 + (x - 304) * 4 / 176);
  const aguaDesde = Array.from({ length: W }, (_, x) => (x < 177 ? orillaIzq(x) + 2 : x > 303 ? orillaDer(x) + 2 : 46));
  const CIELO = {
    dia: ['#4A8FCB', '#62A5D9', '#82BBE4', '#A9D2EE', '#CBE5F5'], alba: ['#34406A', '#5E5F8C', '#9C7C9E', '#D99A8E', '#F2C08E'],
    tarde: ['#2B3562', '#5A4777', '#9A5A78', '#DA7A62', '#F4AC62'], noche: ['#08101F', '#0B1528', '#0F1C33', '#14233E', '#1B2D4C'],
  };
  const CIELO_GRIS = { dia: ['#66737F', '#75818C', '#86919B', '#98A2AA', '#AAB3BA'], noche: ['#0E141D', '#121A25', '#17202C', '#1C2633', '#222D3A'] };
  const TINTE = { dia: null, alba: ['#6A4E78', 0.22], tarde: ['#5E3352', 0.3], noche: ['#0B1430', 0.72] };
  const NUBE = { dia: ['#FFFFFF', '#DCE7F0'], alba: ['#F4D2CF', '#B993A8'], tarde: ['#F8C49C', '#C7808A'], noche: ['#26324A', '#1E283C'], gris: ['#9AA4AC', '#7F8992'] };
  const AGUA = ['#9CC3DA', '#3E7091']; // del fondo de la ría a la orilla de acá
  const r1 = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  function linea(c, col, x0, y0, x1, y1) { // recta de píxeles (Bresenham)
    c.fillStyle = col; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    for (let e = dx + dy; ; ) {
      c.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  const disco = (c, col, cx, cy, r) => { for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); r1(c, col, cx - w, cy + y, 2 * w + 1, 1); } };
  function pintaCielo(c, m) {
    const tonos = m.lluvia ? CIELO_GRIS[m.modo === 'noche' ? 'noche' : 'dia'] : CIELO[m.modo], n = tonos.length - 1;
    c.clearRect(0, 0, W, H);
    for (let y = 0; y < 60; y++) { // franjas con una trama de ajedrez donde cambian
      const f = Math.min(n, y / 46 * n), i = Math.floor(f), t = f - i;
      r1(c, tonos[t > 0.66 ? Math.min(n, i + 1) : i], 0, y, W, 1);
      if (t > 0.33 && t <= 0.66) for (let x = y % 2; x < W; x += 2) r1(c, tonos[Math.min(n, i + 1)], x, y);
    }
    const azar = semilla(11);
    if (m.modo === 'noche' && !m.lluvia) {
      for (let i = 0; i < 70; i++) r1(c, azar() < 0.3 ? '#E8EEF8' : '#7F8EA8', Math.floor(azar() * W), Math.floor(azar() * 38));
      disco(c, '#1F2D49', 410, 15, 6); disco(c, '#EFE7C8', 410, 15, 4); disco(c, tonos[1], 412, 14, 3); // luna menguante
    }
    if (m.lluvia) return;
    if (m.modo === 'dia') { disco(c, '#D9EDF8', 108, 16, 8); disco(c, '#FFF3B8', 108, 16, 5); disco(c, '#FFFBE6', 108, 16, 3); }
    if (m.modo === 'tarde') { disco(c, '#F2A86A', 236, 40, 11); disco(c, '#FFC977', 236, 40, 7); disco(c, '#FFF0C0', 236, 40, 4); }
    if (m.modo === 'alba') { disco(c, '#E9A890', 420, 40, 9); disco(c, '#FFD9A8', 420, 40, 5); }
  }
  // casa de la orilla: fachada, tejado, ventanas en rejilla y bajo comercial; guarda sus ventanas para encenderlas de noche
  function casa(c, x, y, w, h, col, teja, azar, luces) {
    r1(c, col, x, y, w, h); r1(c, mezcla(col, '#000000', 0.18), x + w - 1, y, 1, h); r1(c, mezcla(col, '#FFFFFF', 0.25), x, y, 1, h);
    if (teja) { r1(c, '#B5543C', x - 1, y - 2, w + 2, 2); r1(c, '#8A3F2E', x - 1, y, w + 2, 1); } else r1(c, mezcla(col, '#000000', 0.32), x, y, w, 1);
    const bal = azar() < 0.5, vent = mezcla('#4E5A68', col, 0.15);
    for (let wy = y + 3; wy < y + h - 4; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) {
      r1(c, vent, wx, wy, 1, 2);
      if (bal) r1(c, '#F2EFE8', wx - 1, wy + 2, 3, 1);
      if (azar() < 0.4) luces.push([wx, wy]);
    }
    r1(c, mezcla(col, '#000000', 0.3), x, y + h - 3, w, 3);
    for (let wx = x + 2; wx < x + w - 2; wx += 4) r1(c, '#3A3F48', wx, y + h - 2, 2, 2);
  }
  function arbol(c, x, y, azar) {
    const r = 2 + Math.floor(azar() * 2);
    r1(c, '#5A4232', x, y - 2, 1, 3); disco(c, '#3F6A35', x, y - 3 - r, r + 1); disco(c, '#5E8C4A', x, y - 4 - r, r); r1(c, '#7AA85A', x - 1, y - 5 - r, 2, 1);
  }
  function pintaPaisaje(c, m) {
    c.clearRect(0, 0, W, H);
    const azar = semilla(5), luces = [];
    // montes de Bizkaia al fondo, en dos capas de neblina
    for (let x = 0; x < W; x++) {
      const lejos = 33 + Math.round(3 * Math.sin(x / 31) + 2 * Math.sin(x / 13 + 2)), cerca = 38 + Math.round(2.5 * Math.sin(x / 19 + 1) + 1.5 * Math.sin(x / 7));
      r1(c, '#B4C6D5', x, lejos, 1, 47 - lejos); r1(c, '#93AABD', x, Math.max(cerca, 34), 1, 47 - Math.max(cerca, 34));
    }
    // ría arriba, al fondo: Sestao y el puerto (casas bajas y dos grúas)
    for (let x = 176; x < 306; x += 3 + Math.floor(azar() * 3)) r1(c, azar() < 0.5 ? '#A3ADB6' : '#8D99A4', x, 42 - Math.floor(azar() * 3), 3, 6);
    for (const gx of [204, 278]) { r1(c, '#7C8894', gx, 33, 1, 11); r1(c, '#7C8894', gx - 3, 33, 9, 1); r1(c, '#7C8894', gx + 5, 34, 1, 2); }
    // el agua, de clara al fondo a más honda en esta orilla
    for (let y = 41; y <= ABAJO; y++) r1(c, mezcla(AGUA[0], AGUA[1], (y - 41) / (ABAJO - 41)), 0, y, W, 1);
    // Portugalete en la ladera (derecha): monte verde, tres hileras de casas y la basílica de Santa María arriba
    for (let x = 304; x < W; x++) r1(c, '#6E8A5C', x, Math.round(45 - (x - 304) * 0.15), 1, 8);
    const pastel = ['#E9D8B4', '#F1E9DA', '#E8C29A', '#D9A98A', '#F0DCC8', '#CFC7B4', '#E3B9A0'];
    for (const [desde, alto0, sube] of [[318, 12, 0.12], [306, 10, 0.06], [304, 8, 0]]) {
      for (let x = desde; x < W; ) {
        const w = 8 + Math.floor(azar() * 7), base = orillaDer(x) - 1 - Math.round((x - 304) * sube) - (sube ? 6 : 0), h = alto0 + Math.floor(azar() * 6);
        casa(c, x, base - h, w, h, pastel[Math.floor(azar() * pastel.length)], azar() < 0.7, azar, luces);
        x += w + (azar() < 0.25 ? 1 : 0);
      }
    }
    r1(c, '#D8CBB0', 410, 14, 22, 9); r1(c, '#8A6A5A', 409, 12, 24, 2); r1(c, '#B9AC92', 410, 22, 22, 1); // la nave de la basílica
    r1(c, '#3A3A50', 433, 6, 8, 18); r1(c, '#DCCFB4', 434, 7, 6, 17); r1(c, '#4A4E58', 435, 10, 4, 3); r1(c, '#4A4E58', 436, 16, 2, 2); // la torre
    r1(c, '#9A8C74', 433, 6, 8, 1); disco(c, '#7D8C8A', 437, 4, 2); r1(c, '#3A3A50', 437, 0, 1, 2); r1(c, '#3A3A50', 436, 1, 3, 1);
    // Las Arenas (izquierda): casas señoriales en hilera que se alejan hacia el puente, árboles y el paseo
    for (let x = -6; x < 172; ) {
      const lejos = x / 176, w = Math.round(11 + (1 - lejos) * 6 + azar() * 5), base = orillaIzq(x);
      const h = Math.round(9 + (1 - lejos) * 16 + azar() * 7);
      casa(c, x, base - h, Math.min(w, 176 - x), h, pastel[Math.floor(azar() * pastel.length)], azar() < 0.6, azar, luces);
      x += w + (azar() < 0.3 ? 1 : 0);
    }
    for (let x = 4; x < 166; x += 9 + Math.floor(azar() * 7)) arbol(c, x, orillaIzq(x) - 1, azar);
    // muelles de piedra con su barandilla blanca
    for (let x = 0; x < W; x++) {
      if (x > 176 && x < 304) continue;
      const y = x < 177 ? orillaIzq(x) : orillaDer(x);
      r1(c, '#E8E4DA', x, y - 1, 1, 1); r1(c, x % 4 ? '#8E8A80' : '#7A766E', x, y, 1, 2);
    }
    // el Puente Colgante: tirantes de atrás, dos torres de celosía, la viga arriba y los cables colgados
    const hierro = '#3E4450', luz = '#5C6474', oscuro = '#2C313B';
    for (const [tx, s] of [[TORRE[0], -1], [TORRE[1], 1]]) for (const d of [66, 84]) {
      const ax = tx + s * d;
      linea(c, '#4A505C', tx, 9, ax, (s < 0 ? orillaIzq(ax) : orillaDer(ax)) - 2);
    }
    for (const tx of TORRE) {
      const arriba = 8;
      for (let y = arriba; y <= PIE; y++) { // dos patas que se abren hacia abajo con cruces de San Andrés
        const hw = 2 + (y - arriba) / (PIE - arriba) * 3.5, xi = Math.round(tx - hw), xd = Math.round(tx + hw), tramo = (y - arriba) % 6;
        r1(c, hierro, xi, y); r1(c, luz, xi + 1, y); r1(c, oscuro, xd, y);
        if (!tramo) r1(c, hierro, xi, y, xd - xi + 1, 1);
        else { r1(c, hierro, Math.round(xi + (xd - xi) * tramo / 6), y); r1(c, hierro, Math.round(xd - (xd - xi) * tramo / 6), y); }
      }
      r1(c, hierro, tx - 2, arriba - 1, 5, 1); r1(c, hierro, tx - 1, arriba - 3, 3, 2); r1(c, hierro, tx, arriba - 5, 1, 2); // remate
      r1(c, '#3A3A50', tx - 7, PIE, 15, 5); r1(c, '#C9C0AE', tx - 6, PIE + 1, 13, 3); r1(c, '#A89F8E', tx - 6, PIE + 3, 13, 1); // pilar de piedra
    }
    const [x0, x1] = [TORRE[0] - 5, TORRE[1] + 5];
    r1(c, hierro, x0, VIGA, x1 - x0, 1); r1(c, oscuro, x0, VIGA + 3, x1 - x0, 1);
    for (let x = x0; x < x1; x++) { const d = (x - x0) % 4; if (d === 1 || d === 3) r1(c, hierro, x, VIGA + 1); if (d === 2) r1(c, hierro, x, VIGA + 2); }
    for (const [tx, s] of [[TORRE[0], 1], [TORRE[1], -1]]) { // cables: de lo alto de cada torre bajan curvados hasta la viga
      let antes = 9;
      for (let i = 0; i <= 52; i++) {
        const y = Math.round(9 + (VIGA - 9) * (1 - (1 - i / 52) ** 2));
        r1(c, hierro, tx + s * i, Math.min(antes, y), 1, Math.abs(y - antes) + 1); antes = y;
        if (i % 6 === 3) r1(c, '#59606C', tx + s * i, y + 1, 1, Math.max(0, VIGA - y - 1));
      }
    }
    // reflejos: cada columna del agua repite, rota y apagada, lo que tiene encima
    const img = c.getImageData(0, 0, W, 60), p = img.data;
    for (let x = 0; x < W; x++) for (let y = aguaDesde[x]; y <= ABAJO; y++) {
      const d = y - aguaDesde[x], sy = aguaDesde[x] - 2 - Math.floor(d * 1.6), i = (y * W + x) * 4, j = (sy * W + x) * 4;
      if (sy < 0 || !p[j + 3] || (y + (x >> 2)) % 4 === 0) continue;
      const f = 0.5 * (1 - d / 16);
      if (f > 0) for (let q = 0; q < 3; q++) p[i + q] += (p[j + q] - p[i + q]) * f;
    }
    c.putImageData(img, 0, 0);
    for (let i = 0; i < 40; i++) { const x = Math.floor(azar() * W), y = 47 + Math.floor(azar() * 11); if (y >= aguaDesde[x]) r1(c, 'rgba(255,255,255,.18)', x, y, 3 + Math.floor(azar() * 4), 1); }
    // la hora y el tiempo tiñen todo; luego se encienden las luces
    const tinte = m.lluvia ? ['#56626C', m.modo === 'noche' ? 0.78 : 0.38] : TINTE[m.modo];
    if (tinte) {
      const im = c.getImageData(0, 0, W, 60), q = im.data, [tr, tg, tb] = hexRgb(tinte[0]);
      for (let i = 0; i < q.length; i += 4) if (q[i + 3]) { q[i] += (tr - q[i]) * tinte[1]; q[i + 1] += (tg - q[i + 1]) * tinte[1]; q[i + 2] += (tb - q[i + 2]) * tinte[1]; }
      c.putImageData(im, 0, 0);
    }
    if (m.modo === 'tarde' && !m.lluvia) for (let y = 47; y <= ABAJO; y += 2) { const w = 3 + y - 47; r1(c, 'rgba(255,190,110,.35)', 236 - (w >> 1), y, w, 1); } // el sol en el agua
    if (m.luces) {
      for (const [x, y] of luces) r1(c, (x * 7 + y) % 3 ? '#FFD27A' : '#FFE9B0', x, y, 1, 2);
      for (let x = 6; x < W; x += 14) { if (x > 172 && x < 308) continue; const y = (x < 177 ? orillaIzq(x) : orillaDer(x)) - 3; r1(c, '#FFE6A0', x, y); r1(c, 'rgba(255,214,140,.4)', x, aguaDesde[x] + 1, 1, 4); }
      for (let x = TORRE[0] - 4; x <= TORRE[1] + 4; x += 6) r1(c, '#FFF2C8', x, VIGA + 3); // el puente iluminado
    }
  }
  // nubes: manchas redondeadas de dos tonos
  function nube(w, h, azar, [claro, sombra]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), bolas = Array.from({ length: 4 }, (_, i) => [w * (0.2 + i * 0.2) + (azar() - 0.5) * 4, h * 0.62 - azar() * h * 0.3, h * (0.28 + azar() * 0.22)]);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      if (py > h * 0.8 || !bolas.some(([bx, by, r]) => (px - bx) ** 2 + ((py - by) * 1.3) ** 2 < r * r)) continue;
      x.fillStyle = py > h * 0.55 ? sombra : claro; x.fillRect(px, py, 1, 1);
    }
    return c;
  }
  let nubes = [];

  // ---------- el interior: la pared de los ventanales, suelos, paredes, alfombras, cuadros y carteles ----------
  // suelos de LimeZu (Room_Builder): bloque de 3×2 casillas; la tarima y las moquetas se hacen aquí (la versión gratuita no trae)
  const SUELO = { a: [11, 13], b: 'moquetaAzul', c: 'madera', e: 'madera', f: 'moquetaVerde', g: [11, 9], h: [14, 9] };
  const PARED = { e: 9, f: 13, g: 7, h: 11 }; // fila de Room_Builder con la tira de pared (columnas 4-6) de cada sala
  const TECHO = '#3A3A50', BORDE = '#F8F8F8';
  const esSuelo = (x, y) => /[a-hd]/.test(MAPA[y]?.[x] || '') && y > 4;
  const esPared = (x, y) => MAPA[y]?.[x] === '#' && (y === 10 || y === 16) && /[a-h]/.test(MAPA[y + 1]?.[x] || '');
  const salaDe = (x, y) => (MAPA[y][x] !== 'd' ? MAPA[y][x] : /[a-h]/.test(MAPA[y + 1]?.[x] || '') ? MAPA[y + 1][x] : MAPA[y][x - 1]);
  // moqueta: color liso con un rombo fino y algo de pelo
  const moqueta = (base, raya, pelo) => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'), azar = semilla(4);
    x.fillStyle = base; x.fillRect(0, 0, 32, 32);
    for (let py = 0; py < 32; py++) for (let px = 0; px < 32; px++) {
      if ((px + py) % 16 === 0 || (px - py + 32) % 16 === 0) { x.fillStyle = raya; x.fillRect(px, py, 1, 1); }
      else if (azar() < 0.06) { x.fillStyle = pelo; x.fillRect(px, py, 1, 1); }
    }
    return c;
  };
  const HECHO = { moquetaAzul: moqueta('#7C8AA0', '#8D9BB0', '#73819A'), moquetaVerde: moqueta('#5E7859', '#6B8665', '#56704F') };
  HECHO.madera = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const x = c.getContext('2d'), azar = semilla(3), tonos = ['#C9915C', '#C18853', '#D09A65', '#BB8250'];
    for (let f = 0; f < 8; f++) {
      const cortes = [0, 18, 41].map((v) => (v + f * 23 + Math.floor(azar() * 6)) % 64).sort((a, b) => a - b);
      cortes.forEach((ini, i) => {
        const fin = i + 1 < cortes.length ? cortes[i + 1] : cortes[0] + 64, col = tonos[Math.floor(azar() * 4)];
        for (const dx of [0, -64]) { x.fillStyle = col; x.fillRect(ini + dx, f * 4, fin - ini, 3); x.fillStyle = '#A06C42'; x.fillRect(fin - 1 + dx, f * 4, 1, 3); }
        if (azar() < 0.6) { x.fillStyle = '#B37A4A'; x.fillRect((ini + 4 + Math.floor(azar() * 10)) % 64, f * 4 + 1, 2, 1); }
      });
      x.fillStyle = '#9E6A40'; x.fillRect(0, f * 4 + 3, 64, 1);
    }
    return c;
  })();
  const pieza = (c, hoja, sx, sy, x, y) => c.drawImage(hoja, sx * T, sy * T, T, T, x * T, y * T, T, T);
  const dibujaPieza = (c, m) => (m.p ? c.drawImage(ARTE.int, ...P[m.p], m.pos[0], m.pos[1], m.pos[2], m.pos[3]) : c.drawImage(SPR[m.d], m.pos[0], m.pos[1]));
  function pintaInterior(c) {
    c.clearRect(0, 0, W, H);
    // la pared de los ventanales (filas 0-4): techo oscuro, cara clara, tres ventanales con su alféizar y el zócalo
    r1(c, '#E9E1D0', 16, 0, W - 32, 80); r1(c, '#DED4C0', 16, 62, W - 32, 12);
    r1(c, '#C2AE8E', 16, 74, W - 32, 6); r1(c, '#9C8566', 16, 74, W - 32, 1); r1(c, '#8A7457', 16, 79, W - 32, 1);
    r1(c, TECHO, 0, 0, W, 3); r1(c, BORDE, 16, 3, W - 32, 1);
    VENTANA.forEach(([x0, x1], i) => {
      r1(c, TECHO, x0, 5, x1 - x0, 53); r1(c, '#F4F1E8', x0 + 1, 6, x1 - x0 - 2, 51);
      c.clearRect(x0 + 2, 7, x1 - x0 - 4, 50);
      if (i !== 1) { const mid = (x0 + x1) >> 1; r1(c, TECHO, mid - 1, 7, 3, 50); r1(c, '#F4F1E8', mid, 7, 1, 50); } // Reuniones: un solo cristal para el puente
      for (let j = 0; j < 14; j++) r1(c, 'rgba(255,255,255,.09)', x0 + 8 + j, 40 - j * 2, 1, 2); // brillo del cristal
      for (let j = 0; j < 8; j++) r1(c, 'rgba(255,255,255,.07)', x0 + 16 + j, 30 - j * 2, 1, 2);
      r1(c, TECHO, x0 - 3, 57, x1 - x0 + 6, 6); r1(c, '#F7F4EC', x0 - 2, 58, x1 - x0 + 4, 2); r1(c, '#D6CEBE', x0 - 2, 60, x1 - x0 + 4, 2); // alféizar
    });
    // suelos, paredes (la cara que se ve desde la sala de abajo) y el techo oscuro con su borde blanco
    for (let y = 0; y < FILAS; y++) for (let x = 0; x < COLS; x++) {
      if (y < 5 && x > 0 && x < COLS - 1) continue;
      if (esSuelo(x, y)) {
        const s = SUELO[salaDe(x, y)];
        if (HECHO[s]) c.drawImage(HECHO[s], (x * T) % HECHO[s].width, (y * T) % 32, T, T, x * T, y * T, T, T);
        else if (ARTE.listo) pieza(c, ARTE.room, s[0] + (x % 3), s[1] + (y % 2), x, y);
        else r1(c, (SALAS[salaDe(x, y)] || SALAS.h)[1], x * T, y * T, T, T);
        if (MAPA[y - 1]?.[x] === '#' || MAPA[y - 1]?.[x] === 'W') r1(c, 'rgba(0,0,0,.13)', x * T, y * T, T, 2); // sombra al pie de la pared
        continue;
      }
      if (esPared(x, y)) {
        if (ARTE.listo) pieza(c, ARTE.room, 4 + (x % 3), PARED[y === 16 ? 'h' : MAPA[y + 1][x]], x, y); else r1(c, '#3A332B', x * T, y * T, T, T);
        r1(c, TECHO, x * T, y * T, T, 2); r1(c, BORDE, x * T, y * T + 2, T, 1);
        if (esSuelo(x, y - 1)) r1(c, BORDE, x * T, y * T, T, 1);
        if (MAPA[y][x - 1] === 'd') r1(c, TECHO, x * T, y * T, 1, T); // jambas de la puerta
        if (MAPA[y][x + 1] === 'd') r1(c, TECHO, x * T + T - 1, y * T, 1, T);
        continue;
      }
      r1(c, TECHO, x * T, y * T, T, T);
      c.fillStyle = BORDE;
      if (esSuelo(x - 1, y) || (y < 5 && x === COLS - 1)) c.fillRect(x * T, y * T + (y ? 0 : 3), 1, T);
      if (esSuelo(x + 1, y) || (y < 5 && x === 0)) c.fillRect(x * T + T - 1, y * T + (y ? 0 : 3), 1, T);
      if (esSuelo(x, y - 1)) c.fillRect(x * T, y * T, T, 1);
      if (esSuelo(x, y + 1)) c.fillRect(x * T, y * T + T - 1, T, 1);
    }
    // alfombras y lo colgado en las paredes
    if (ARTE.listo) for (const m of MUEBLES) if (m.capa) dibujaPieza(c, m);
    // carteles de las salas: bajo cada ventanal y en las paredes, donde no tapan nada
    for (const [txt, x, y] of [['DIRECCIÓN', 24, 64], ['REUNIONES', 168, 64], ['NEGOCIO', 344, 64], ['PRODUCCIÓN', 18, 164],
      ['CALIDAD', 164, 164], ['COCINA', 431, 164], ['SU BUZÓN', 18, 260]]) cartel(c, txt, x, y);
  }
  function pintaFondo() {
    const m = momento(), clave = m.modo + m.lluvia + m.luces + ARTE.listo;
    if (clave === fondoClave) return m;
    fondoClave = clave;
    pintaCielo(capas.cielo.getContext('2d'), m); pintaPaisaje(capas.paisaje.getContext('2d'), m); pintaInterior(capas.interior.getContext('2d'));
    const azar = semilla(9), tono = m.lluvia ? (m.modo === 'noche' ? NUBE.noche : NUBE.gris) : NUBE[m.modo];
    nubes = Array.from({ length: m.lluvia ? 7 : 4 }, (_, i) => ({ img: nube(26 + Math.floor(azar() * 22), 10 + Math.floor(azar() * 5), azar, tono),
      x: azar() * W, y: 4 + Math.floor(azar() * (m.lluvia ? 22 : 18)), v: (m.lluvia ? 3 : 1.2) + azar() * 1.6 }));
    return m;
  }

  // ---------- lo que se mueve fuera: nubes, gaviotas, barquilla, un velero y la lluvia ----------
  function exteriorFondo(t, m) {
    if (m.modo === 'noche' && !m.lluvia) for (let i = 0; i < 6; i++) if (Math.floor(t * 0.7 + i * 1.7) % 5 === 0) r1(g, '#FFFFFF', (i * 131 + 40) % W, (i * 17 + 5) % 34);
    for (const n of nubes) g.drawImage(n.img, Math.round(((n.x + t * n.v) % (W + 60)) - 50), n.y);
    if (m.modo !== 'noche' && !m.lluvia) for (let i = 0; i < 2; i++) { // gaviotas
      const x = Math.round(((i * 230 + t * (7 + i * 2)) % (W + 40)) - 20), y = Math.round(18 + i * 7 + 3 * Math.sin(t * 0.8 + i * 2)), col = m.modo === 'dia' ? '#F4F7FA' : '#3A3040';
      if (Math.floor(t * 4 + i) % 2) { r1(g, col, x, y); r1(g, col, x + 4, y); r1(g, col, x + 1, y + 1, 3, 1); } else { r1(g, col, x, y + 1); r1(g, col, x + 1, y, 3, 1); r1(g, col, x + 4, y + 1); }
    }
  }
  function exteriorFrente(t, m) {
    const noche = m.modo === 'noche';
    for (let i = 0; i < 28; i++) { // destellos en el agua
      const x = Math.floor((i * 53 + t * 3 * (i % 3 + 1)) % W), y = 47 + (i * 7) % 11;
      if (y >= aguaDesde[x]) r1(g, noche ? 'rgba(170,200,255,.18)' : 'rgba(255,255,255,.35)', x, y, 2 + (i % 3), 1);
    }
    if (!noche && Math.floor(t / 75) % 2 === 0) { // un velero cruza de vez en cuando
      const x = Math.round(-14 + (t % 75) / 75 * (W + 28));
      r1(g, '#5A3E2C', x, 55, 10, 2); r1(g, '#7A563E', x + 1, 55, 8, 1); r1(g, '#3A3A50', x + 4, 47, 1, 8);
      for (let j = 0; j < 7; j++) r1(g, '#F4F1E8', x + 5, 47 + j, Math.ceil(j * 0.7), 1);
    }
    // la barquilla: espera en cada orilla y cruza colgada de su carro en la viga
    const ciclo = t % 80, fase = ciclo < 10 ? 0 : ciclo < 40 ? (ciclo - 10) / 30 : ciclo < 50 ? 1 : 1 - (ciclo - 50) / 30;
    const suave = fase * fase * (3 - 2 * fase), bx = Math.round(TORRE[0] + 14 + suave * (TORRE[1] - TORRE[0] - 28)), by = 44;
    r1(g, '#2C313B', bx - 3, VIGA + 3, 7, 2);
    for (const [a, b] of [[-2, -8], [-1, -3], [1, 3], [2, 8]]) linea(g, noche ? '#4A5260' : '#8A919C', bx + a, VIGA + 5, bx + b, by);
    r1(g, '#3A3F48', bx - 10, by, 21, 6);
    r1(g, '#EEF0F2', bx - 9, by + 1, 5, 4); r1(g, '#EEF0F2', bx + 5, by + 1, 5, 4); r1(g, '#D3D8DD', bx - 4, by + 3, 9, 2);
    r1(g, noche ? '#FFD98A' : '#6E8AA0', bx - 8, by + 2, 3, 1); r1(g, noche ? '#FFD98A' : '#6E8AA0', bx + 6, by + 2, 3, 1);
    r1(g, '#B9BEC4', bx - 4, by + 2, 9, 1); r1(g, '#C44B3A', bx - 2, by + 3, 3, 1);
    r1(g, 'rgba(230,236,240,.22)', bx - 9, by + 7, 19, 1); r1(g, 'rgba(230,236,240,.14)', bx - 7, by + 9, 15, 1);
    if (noche || m.luces) for (const tx of TORRE) if (Math.floor(t * 1.2) % 2) r1(g, '#FF5A4A', tx, 2); // balizas rojas en lo alto
    if (m.lluvia) for (let i = 0; i < 90; i++) r1(g, 'rgba(210,225,240,.55)', Math.floor((i * 37 + t * 70) % W), Math.floor((i * 23 + t * 150) % 58), 1, 3);
  }

  // ---------- los muebles con volumen y los agentes, de atrás adelante ----------
  const PIEL = '#F1D2B2', OSCURO = '#2A1D14';
  const CARA = { right: 0, up: 1, left: 2, down: 3 };
  const CABEZA = () => (ARTE.listo ? 23 : 16); // altura de la cabeza sobre los pies
  function persona(a, y, t) {
    const x = Math.round(a.x), r = (col, dx, dy, w, hh) => { g.fillStyle = col; g.fillRect(x + dx, y + dy, w, hh); };
    const anda = a.camino.length > 0, pj = ARTE.listo && ARTE.pj[a.id];
    a.vy = y;
    if (pj) {
      r('rgba(0,0,0,.22)', -5, -1, 10, 2);
      if (quieto(a) && (a.gesto === 'tel' || (a.base?.act === 'habla' && !a.gesto)) && pj.tel) g.drawImage(pj.tel, (Math.floor(t * 6) % 9) * 16, 0, 16, 32, x - 8, y - 31, 16, 32);
      else {
        const f = anda ? Math.floor(a.paso * 1.25) % 6 : (Math.floor(t * 5) + a.id.length) % 6;
        g.drawImage(anda ? pj.corre : pj.quieto, ((CARA[a.cara] ?? 3) * 6 + f) * 16, 0, 16, 32, x - 8, y - 31, 16, 32);
      }
    } else {
      const [, , c, c2, h] = AG[a.id] || ['', '', '#26394B', '#1A2836', '#111'], f = anda ? Math.floor(a.paso) % 2 : 0;
      r('rgba(0,0,0,.28)', -4, -1, 8, 2);
      r('#2A2F3A', -3, -4, 2, 4 - f); r('#2A2F3A', 1, -4, 2, 3 + f);
      r(c, -4, -10, 8, 6); r(c2, -5, -10, 1, 5); r(c2, 4, -10, 1, 5); r(PIEL, -3, -15, 6, 5); r(h, -3, -16, 6, 2);
      if (a.cara === 'up') r(h, -3, -15, 6, 4);
      else if (a.cara === 'left') { r(h, 1, -15, 2, 3); r(OSCURO, -2, -13, 1, 1); }
      else if (a.cara === 'right') { r(h, -3, -15, 2, 3); r(OSCURO, 1, -13, 1, 1); }
      else { r(h, -3, -15, 1, 2); r(h, 2, -15, 1, 2); r(OSCURO, -2, -13, 1, 1); r(OSCURO, 1, -13, 1, 1); }
      if (a.id === 'default') r('#46D9FF', -1, -9, 2, 2);
    }
    if (a.lleva === 'taza') { r('#3A3A50', 3, -10, 5, 5); r('#F4F4F4', 4, -9, 3, 3); r('#8B5A3C', 4, -9, 3, 1); r('#3A3A50', 8, -9, 1, 2); }
    const lleva = a.lleva || (a.id === 'default' && anda && a.base?.act === 'pizarra' ? 'carpeta' : null); // a la reunión, con su carpeta
    const L = { carpeta: '#E8C26A', roja: '#E8C26A', sobre: '#F4F1E8', libro: '#9C3B3B' }[lleva];
    if (L) { r('#3A3A50', 2, -11, 7, 6); r(L, 3, -10, 5, 4); if (lleva === 'roja') r('#E05050', 6, -10, 2, 2); if (lleva === 'sobre') r('#B8B2A2', 4, -9, 3, 1); }
  }
  // el sillón de Harvey (respaldo alto de piel) y Harvey sentado detrás de su mesa, que se pinta encima y le tapa de cintura abajo
  function sillon(t) {
    const [cx, cy] = CASA.default, x = cx * T + 8, y = cy * T + 14, a = ag.default;
    r1(g, '#3A3A50', x - 8, y - 22, 16, 23); r1(g, '#4A2E28', x - 7, y - 21, 14, 21); r1(g, '#6E4C42', x - 6, y - 20, 12, 2);
    if (a.sit > 0) persona(a, Math.round(a.y + a.sit * 2), t);
  }
  // monitor de LimeZu (en la lámina, el que está sobre la mesilla verde) y su pantalla
  const PANTALLA = [2, 2, 9, 6];
  function pintaMesa(m, t) {
    const [px, py] = m.pos, a = ag[m.de], cx = CASA[m.de][0] * T + 8, n = m.pantallas || 1;
    if (m.de === 'default') { // la de Harvey, vista desde delante: la trasera del monitor a un lado, sus papeles y, si está sentado, teclea
      r1(g, '#3A3A50', px + 2, py - 4, 12, 9); r1(g, '#6C6E85', px + 3, py - 3, 10, 7); r1(g, '#3A3A50', px + 7, py + 5, 2, 2);
      g.drawImage(SPR[m.cosa], px + m.pos[2] - 3 - SPR[m.cosa].width, py + 6 - SPR[m.cosa].height);
      if (a.sit === 1) {
        const f = Math.floor(t * 7) % 2;
        r1(g, '#3A3A50', cx - 6, py + 3, 12, 3); r1(g, '#D9D9E0', cx - 5, py + 4, 10, 1); // teclado
        r1(g, '#FFCBB0', cx - 5 + f, py + 2 + f, 3, 2); r1(g, '#FFCBB0', cx + 2 - f, py + 3 - f, 3, 2);
        if (sonido.on && Math.random() < 0.12) suena('tecla');
      }
      return;
    }
    const on = a && a.base?.act && !['libre', 'pinta'].includes(a.base.act) && en(a, CASA[m.de]);
    for (let i = 0; i < n; i++) {
      const mx = Math.round(cx - 6.5 + (i - (n - 1) / 2) * 14), my = py - 5, [sx, sy, sw, sh] = PANTALLA;
      if (ARTE.listo) g.drawImage(ARTE.int, ...P.monitor, mx, my, P.monitor[2], P.monitor[3]); else r1(g, '#1B2633', mx + 2, my + 1, 10, 8);
      if (on) {
        r1(g, Math.floor(t * 3 + i) % 4 ? '#46D9FF' : '#7FE7FF', mx + sx, my + sy, sw, sh);
        if (a.base.act === 'lee') for (let l = 0; l < 2; l++) r1(g, '#0B3A4A', mx + sx + 1, my + sy + 1 + ((l * 2 + Math.floor(t * 4)) % 5), sw - 3, 1);
        if (a.base.act === 'teclea' && sonido.on && Math.random() < 0.18) suena('tecla');
      }
    }
    const izq = cx - px > 16; // el monitor ocupa una mitad de la mesa; en la otra, sus cosas
    if (m.cosa) g.drawImage(SPR[m.cosa], izq ? px + 3 : px + m.pos[2] - 3 - SPR[m.cosa].width, py + 6 - SPR[m.cosa].height);
    if (mesasCon.has(m.de)) g.drawImage(SPR.carpeta, izq ? px + 2 : px + 21, py + 2);
  }
  function pintaMueble(m, t) {
    if (m.de === 'default') sillon(t);
    if (!ARTE.listo && (m.p || m.t === 'mesa')) mueble(g, m); else dibujaPieza(g, m);
    const [px, py] = m.pos;
    if (m.t === 'mesa') pintaMesa(m, t);
    else if (m.t === 'cocina') g.drawImage(SPR.cafetera, px + 4, py - 6);
    else if (m.t === 'estanteria' && m.p === 'estA') for (let i = 0; i < libros.n; i++) r1(g, ['#9C3B3B', '#3B6E9C', '#5E8C3B'][i % 3], px + 4 + i * 3, py + 6, 2, 5);
    else if (m.t === 'pizarra') { // la pizarra de objetivos: una barra por objetivo activo
      const objs = tb?.data?.objetivos?.filter((o) => o.estado === 'activo') || [];
      objs.slice(0, 3).forEach((o, i) => {
        r1(g, 'rgba(255,255,255,.3)', px + 8, py + 4 + i * 3, 16, 2);
        r1(g, '#F4F1E8', px + 8, py + 4 + i * 3, Math.round(16 * (o.hitos.length ? o.hechos / o.hitos.length : 0)), 2);
      });
    } else if (m.t === 'sofa') { // los que descansan se sientan en el sofá: se les ve de cintura para arriba
      const [, , sw, sh] = m.pos, s = P.sofa;
      for (const a of Object.values(ag)) if (enSofa(a)) persona(a, py + sh - 7, t);
      if (ARTE.listo) g.drawImage(ARTE.int, s[0], s[1] + sh - 9, sw, 9, px, py + sh - 9, sw, 9);
    }
  }
  function escena(t) {
    const cosas = VOLUMEN.map((m) => [m.k, () => pintaMueble(m, t)]);
    for (const a of Object.values(ag)) {
      if (enSofa(a) || a.sit > 0) continue; // a Harvey sentado lo pinta su mesa (sillon)
      const sentado = quieto(a) && a.base && en(a, CASA[a.id] || []) && a.base.sitio === CASA[a.id];
      cosas.push([a.y, () => persona(a, Math.round(a.y) + (sentado ? 2 : 0), t)]);
    }
    cosas.sort((p, q) => p[0] - q[0]);
    for (const [, f] of cosas) f();
  }
  // muebles dibujados a mano en sencillo (si el arte de LimeZu no carga)
  function mueble(c, m) {
    const x = m.x * T, y = m.y * T, w = (m.w || 1) * T, h = (m.h || 1) * T;
    const r = (col, a, b, cw, ch) => { c.fillStyle = col; c.fillRect(x + a, y + b, cw, ch); };
    switch (m.t) {
      case 'mesa': r('#6E5238', 0, 6, w, 9); r('#8B6B4A', 0, 4, w, 8); break;
      case 'pizarra': r('#D9DEE2', 1, 1, w - 2, 10); r('#9AA3AA', 0, 11, w, 2); break;
      case 'mesareu': r('#5E4630', 0, 3, w, h - 6); r('#7A5C40', 1, 4, w - 2, h - 8); break;
      case 'silla': r('#7A5C40', 3, 4, 10, 10); break;
      case 'estanteria': r('#4A3423', 0, -6, w, 20); break;
      case 'nevera': r('#D6DADD', 2, -10, 12, 25); break;
      case 'sofa': case 'banco': r('#2F5A63', 0, 6, w, 10); break;
      case 'planta': case 'globo': case 'lampara': r('#7A4E33', 4, 9, 8, 6); r('#3E7A45', 2, 1, 12, 9); break;
      case 'frutero': r('#8B6B4A', 2, 4, 12, 10); break;
    }
  }
  function burbuja(x, abajo, txt, color) { // abajo = la punta de la burbuja
    const b = abajo - 12, ancho = anchoTexto(txt), w = Math.max(9, ancho + 4); x = Math.round(x);
    const x0 = Math.round(x - w / 2);
    r1(g, TECHO, x0 - 1, b - 1, w + 2, 11); r1(g, TECHO, x - 1, b + 10, 3, 2);
    r1(g, '#F4F7FA', x0, b, w, 9); r1(g, '#F4F7FA', x, b + 9, 1, 2);
    letras(g, txt, Math.round(x - ancho / 2), b + 2, color);
  }
  const GESTO = { cafe: '☕', regalo: '♥', pregunta: '?' }; // burbuja de los gestos de la vida
  // encima de todo: el aviso del buzón, burbujas, gestos de trabajo y el nombre de quien se señala
  function encima(t) {
    const aprobar = (datos?.espera || []).filter((x) => x.tipo === 'aprobar').length, bz = pieza1('buzon');
    if (aprobar && bz) {
      const [px, py, sw, sh] = bz.pos, pulso = 0.5 + 0.5 * Math.sin(t * 4);
      g.fillStyle = `rgba(255,181,71,${0.18 + pulso * 0.24})`; g.fillRect(px - 5, py - 4, sw + 10, sh + 6);
      r1(g, TECHO, px + 2, py + 1, 8, 5); r1(g, '#F4F1E8', px + 3, py + 2, 6, 3); // el sobre asoma por la ranura
      burbuja(px + sw / 2, py - 3, '!', '#C97D10');
    }
    const ahora = performance.now();
    for (const a of Object.values(ag)) {
      const b = a.base, q = !a.camino.length && !a.recados.length, cab = (a.vy ?? a.y) - CABEZA(), act = a.gesto || b?.act;
      const c = a.charla, turno = c && Math.floor((ahora - c.t0) / 1300);
      if (q && b?.burbuja) burbuja(a.x, cab - 2, b.burbuja, b.burbuja === '!' ? '#C97D10' : '#2B8DAF');
      else if (c && q && (turno % 2 === 0) === (c.quien[0] === a) && (ahora - c.t0) % 1300 < 1000) { // en una charla hablan por turnos
        const dice = DICE[a.id] || DICE_TODOS;
        burbuja(a.x, cab - 2, dice[(turno + a.id.length) % dice.length], '#2B8DAF');
      } else if (q && GESTO[a.gesto]) burbuja(a.x, cab - 2, GESTO[a.gesto], '#8B5A3C');
      else if (q && a.idea > ahora) burbuja(a.x, cab - 2, '!', '#C97D10');
      else if (q && act === 'lupa') { // la lupa de Sherlock, delante, moviéndose un poco
        const lx = Math.round(a.x + (a.cara === 'left' ? -9 : a.cara === 'right' ? 5 : -2)), ly = Math.round(cab + 9 + Math.sin(t * 3) * 1.5);
        r1(g, '#3A3A50', lx, ly, 5, 5); r1(g, '#BFE6F5', lx + 1, ly + 1, 3, 3); r1(g, '#FFFFFF', lx + 1, ly + 1, 1, 1); r1(g, '#6B4A2A', lx + 4, ly + 4, 2, 2);
      }
      else if (q && act === 'pizarra') { const [px, py] = pieza1('pizarra').pos; r1(g, '#2B8DAF', px + 6 + Math.floor(t * 4) % 18, py + 9 - Math.floor(t * 2) % 3, 2, 1); } // Harvey apunta en la pizarra
      else if (q && act === 'teclea' && a.id !== 'default' && Math.floor(t * 6) % 2) { r1(g, '#E6EFF5', a.x - 4, cab - 2); r1(g, '#E6EFF5', a.x + 3, cab - 3); }
      else if (q && act === 'revisa') { r1(g, '#E6EFF5', a.x + 6, cab - 3, 3, 1); r1(g, '#E6EFF5', a.x + 5, cab - 2, 1, 3); r1(g, '#E6EFF5', a.x + 9, cab - 2, 1, 3); r1(g, '#E6EFF5', a.x + 6, cab + 1, 3, 1); r1(g, '#E6EFF5', a.x + 10, cab + 2, 2, 1); }
      else if (q && act === 'pinta') { const [px, py] = pieza1('caballete').pos; r1(g, ['#E05050', '#46D9FF', '#5BE3A4'][Math.floor(t * 2) % 3], px + 2 + Math.floor(t * 3) % 9, py + 2 + Math.floor(t * 2) % 4, 2, 2); }
      else if (q && act === 'habla' && a.id !== 'jordan') { const [px, py] = pieza1('micro').pos; for (let i = 0; i <= Math.floor(t * 4) % 3; i++) r1(g, 'rgba(230,239,245,.85)', px + 10 + i * 2, py + 3 - i, 1, 3 + i * 2); }
      if (sel === a.id || raton === a.id) {
        const n = (AG[a.id]?.[0] || a.id).toUpperCase(), wN = anchoTexto(n) + 4, ny = cab - 4 - (b?.burbuja && q ? 13 : 0), x0 = Math.round(a.x - wN / 2);
        r1(g, 'rgba(6,12,20,.85)', x0, ny - 7, wN, 9); letras(g, n, x0 + 2, ny - 5, sel === a.id ? '#46D9FF' : '#E6EFF5');
      }
    }
    // el freno de cupo: luces bajas y cartel de pausa
    if (datos?.freno) {
      r1(g, 'rgba(0,0,0,.45)', 0, 80, W, H - 80);
      const txt = 'PAUSA · CUPO', w = anchoTexto(txt, 2);
      r1(g, '#FFB547', (W - w) / 2 - 8, H / 2 - 11, w + 16, 22); letras(g, txt, (W - w) / 2, H / 2 - 5, '#1A1205', 2);
    }
    if (!senal) {
      r1(g, 'rgba(6,12,20,.55)', 0, 0, W, H);
      const txt = 'SIN SEÑAL', w = anchoTexto(txt, 2);
      letras(g, txt, Math.round((W - w) / 2), H / 2 - 5, '#FF6B6B', 2);
    }
  }
  function dibuja(ms) {
    const t = ms / 1000, m = pintaFondo();
    g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    g.drawImage(capas.cielo, 0, 0); exteriorFondo(t, m);
    g.drawImage(capas.paisaje, 0, 0); exteriorFrente(t, m);
    lluviaSuena(sonido.on && m.lluvia && corriendo);
    g.drawImage(capas.interior, 0, 0);
    escena(t);
    encima(t);
  }
  let ultimo = 0;
  function bucle(ms) {
    if (!corriendo) return;
    requestAnimationFrame(bucle);
    if (ms - ultimo < 33) return; // 30 fotogramas por segundo bastan
    const dt = Math.min(0.1, (ms - (ultimo || ms)) / 1000);
    ultimo = ms;
    if (senal) for (const a of Object.values(ag)) { paso(a, dt); vida(a, dt); }
    dibuja(ms);
  }
  function arranca(on) {
    if (on === corriendo) return;
    corriendo = on;
    if (on) { ajusta(); ultimo = 0; requestAnimationFrame(bucle); } else lluviaSuena(false);
  }
  new MutationObserver(() => arranca(document.body.dataset.screen === 'oficina')).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });

  // ---------- tocar a un agente: su ficha ----------
  const enLienzo = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
  const quien = ([x, y]) => Object.values(ag).find((a) => Math.abs(a.x - x) <= 7 && y >= (a.vy ?? a.y) - CABEZA() - 2 && y <= (a.vy ?? a.y) + 2)?.id;
  cv.addEventListener('pointermove', (e) => { raton = quien(enLienzo(e)); cv.style.cursor = raton ? 'pointer' : ''; });
  cv.addEventListener('pointerleave', () => { raton = null; });
  cv.addEventListener('click', (e) => { const id = quien(enLienzo(e)); if (id) ficha(id); });
  document.getElementById('team-oficina').addEventListener('click', (e) => { const li = e.target.closest('[data-ag]'); if (li) ficha(li.dataset.ag); });
  function ficha(id) {
    sel = id;
    const caja = document.getElementById('of-ficha'), [nm, oficio] = AG[id] || [id, ''], b = ag[id].base || {};
    const d = datos || { tarjetas: [], espera: [] }, hoy = new Date().toDateString();
    const t = b.tarjeta, hechas = d.tarjetas.filter((x) => x.columna === 'hecho' && (x.autor || x.agente) === id && new Date(x.terminada * 1000).toDateString() === hoy);
    const cc = id === 'leonardo' && lastSnap?.claude?.ok ? lastSnap.claude.data.slice(0, 3) : [];
    const reu = id === 'default' && d.reunion?.cambio ? `<p class="note">Última reunión de dirección con trabajo: ${esc(ago(new Date(d.reunion.cambio) / 1000))}.</p>` : '';
    caja.innerHTML = `<div class="ph"><h2>${esc(nm)}</h2><span class="c">${esc(oficio)}</span><button type="button" class="x" aria-label="Cerrar la ficha">×</button></div>
      <p class="of-estado">${esc((ag[id].recado?.vida && ag[id].recado.texto) || b.texto || '—')}</p>${reu}
      ${t ? `<div class="of-tk"><b>${esc(t.titulo.replace(/^aprobar:\s*/i, ''))}</b><small>${esc(t.tablero)}${t.empezada ? ' · desde hace ' + esc(lapso((Date.now() / 1000 - t.empezada) / 60)) : ''}${t.paso ? ' · ' + esc(toolLabel(t.paso)) + ' ' + esc(ago(t.paso_t)) : ''}</small></div>` : ''}
      ${hechas.length ? `<h3>Entregado hoy</h3><ul>${hechas.map((x) => `<li>${esc(x.titulo)}</li>`).join('')}</ul>` : ''}
      ${cc.length ? `<h3>Claude Code</h3><ul>${cc.map((c) => `<li>${esc(c.titulo)} <small>${c.en_curso ? 'trabajando' : esc(ago(new Date(c.fin) / 1000))}</small></li>`).join('')}</ul>` : ''}
      ${t && id !== 'default' && t.tablero && /^t_/.test(t.id) ? `<form class="of-msg"><label for="of-texto">Dejarle un mensaje en su tarjeta</label>
        <textarea id="of-texto" rows="2" placeholder="Lo verá en su tarjeta: «céntrate en Barakaldo», «sin prisa»…"></textarea>
        <div class="acts"><button type="submit" class="si">DEJAR MENSAJE</button></div></form>` : ''}
      ${id === 'default' ? '<div class="acts"><button type="button" data-go="harvey">HABLAR CON HARVEY</button></div>' : ''}
      ${b.burbuja ? '<div class="acts"><button type="button" data-go="tablero">VER EN EL TABLERO</button></div>' : ''}`;
    caja.hidden = false;
    caja.querySelector('.x').onclick = () => { caja.hidden = true; sel = null; };
    caja.querySelector('.of-msg')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = caja.querySelector('#of-texto').value.trim();
      if (!texto) return caja.querySelector('#of-texto').focus();
      try { await api('comentario', { tablero: t.tablero, id: t.id, texto }); toast({ title: 'Mensaje dejado', text: `${nm} lo verá en su tarjeta.` }); caja.querySelector('#of-texto').value = ''; }
      catch (err) { toast({ title: 'No se pudo dejar el mensaje', text: err.message, warn: true }); }
    });
  }

  // ---------- rótulo con lo último que ha pasado ----------
  const FRASE = {
    created: (r) => `encargo nuevo para ${nombre(r.asignado)}: «${r.titulo}»`, review_requested: (r) => `${nombre(r.agente)} pasó «${r.titulo}» a Lince`,
    changes_requested: (r) => `Lince devolvió «${r.titulo}» con cambios`, completed: (r) => (/^archivar/i.test(r.titulo) ? `${nombre(r.agente)} archivó «${r.titulo.replace(/^archivar:\s*/i, '')}»` : `${nombre(r.agente)} terminó «${r.titulo}»`),
    blocked: (r) => `«${r.titulo}» espera una respuesta`, unblocked: (r) => `«${r.titulo}» sigue adelante`, commented: (r) => `nota nueva en «${r.titulo}»`,
  };
  const nombre = (id) => AG[id]?.[0] || id || 'el equipo';
  function rotulo(d) {
    const txt = d.recientes.slice(0, 8).map((r) => `<span>${esc(FRASE[r.tipo]?.(r) || r.titulo)} <small>${esc(ago(r.t))}</small></span>`).join('');
    const el = document.getElementById('rotulo');
    if (el.dataset.k !== txt) { el.dataset.k = txt; el.innerHTML = txt + txt; el.style.animationDuration = Math.max(30, d.recientes.length * 7) + 's'; }
  }

  return {
    datos(d) {
      senal = true;
      if (datos && !primeraVez) cambios(datos, d);
      datos = d;
      const bases = calcula(d);
      for (const id of ORDEN) {
        const a = ag[id];
        a.base = bases[id];
        if (!esLibre(a) && !enDespacho(a)) corta(a);
        if (primeraVez) { const [x, y, cara] = a.base.sitio; Object.assign(a, { x: x * T + 8, y: y * T + 14, cara, destino: [x, y], caraFinal: cara }); }
      }
      primeraVez = false;
      rotulo(d);
      if (sel && !document.getElementById('of-ficha').contains(document.activeElement)) ficha(sel); // sin borrar un mensaje a medias
    },
    sinSenal(no) { senal = !no; },
  };
})();
