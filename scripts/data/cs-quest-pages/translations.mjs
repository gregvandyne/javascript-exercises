// The CS Quest teacher-page chrome in the eleven translated languages (scripts/i18n-add-cs-quest-pages.mjs). Each language
// is written as nested arrays in the order of the keys of EN (en.mjs) and zipped onto those keys here, so a language that
// misses or adds a string fails loudly. Counts use a plain {count} (no plural forms needed).
import { EN } from './en.mjs';

function zip(en, arr, at = '') {
  const keys = Object.keys(en);
  if (!Array.isArray(arr) || arr.length !== keys.length) throw new Error(`${at || 'root'}: ${keys.length} keys, got ${Array.isArray(arr) ? arr.length : typeof arr}`);
  return Object.fromEntries(keys.map((k, i) => [k, en[k] && typeof en[k] === 'object' ? zip(en[k], arr[i], at ? `${at}.${k}` : k) : String(arr[i])]));
}

const RAW = {
  es: [[
    'Añadir a mi biblioteca',
    ['Nivel', 'Grados 3-5', 'Grados 6-8'],
    ['Antes de empezar', 'Los cuatro juegos están publicados. Prueba uno sin iniciar sesión en un dispositivo de alumno: /play/robo-route.', 'Aún sin publicar: {games}. Las lecciones que los usan muestran un aviso hasta entonces.', 'La sala en vivo está activada: los calentamientos y los tickets de salida pueden hacerse en vivo.', 'La sala en vivo está desactivada en este sitio: usa «Mostrar las preguntas en el proyector».', 'Los pasos de prueba están activados: los tickets de salida se califican en el libro de notas.', 'Los pasos de prueba están desactivados: los tickets de salida llegan como preguntas escritas.', 'Clases que das: {count} (la sala en vivo necesita una).', 'Zona horaria de la escuela: {zone}. Las fechas abren y cierran en esta zona.', 'La escuela aún no tiene zona horaria: las fechas usan la hora del servidor.', 'Los auriculares ayudan. El modo lección empieza sin música y con subtítulos.', 'La unidad 7 (el proyecto final) usa el Builder y necesita un plan escolar; las demás unidades funcionan sin él.'],
    ['Builder: activo', 'Builder: en descanso', 'unos {count} equipos pueden crear en esta clase', 'el Builder no está configurado en este sitio'],
    ['Empezar calentamiento (en vivo)', 'Mostrar las preguntas en el proyector', 'Empezar ¿Qué prefieres? (en vivo)', 'Abrir el juego en este capítulo', 'Ticket de salida en vivo', 'Repaso en vivo', 'Ticket de salida en el proyector', 'Imprimir', 'Imprimibles', 'Asignar a la clase', 'Asignar unidad...'],
    ['Mapa de cobertura', '{ids} estándares, {lessons} archivos de lección, {banks} bancos de preguntas.', 'Nivel CSTA {level} ({grades})', 'Ambos niveles', 'Cómo leerlo', 'Practicado', 'un alumno terminó un paso con este estándar (en parejas: turnaos para iniciar sesión). No es dominio.', 'Comprobado', 'se respondieron preguntas con este estándar; la precisión se muestra por clase.', 'Aplicado', 'el docente calificó de 0 a 3 una línea de rúbrica de este estándar.', 'Las lecciones en negrita enseñan el estándar; las normales lo tocan; las atenuadas preparan para él.', 'Preguntas: salida · repaso · calentamiento.', 'bancos sin cargar', 'Faltan archivos de lección ({count}):', 'Están todos los archivos de lección.', 'Solo en la unidad 7:', 'Prácticas por unidad', 'Práctica', 'Unidades',
      ['Estándar', 'Concepto', 'Prácticas', 'Lecciones', 'Actividad', 'Preguntas', 'Líneas de rúbrica']],
    ['De CS Quest {n} (v{version})', 'la versión {version} está disponible', 'Abrir el plan'],
    ['Abrir plan', 'Ver el juego'],
    ['Rutas', 'Una ruta añade sus lecciones de {band} a tu biblioteca con un clic.', 'Empieza aquí', 'Clases: {count}', 'Deja fuera:', 'Cubre todos los estándares de este nivel.'],
    ['Dar esta lección', 'Puedo', 'Estándares', 'También:', 'Prepara para:', 'Vocabulario:', 'Materiales', 'Para empezar', 'La clase de 45 minutos', 'Hora', 'Min', 'Qué pasa', 'Clase corta (40 min)', 'Bloque (80-90 min)', 'Conversación', 'Preguntas de calentamiento', 'En vivo como {mode}, {secs} segundos por pregunta, o en el proyector.', 'Explorar (guion del proyector)', 'Demostración', 'Haz esto', 'Di esto', 'Pregunta esto', 'Después', 'Gran idea', 'Jugar', 'Juego', 'nivel {n}', 'Niveles: {count}', 'Inicio', 'Meta', 'Reto extra', 'Agrupación', 'Qué observar', 'Error común del día', 'Para quien termina antes', 'Muéstramelo:', 'Ticket de salida', 'Frase:', 'Plantilla:', 'Rúbrica', 'Califica cada línea de 0 a 3 en el paso del libro de notas.', 'Línea', 'Diferenciación', 'Apoyo', 'Versión sin pantallas', 'Plan para suplente', 'Notas del docente', 'Lo que ven los alumnos', 'Los pasos que tu copia da a los alumnos. Edítalos en tu biblioteca después de añadir la lección.', 'Código de misión', 'Clase para en vivo y asignar:', 'La sala en vivo está desactivada en este sitio; muestra las preguntas en el proyector.', 'Primero añade la lección a tu biblioteca si aún no está.', 'El banco de preguntas de esta lección aún no está cargado.', '{game} aún no está publicado; los alumnos ven un aviso hasta entonces.', 'Esta lección aún no está escrita.', 'Cambiar a {band}'],
    ['Volver', 'Imprimir', 'página 2', 'Respuestas (solo docente)', 'Los alumnos inician sesión con sus tarjetas de clase.'],
    ['CS Quest', 'Informática para los grados 3-8', '{lessons} lecciones en {units} unidades', 'Cada lección es una clase de 45 minutos: para empezar, una demostración en el proyector, un capítulo del juego en parejas, una conversación corta y un ticket de salida.', 'Lecciones de este nivel en tu biblioteca: {count}', 'Mapa de cobertura', 'Las lecciones que añades son tus copias: edítalas como quieras.', 'Acerca de CS Quest'],
    ['Calentamiento', 'Ticket de salida', '{n} de {count}', 'Mostrar la respuesta', 'Anterior', 'Siguiente', 'Preguntas', 'Las flechas avanzan, Espacio muestra la respuesta.'],
    ['Ticket de salida (medias hojas)', 'Plan para suplente', 'Versión sin pantallas', 'Rúbrica', 'Hoja de planificación', 'Tarjeta de normas del Builder', 'Ticket de salida', 'Pasos', 'Imprime también:', 'Las propuestas no están cargadas; escríbelas en la tabla.', ['Nombre', 'Fecha', 'Equipo']],
    ['No está en tu biblioteca', 'En tu biblioteca', 'Actualización disponible', 'Añadida', 'Abrir', 'Próximamente', '{game} aún no publicado', 'Restablecer la versión de CS Quest', '¿Crear una copia nueva desde CS Quest? Tus clases y fechas pasan a ella; la copia anterior conserva el trabajo de los alumnos.', 'Restablecida la versión de CS Quest.'],
    ['Añadida a tu biblioteca.', 'Añadidas a tu biblioteca.'],
    ['Unidad {n}', 'Añadir unidad', 'Asignar unidad...', 'Lecciones: {count}', 'Opcional', 'Necesita un plan escolar'],
    ['Qué', 'La primera lección abre', 'Luego una lección', 'Entrega tras (días)', 'siguiente lección', 'Asignar', 'Cada lección abre en su propia fecha.', 'Lecciones asignadas a {class}: {count}.', ['cada día lectivo', 'cada día', 'dos veces por semana', 'cada semana']],
    ['Unidades'],
  ], [['{n} de {count}', 'Mostrar la respuesta', 'Ocultar la respuesta']],
  [[['Juegos de informática', 'Código, datos, redes y cómo funcionan los ordenadores', ['CS Quest para docentes']]],
    ['Guía a un robot con bloques: secuencias, bucles, condicionales, variables y funciones, y arregla los errores.', 'Ordena, grafica y limpia datos, y haz afirmaciones que las pruebas respalden.', 'Envía paquetes por una red, elige contraseñas fuertes y detecta trampas en línea.', 'Monta y repara ordenadores: piezas, entradas y salidas, bits y píxeles, diseño para todos.']]],
};
// The other languages follow in translations-more.mjs (kept apart so each file stays readable).
import { MORE } from './translations-more.mjs';
Object.assign(RAW, MORE);

const KEYS = { cs: EN.cs, js: EN.js, learn: EN.learn };
export const TRANSLATIONS = Object.fromEntries(Object.entries(RAW).map(([code, arr]) => {
  try { return [code, zip(KEYS, arr)]; } catch (e) { throw new Error(`${code}: ${e.message}`); }
}));
