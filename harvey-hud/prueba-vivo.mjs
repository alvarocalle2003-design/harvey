// Autoprueba de la conversación en vivo (app/vivo.js) sin micro: pide el token al HUD (PORT, por defecto 7777), abre Gemini
// Live, le escribe dos frases y comprueba que saluda de «señor» y que para la agenda llama a preguntar_a_harvey. ~0,01 $.
// Uso: node harvey-hud/prueba-vivo.mjs
const r = await fetch(`http://127.0.0.1:${process.env.PORT || 7777}/api/vivo-token`, { method: 'POST' });
const t = await r.json(); console.log('token:', r.status, t.model, t.voice, t.error || (t.token ? t.token.slice(0, 12) + '…' : ''));
if (!t.token) process.exit(1);
const url = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=' + encodeURIComponent(t.token);
const ws = new WebSocket(url);
let audio = 0, out = '', fase = 0, herramienta = false, senor = false; // respuesta inventada: no toca a Harvey
const decir = (txt) => ws.send(JSON.stringify({ realtimeInput: { text: txt } }));
ws.onopen = () => ws.send(JSON.stringify({ setup: { model: t.model,
  generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: t.voice } } } },
  systemInstruction: { parts: [{ text: 'Eres Harvey, mayordomo formal; hablas español de España y llamas «señor» al usuario. No sabes nada de su agenda: para eso usa SIEMPRE preguntar_a_harvey.' }] },
  tools: [{ functionDeclarations: [{ name: 'preguntar_a_harvey', behavior: 'NON_BLOCKING', description: 'Pregunta al Harvey completo (agenda, tareas, correo, acciones).',
    parameters: { type: 'OBJECT', properties: { peticion: { type: 'STRING' } }, required: ['peticion'] } }] }],
  inputAudioTranscription: {}, outputAudioTranscription: {} } }));
ws.onmessage = async (e) => {
  const m = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text());
  if (m.setupComplete) { console.log('setupComplete'); decir('Hola Harvey, ¿qué tal?'); }
  const sc = m.serverContent;
  if (sc?.modelTurn) for (const p of sc.modelTurn.parts || []) if (p.inlineData) audio += p.inlineData.data.length * 0.75;
  if (sc?.outputTranscription?.text) out += sc.outputTranscription.text;
  if (m.toolCall) {
    const fc = m.toolCall.functionCalls[0]; herramienta = fc.name === 'preguntar_a_harvey'; console.log('toolCall:', fc.name, JSON.stringify(fc.args), 'id', !!fc.id);
    ws.send(JSON.stringify({ toolResponse: { functionResponses: [{ id: fc.id, name: fc.name, response: { result: 'Mañana a las 10:00 tiene dentista y a las 17:00 reunión con Iker.' }, scheduling: 'WHEN_IDLE' }] } }));
  }
  if (sc?.turnComplete) {
    senor ||= /señor/i.test(out); console.log(`turno ${fase}: ${Math.round(audio / 1024)} KB de audio · «${out.trim()}»`); audio = 0; out = '';
    if (fase++ === 0) decir('¿Qué tengo mañana en la agenda?'); else if (fase > 2) ws.close();
  }
  if (m.goAway || m.error) console.log(JSON.stringify(m).slice(0, 300));
};
ws.onclose = (e) => { const ok = herramienta && senor; console.log(ok ? 'OK: conversación en vivo' : `FALLO: herramienta=${herramienta} señor=${senor}`, e.code, e.reason); process.exit(ok ? 0 : 1); };
setTimeout(() => { console.log('tiempo agotado'); ws.close(); }, 60_000);
