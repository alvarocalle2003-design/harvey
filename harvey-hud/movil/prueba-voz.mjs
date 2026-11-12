// Autoprueba de lo que Harvey dice en voz alta (sin red): node prueba-voz.mjs
import assert from 'node:assert/strict';
import { hablable } from './voz.mjs';

assert.equal(hablable('Mire **esto**: https://drive.google.com/x?id=1 y escriba a ana@empresa.es'), 'Mire esto: y escriba a.');
assert.equal(hablable('Tareas de hoy:\n- Llamar a Haro\n- Gimnasio 🏋️\n---\n1. Leer'), 'Tareas de hoy: Llamar a Haro. Gimnasio. Leer.');
assert.equal(hablable('Vea [el informe](https://x.com) → mañana'), 'Vea el informe, mañana.');
assert.equal(hablable('Hasta luego, señor. [FIN]'), 'Hasta luego, señor.');
assert.equal(hablable('Son 3,5 € el 20/10 al 15 %'), 'Son 3,5 € el 20/10 al 15 %.');
assert.equal(hablable('🔗 https://x.com'), '');
console.log('voz: ok');
