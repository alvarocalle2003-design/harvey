// Núcleo animado de Harvey (canvas). API: Core.setState('idle'|'listening'|'thinking'|'speaking'), Core.feed(analyser|null)
// Rendimiento: el brillo (shadowBlur) era casi todo el coste de cada fotograma. Las piezas fijas que solo giran
// (marcas, segmentos, arcos) se dibujan con su brillo una vez en capas aparte y en cada fotograma solo se giran y se
// estampan; las partículas usan un punto brillante ya dibujado. En reposo va a 30 fotogramas por segundo.
window.Core = (() => {
  const cv = document.getElementById('core');
  const ctx = cv.getContext('2d');
  const COLORS = {
    idle: [70, 217, 255], listening: [220, 250, 255], thinking: [255, 181, 71], speaking: [70, 217, 255],
  };
  let state = 'idle', analyser = null, freq = new Uint8Array(64), level = 0, t = 0, last = 0, W = 0, H = 0, dpr = 1;
  let col = [...COLORS.idle];
  const particles = Array.from({ length: 70 }, () => ({
    a: Math.random() * Math.PI * 2, r: 0.55 + Math.random() * 0.5, s: (Math.random() - 0.5) * 0.004, z: Math.random(),
  }));

  function resize() {
    const b = cv.getBoundingClientRect();
    dpr = devicePixelRatio || 1; W = b.width; H = b.height;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize); resize();

  const rgbaOf = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const rgba = (a) => rgbaOf(col, a);
  const arc = (g, c, r, a0, a1, w, alpha) => { g.beginPath(); g.arc(0, 0, r, a0, a1); g.lineWidth = w; g.strokeStyle = rgbaOf(c, alpha); g.stroke(); };

  // Capas con brillo, rehechas solo si cambia el tamaño o el color (en saltos de 16 por canal)
  const layers = { key: '' };
  function layer(half, draw) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = c.height = Math.ceil(half * 2 * dpr);
    g.setTransform(dpr, 0, 0, dpr, half * dpr, half * dpr);
    draw(g);
    return { c, half };
  }
  function buildLayers(R) {
    const c = col.map((v) => Math.round(v / 16) * 16), key = `${R.toFixed(1)}|${dpr}|${c}`;
    if (key === layers.key) return;
    const glow = (g) => { g.shadowColor = rgbaOf(c, 0.9); g.shadowBlur = 14; };
    layers.key = key;
    layers.ticks = layer(R * 1.27 + 24, (g) => { // anillo exterior de marcas
      glow(g);
      for (let i = 0; i < 144; i++) {
        const a = (i / 144) * Math.PI * 2, long = i % 12 === 0;
        g.beginPath();
        g.moveTo(Math.cos(a) * R * 1.18, Math.sin(a) * R * 1.18);
        g.lineTo(Math.cos(a) * R * (long ? 1.27 : 1.22), Math.sin(a) * R * (long ? 1.27 : 1.22));
        g.lineWidth = long ? 2 : 1; g.strokeStyle = rgbaOf(c, long ? 0.8 : 0.3); g.stroke();
      }
    });
    layers.segs = layer(R * 1.08 + 24, (g) => { glow(g); for (let i = 0; i < 6; i++) arc(g, c, R * 1.08, i * Math.PI / 3, i * Math.PI / 3 + Math.PI / 5, 3, 0.55); });
    layers.arcs = layer(R * 0.98 + 24, (g) => {
      glow(g);
      arc(g, c, R * 0.98, 0, Math.PI * 0.6, 1.5, 0.9); arc(g, c, R * 0.98, Math.PI, Math.PI * 1.25, 1.5, 0.9);
      arc(g, c, R * 0.92, 0, Math.PI * 2, 1, 0.25);
    });
    layers.dot = layer(10, (g) => { glow(g); g.fillStyle = rgbaOf(c, 1); g.fillRect(0, 0, 1.6, 1.6); });
  }
  const stamp = (l, angle) => {
    ctx.save(); ctx.rotate(angle); ctx.drawImage(l.c, -l.half, -l.half, l.half * 2, l.half * 2); ctx.restore();
  };

  function frame(now) {
    requestAnimationFrame(frame);
    // en reposo, sin voz ni micro, basta con 30 fotogramas por segundo
    if (last && !analyser && state === 'idle' && now - last < 30) return;
    const k = last ? Math.min((now - last) / (1000 / 60), 3) : 1; // fotogramas de 60 Hz transcurridos
    last = now;
    const R = Math.min(W, H) * 0.36;
    t += k / 60;
    // color y nivel suavizados
    COLORS[state].forEach((c, i) => col[i] += (c - col[i]) * Math.min(1, 0.06 * k));
    let target = 0;
    if (analyser) {
      analyser.getByteFrequencyData(freq);
      target = freq.reduce((s, v) => s + v, 0) / freq.length / 255 * 1.8;
    } else if (state === 'listening') target = 0.15 + Math.sin(t * 6) * 0.05;
    else if (state === 'thinking') target = 0.1;
    level += (Math.min(target, 1) - level) * Math.min(1, 0.25 * k);
    const spin = state === 'thinking' ? 3.2 : state === 'listening' ? 1.6 : 1;
    if (R <= 0) return;
    buildLayers(R);

    ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H * 0.47);

    // halo
    const halo = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 1.5);
    halo.addColorStop(0, rgba(0.18 + level * 0.25)); halo.addColorStop(1, rgba(0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, Math.PI * 2); ctx.fill();

    // marcas y segmentos que giran en sentidos opuestos
    stamp(layers.ticks, t * 0.05 * spin);
    stamp(layers.segs, -t * 0.22 * spin);
    stamp(layers.arcs, t * 0.35 * spin);

    // barrido rápido al pensar
    if (state === 'thinking') {
      ctx.save(); ctx.rotate(t * 4);
      const g = ctx.createConicGradient(0, 0, 0);
      g.addColorStop(0, rgba(0.5)); g.addColorStop(0.15, rgba(0)); g.addColorStop(1, rgba(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // onda circular del espectro de voz (el brillo, con un trazo ancho y tenue debajo)
    ctx.beginPath();
    const N = 128;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const fi = Math.floor((i < N / 2 ? i : N - i) / (N / 2) * (freq.length - 1));
      const amp = analyser ? freq[fi] / 255 : 0;
      const r = R * (0.78 + amp * 0.22 * (0.6 + level) + Math.sin(a * 6 + t * 2) * 0.006);
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.lineWidth = 10; ctx.strokeStyle = rgba(0.07); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = rgba(0.14); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(0.75); ctx.stroke();

    // partículas en órbita
    const d = layers.dot;
    for (const p of particles) {
      p.a += p.s * spin * (1 + level * 3) * k;
      const r = R * p.r * (1 + level * 0.15);
      ctx.globalAlpha = 0.25 + p.z * 0.6;
      ctx.drawImage(d.c, Math.cos(p.a) * r - d.half, Math.sin(p.a) * r - d.half, d.half * 2, d.half * 2);
    }
    ctx.globalAlpha = 1;

    // orbe central
    const core = R * (0.36 + level * 0.14 + Math.sin(t * 1.5) * 0.01);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, core);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, rgba(0.85)); g.addColorStop(1, rgba(0.05));
    ctx.shadowColor = rgba(0.9); ctx.shadowBlur = 40 + level * 40;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, core, 0, Math.PI * 2); ctx.fill();
    arc(ctx, col, core * 1.12, 0, Math.PI * 2, 1, 0.6);

    ctx.restore();
  }
  requestAnimationFrame(frame);

  return {
    setState(s) { state = s; },
    feed(a) { analyser = a; if (a) freq = new Uint8Array(a.frequencyBinCount); else freq.fill(0); },
  };
})();
