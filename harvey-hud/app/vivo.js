// Conversación EN VIVO del PC (propuesta G de la auditoría): con el interruptor «en vivo» encendido, la tecla º abre una
// conversación con Gemini Live en vez de la de por turnos. Contesta casi al instante y se le corta hablando encima.
// Gemini Live es solo «boca y oído»: para datos, acciones o pensar llama a la herramienta preguntar_a_harvey, que manda
// la petición al Harvey de siempre (misma conversación del HUD) y le devuelve su respuesta para que la diga.
// Va directo de esta ventana a Google con un token de un solo uso que fabrica el servidor del PC (/api/vivo-token).
// Coste: ~0,02 $ por minuto abierto; se cierra sola tras 45 s sin que nadie hable. Sesiones de 15 min como máximo.
// Usa de hud.js: $, post, api, load, save, link, aviso, toast, setState, Core, audioCtx, voiceAnalyser, chime,
// freshSession, session, push, repaint, toolLabel, convo, endConvo, ear, live, PC.
const Vivo = (() => {
  const WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=';
  const MUDO_MS = 45_000;
  let on = load('vivo', false), ws = null, mic = null, capCtx = null, sonando = [], playAt = 0, finTimer, mudoTimer;
  let dice = { yo: '', harvey: '' }, cerrarAlCallar = false, enviado = 0;

  const instrucciones = () => `Eres Harvey, el mayordomo del señor Álvaro: formal, cálido, frases cortas, un toque británico sutil y humor muy
ligero. Hablas siempre en español de España y le llamas «señor». Ahora es ${new Date().toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.
Tú eres solo la voz rápida. No sabes nada de su agenda, tareas, correo, hábitos, objetivos, su equipo de agentes ni de
la actualidad, y no puedes hacer nada por tu cuenta. Para TODO lo que necesite datos, hacer algo (apuntar, recordar,
mover, enviar, encargar), buscar o pensar a fondo, llama a preguntar_a_harvey con la petición del señor completa y el
contexto que haga falta de esta conversación. Mientras esperas, di solo una frase breve («Un momento, señor, lo consulto»).
Cuando llegue la respuesta, cuéntasela con naturalidad y sin añadir nada que no esté en ella. Si Harvey pide una
confirmación, pregúntasela al señor y pasa su respuesta con otra llamada a preguntar_a_harvey. Nunca inventes datos.
Saludos y cortesía, contéstalos tú. Si el señor se despide o da la conversación por terminada, despídete en una frase y
llama a terminar_conversacion.`;
  const HERRAMIENTAS = [{ functionDeclarations: [
    { name: 'preguntar_a_harvey', behavior: 'NON_BLOCKING',
      description: 'Pregunta o encarga algo al Harvey completo, que tiene la agenda, tareas, correo, hábitos, notas, el equipo y herramientas para actuar. Devuelve su respuesta.',
      parameters: { type: 'OBJECT', properties: { peticion: { type: 'STRING', description: 'Lo que pide el señor, completo y con el contexto necesario.' } }, required: ['peticion'] } },
    { name: 'terminar_conversacion', description: 'Cierra la conversación en vivo tras despedirte.' },
  ] }];

  const enviar = (o) => { if (ws?.readyState === 1) ws.send(JSON.stringify(o)); };
  const despierto = () => { clearTimeout(mudoTimer); mudoTimer = setTimeout(() => { aviso('Conversación en vivo cerrada: 45 s sin hablar.'); parar(); }, MUDO_MS); };

  // ---------- Micrófono → PCM 16 bits a 16 kHz, en trozos de 100 ms ----------
  const WORKLET = `registerProcessor('pcm', class extends AudioWorkletProcessor {
    process(i) { if (i[0][0]) this.port.postMessage(i[0][0].slice(0)); return true; } });`;
  async function abrirMicro() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    capCtx = new AudioContext({ sampleRate: 16000 }); // el navegador remuestrea el micro a 16 kHz
    await capCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
    const node = new AudioWorkletNode(capCtx, 'pcm');
    let trozo = new Float32Array(1600), n = 0;
    node.port.onmessage = ({ data }) => {
      for (const s of data) {
        trozo[n++] = s;
        if (n < trozo.length) continue;
        const pcm = new Int16Array(n);
        for (let k = 0; k < n; k++) pcm[k] = Math.max(-1, Math.min(1, trozo[k])) * 0x7fff;
        let bin = ''; for (const b of new Uint8Array(pcm.buffer)) bin += String.fromCharCode(b);
        enviar({ realtimeInput: { audio: { data: btoa(bin), mimeType: 'audio/pcm;rate=16000' } } });
        n = 0;
      }
    };
    capCtx.createMediaStreamSource(stream).connect(node);
    mic = stream;
  }

  // ---------- Voz de Gemini (PCM 24 kHz) por el mismo analizador que anima el núcleo ----------
  function sonar(b64) {
    const ctx = audioCtx(), bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const pcm = new DataView(bytes.buffer), n = bytes.length >> 1;
    if (!n) return;
    const buf = ctx.createBuffer(1, n, 24000), ch = buf.getChannelData(0);
    for (let k = 0; k < n; k++) ch[k] = pcm.getInt16(k * 2, true) / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(voiceAnalyser);
    if (!sonando.length) { setState('speaking', 'En vivo · hable encima para cortarle · º para terminar'); Core.feed(voiceAnalyser); }
    playAt = Math.max(playAt, ctx.currentTime + 0.05);
    src.start(playAt); playAt += buf.duration;
    sonando.push(src);
    clearTimeout(finTimer);
    finTimer = setTimeout(callado, (playAt - ctx.currentTime) * 1000 + 100);
  }
  function callado() {
    sonando = []; Core.feed(null);
    if (cerrarAlCallar) return parar();
    if (ws) setState('listening', 'En vivo · le escucho · º para terminar');
  }
  function cortar() { clearTimeout(finTimer); sonando.forEach((s) => { try { s.stop(); } catch {} }); playAt = 0; callado(); }

  // lo dicho por cada uno, a la conversación de la pantalla (al final de cada turno)
  // si la voz en vivo solo repite la respuesta de Harvey (ya en pantalla, con sus pasos), no se duplica
  let ultima = '';
  const igual = (a, b) => { const n = (s) => s.toLowerCase().replace(/[^\p{L}\d]/gu, '').slice(0, 60); return !!a && n(a) === n(b); };
  function volcar() {
    if (dice.yo.trim()) push({ who: 'yo', text: dice.yo.trim(), voz: true });
    if (dice.harvey.trim() && !igual(ultima, dice.harvey)) push({ who: 'harvey', text: dice.harvey.trim(), fresh: true });
    dice = { yo: '', harvey: '' };
  }

  // ---------- El Harvey de siempre, como herramienta ----------
  async function consultar(peticion) {
    freshSession();
    const m = push({ who: 'harvey', text: '', tools: [], typing: true, ack: 'Consultando a Harvey · ' + peticion });
    const fin = (text, error) => { Object.assign(m, { text, typing: false, error }); m.tools.forEach((t) => { if (t.s === 'run') t.s = error ? 'fail' : 'done'; }); repaint(m); return text; };
    try {
      const key = session;
      const r = await api('ask', { text: `[Pregunta desde la conversación en vivo: otra voz le dirá al señor lo que contestes, ve al grano.]\n\n${peticion}`, session: key });
      if (!r.run_id) throw new Error('Harvey no ha aceptado la orden');
      const q = `run=${encodeURIComponent(r.run_id)}&session=${encodeURIComponent(key)}`;
      const salida = await new Promise((ok, ko) => {
        let txt = '';
        const es = new EventSource('/api/events?' + q);
        es.onmessage = (e) => {
          let ev; try { ev = JSON.parse(e.data); } catch { return; }
          if (ev.event === 'message.delta') { txt += ev.delta || ''; m.text = txt; repaint(m); }
          else if (ev.event === 'tool.started') { m.tools.push({ id: ev.tool_call_id, label: toolLabel(ev.tool), s: 'run' }); repaint(m); }
          else if (ev.event === 'tool.completed') { const t = m.tools.find((x) => x.s === 'run' && x.id === ev.tool_call_id); if (t) { t.s = ev.error ? 'fail' : 'done'; repaint(m); } }
          else if (ev.event === 'approval.request') toast({ title: 'Harvey pide permiso', text: ev.description || ev.command || '', ttl: 0, actions: [
            { label: 'Aprobar', run: () => post('approval', { run: r.run_id, choice: 'once', request_id: ev.request_id, session: key }) },
            { label: 'Rechazar', run: () => post('approval', { run: r.run_id, choice: 'deny', request_id: ev.request_id, session: key }) }] });
          else if (ev.event === 'run.completed') { es.close(); ok(ev.output || txt); }
          else if (/^run\.(failed|interrupted|cancelled)$/.test(ev.event)) { es.close(); ko(new Error(ev.error?.message || ev.error || 'no ha podido completarse')); }
        };
        es.onerror = async () => { // flujo cortado: se pregunta cómo va hasta que termine (máx. 10 min)
          es.close();
          for (let i = 0; i < 300; i++) {
            const st = await api('run?' + q).catch(() => ({}));
            if (st.status === 'completed') return ok(st.output || txt);
            if (['failed', 'cancelled', 'interrupted'].includes(st.status)) return ko(new Error('no ha podido completarse'));
            await sleep(2000);
          }
          ko(new Error('tarda demasiado'));
        };
      });
      return (ultima = fin(salida.replace(/\[FIN\]/g, '').trim() || 'Hecho.', false));
    } catch (e) { return fin('Harvey no ha podido: ' + e.message, true); }
  }

  // ---------- Sesión ----------
  async function empezar() {
    if (ws) return;
    if (live) return aviso('Termine o detenga la orden en curso antes de hablar en vivo.');
    if (convo) endConvo(false);
    ear.mute(true); // el oído de Edge no debe oír «Oye Harvey» mientras tanto
    setState('thinking', 'Abriendo conversación en vivo…');
    try {
      const t = await api('vivo-token', {});
      ws = new WebSocket(WS + encodeURIComponent(t.token));
      ws.onopen = () => enviar({ setup: { model: t.model,
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: t.voice } } } },
        systemInstruction: { parts: [{ text: instrucciones() }] }, tools: HERRAMIENTAS,
        inputAudioTranscription: {}, outputAudioTranscription: {} } });
      ws.onmessage = async (e) => {
        let m; try { m = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text()); } catch { return; }
        if (m.setupComplete) {
          try { await abrirMicro(); } catch (err) { aviso('Sin micrófono para la conversación en vivo: ' + err.message, true); return parar(); }
          document.body.classList.add('en-convo', 'en-vivo'); chime(); despierto();
          setState('listening', 'En vivo · le escucho · º para terminar');
          enviado = Date.now();
        }
        const sc = m.serverContent;
        if (sc?.interrupted) cortar(); // le ha hablado encima: se calla ya
        for (const p of sc?.modelTurn?.parts || []) if (p.inlineData?.data) sonar(p.inlineData.data);
        if (sc?.inputTranscription?.text) { dice.yo += sc.inputTranscription.text; despierto(); }
        if (sc?.outputTranscription?.text) { dice.harvey += sc.outputTranscription.text; despierto(); }
        if (sc?.turnComplete) volcar();
        for (const fc of m.toolCall?.functionCalls || []) {
          despierto(); volcar();
          if (fc.name === 'terminar_conversacion') { cerrarAlCallar = true; if (!sonando.length) setTimeout(parar, 1500); continue; }
          if (!sonando.length) setState('thinking', 'En vivo · consultando a Harvey…'); // Gemini calla mientras espera
          const result = await consultar(fc.args?.peticion || '');
          enviar({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result }, scheduling: 'WHEN_IDLE' }] } });
          despierto();
        }
        if (m.goAway) aviso('La conversación en vivo se cerrará en breve (límite de 15 minutos).');
      };
      ws.onclose = (e) => {
        const antes = ws; ws = null;
        if (antes && e.code !== 1000) aviso('Conversación en vivo cortada' + (e.reason ? ': ' + e.reason : '.'), true);
        parar();
      };
    } catch (e) { aviso('No se pudo abrir la conversación en vivo: ' + e.message, true); parar(); }
  }
  function parar() {
    clearTimeout(mudoTimer);
    const minutos = enviado ? (Date.now() - enviado) / 60000 : 0;
    if (ws) { const w = ws; ws = null; w.close(1000); }
    mic?.getTracks().forEach((t) => t.stop()); mic = null;
    capCtx?.close().catch(() => {}); capCtx = null;
    cortar(); volcar();
    cerrarAlCallar = false; enviado = 0;
    document.body.classList.remove('en-convo', 'en-vivo');
    ear.mute(false); setState('idle');
    if (minutos >= 0.5) console.log(`[vivo] ${minutos.toFixed(1)} min ≈ ${(minutos * 0.023).toFixed(2)} $`);
  }

  // ---------- Interruptor «en vivo» (solo en el PC) ----------
  const boton = $('.links [data-k="vivo"]');
  const pintar = () => { boton.hidden = !PC; link('vivo', on ? 'on' : ''); };
  boton?.addEventListener('click', () => { on = !on; save('vivo', on); if (!on) parar(); pintar(); aviso(on ? 'En vivo: pulse º para hablar con Harvey al instante.' : 'Conversación por turnos (la de siempre).'); });
  return {
    pintar,
    get activo() { return PC && on; },
    get abierto() { return !!ws; },
    alternar: () => (ws ? parar() : empezar()),
    parar,
  };
})();
