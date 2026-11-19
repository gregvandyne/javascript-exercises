// Oomba Figures: the few words a figure writes by itself when the data gives none (axis names, "object" and "image"),
// in the site's languages. Physics and chemistry symbols (F, W, N, T, 2F, C, p, n, pH) are the same everywhere and are
// not translated. Data can always give its own labels, in the builder's language.
export const FIG_WORDS = {
  en: { object: 'object', image: 'image', time: 'Time', distance: 'Distance', velocity: 'Velocity', displacement: 'Displacement', volumeAdded: 'Volume added', remaining: 'Amount left', halfLife: 'half-life', eqPoint: 'equivalence point', reading: 'Reading' },
  es: { object: 'objeto', image: 'imagen', time: 'Tiempo', distance: 'Distancia', velocity: 'Velocidad', displacement: 'Desplazamiento', volumeAdded: 'Volumen añadido', remaining: 'Cantidad restante', halfLife: 'semivida', eqPoint: 'punto de equivalencia', reading: 'Lectura' },
  fr: { object: 'objet', image: 'image', time: 'Temps', distance: 'Distance', velocity: 'Vitesse', displacement: 'Déplacement', volumeAdded: 'Volume versé', remaining: 'Quantité restante', halfLife: 'demi-vie', eqPoint: "point d'équivalence", reading: 'Lecture' },
  de: { object: 'Gegenstand', image: 'Bild', time: 'Zeit', distance: 'Strecke', velocity: 'Geschwindigkeit', displacement: 'Verschiebung', volumeAdded: 'Zugegebenes Volumen', remaining: 'Verbleibende Menge', halfLife: 'Halbwertszeit', eqPoint: 'Äquivalenzpunkt', reading: 'Ablesung' },
  it: { object: 'oggetto', image: 'immagine', time: 'Tempo', distance: 'Distanza', velocity: 'Velocità', displacement: 'Spostamento', volumeAdded: 'Volume aggiunto', remaining: 'Quantità rimasta', halfLife: 'tempo di dimezzamento', eqPoint: 'punto di equivalenza', reading: 'Lettura' },
  pt: { object: 'objeto', image: 'imagem', time: 'Tempo', distance: 'Distância', velocity: 'Velocidade', displacement: 'Deslocamento', volumeAdded: 'Volume adicionado', remaining: 'Quantidade restante', halfLife: 'meia-vida', eqPoint: 'ponto de equivalência', reading: 'Leitura' },
  nl: { object: 'voorwerp', image: 'beeld', time: 'Tijd', distance: 'Afstand', velocity: 'Snelheid', displacement: 'Verplaatsing', volumeAdded: 'Toegevoegd volume', remaining: 'Hoeveelheid over', halfLife: 'halveringstijd', eqPoint: 'equivalentiepunt', reading: 'Aflezing' },
  ru: { object: 'предмет', image: 'изображение', time: 'Время', distance: 'Путь', velocity: 'Скорость', displacement: 'Перемещение', volumeAdded: 'Добавленный объём', remaining: 'Осталось', halfLife: 'период полураспада', eqPoint: 'точка эквивалентности', reading: 'Показание' },
  ja: { object: '物体', image: '像', time: '時間', distance: '距離', velocity: '速度', displacement: '変位', volumeAdded: '加えた体積', remaining: '残っている量', halfLife: '半減期', eqPoint: '中和点', reading: '読み' },
  'zh-Hant': { object: '物體', image: '像', time: '時間', distance: '距離', velocity: '速度', displacement: '位移', volumeAdded: '加入的體積', remaining: '剩餘的量', halfLife: '半衰期', eqPoint: '當量點', reading: '讀數' },
  ar: { object: 'الجسم', image: 'الصورة', time: 'الزمن', distance: 'المسافة', velocity: 'السرعة', displacement: 'الإزاحة', volumeAdded: 'الحجم المضاف', remaining: 'الكمية المتبقية', halfLife: 'عمر النصف', eqPoint: 'نقطة التكافؤ', reading: 'القراءة' },
  he: { object: 'עצם', image: 'דמות', time: 'זמן', distance: 'מרחק', velocity: 'מהירות', displacement: 'העתק', volumeAdded: 'נפח שהוסף', remaining: 'כמות שנשארה', halfLife: 'זמן מחצית חיים', eqPoint: 'נקודת שקילות', reading: 'קריאה' },
};
/** The words for a site language: the language, its base ('en-GB' -> 'en'), then English, word by word. */
export function figWords(lang) {
  const l = String(lang || 'en'), base = FIG_WORDS[l] || FIG_WORDS[l.split('-')[0]] || {};
  return k => (base[k] != null ? base[k] : FIG_WORDS.en[k] != null ? FIG_WORDS.en[k] : k);
}
