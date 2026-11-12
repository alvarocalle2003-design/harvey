// Autoprueba de lo que Harvey dice en voz alta (sin red): node prueba-voz.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hablable, reglaAck, ordenLlana } from './voz.mjs';

assert.equal(hablable('Mire **esto**: https://drive.google.com/x?id=1 y escriba a ana@empresa.es'), 'Mire esto: y escriba a.');
assert.equal(hablable('Tareas de hoy:\n- Llamar a Haro\n- Gimnasio 🏋️\n---\n1. Leer'), 'Tareas de hoy: Llamar a Haro. Gimnasio. Leer.');
assert.equal(hablable('Vea [el informe](https://x.com) → mañana'), 'Vea el informe, mañana.');
assert.equal(hablable('Hasta luego, señor. [FIN]'), 'Hasta luego, señor.');
assert.equal(hablable('Son 3,5 € el 20/10 al 15 %'), 'Son 3,5 € el 20/10 al 15 %.');
assert.equal(hablable('🔗 https://x.com'), '');

// Confirmaciones («Recibido»): se eligen por cómo empieza la orden. Casos reales en los que la regla vieja (palabras
// sueltas) decía algo que no venía a cuento.
const ack = JSON.parse(readFileSync(new URL('./frases.json', import.meta.url), 'utf8')).ack;
const dice = (orden) => reglaAck(ack, orden).frases[0];
assert.equal(ordenLlana('¿Buenas Harvey, qué tengo mañana?'), '¿que tengo manana?');
assert.equal(dice('No quiero que me notifiques los correos de nuevos dispositivos'), 'Entendido, señor.');         // antes «Reviso su correo»
assert.equal(dice('Estoy pensando en apuntarme a la piscina de 42 Urduliz ¿Qué te parece?'), 'Veamos, señor.');  // antes «Anotando la tarea»
assert.equal(dice('Prueba desde la app: dime qué tiempo hace hoy'), 'Entendido, señor.');                         // antes «Me pongo con el desarrollo»
assert.equal(dice('Luego también en la mañana siguiente.'), 'Entendido, señor.');                                 // antes «Consulto su agenda»
assert.equal(dice('Tengo dos tareas para que apuntes'), 'Entendido, señor.');
assert.equal(dice('Buenas tardes, Harvey'), 'A su servicio, señor.'); // solo saludo
assert.equal(dice('¿Qué dice el correo?'), 'Reviso su correo, señor.');
assert.equal(dice('Oye Harvey, ¿tengo algo pendiente para hoy?'), 'Reviso sus tareas, señor.');
assert.equal(dice('¿Qué tengo mañana?'), 'Consulto su agenda, señor.');
assert.equal(dice('Vale, apunta como tarea para el lunes escribir a Iker'), 'Lo apunto ahora mismo, señor.');
assert.equal(dice('Recuérdame el domingo llamar al médico'), 'Por supuesto, señor. Se lo recordaré.');
assert.equal(dice('marca el check en el hábito de instagram'), 'Recibido, señor. Lo registro en sus hábitos.');
assert.equal(dice('Hazme una web para la lonja'), 'Entendido, señor. Me pongo con el desarrollo.');
assert.equal(dice('Borra la tarea de la lotera'), 'Enseguida, señor.');
for (const r of ack) for (const f of r.frases) assert.ok(f.length <= 80, f); // más largas no se guardan en disco
console.log('voz: ok');
