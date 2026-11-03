// One-off (CS Quest, owner B): the /live chrome strings for the CS Quest program, live.cs.*, merged into every locale
// file as the last block of `live` (keys are added or replaced; nothing else changes). Safe to re-run. Precedent:
// scripts/i18n-add-live-wyr-atlas.mjs. en-GB.json is left alone: none of these strings spells differently in the UK.
//   node scripts/i18n-add-cs-quest-live.mjs && npm run i18n:check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server/i18n/locales');
export const W = {
  en: { sets: 'CS Quest', preset: 'Set up from the lesson plan. You can still change anything.' },
  es: { sets: 'CS Quest', preset: 'Preparado desde el plan de la lección. Puedes cambiar lo que quieras.' },
  fr: { sets: 'CS Quest', preset: 'Préparé d’après le plan de la leçon. Tu peux encore tout modifier.' },
  de: { sets: 'CS Quest', preset: 'Nach dem Stundenplan voreingestellt. Du kannst alles noch ändern.' },
  it: { sets: 'CS Quest', preset: 'Impostato dal piano della lezione. Puoi ancora cambiare tutto.' },
  pt: { sets: 'CS Quest', preset: 'Preparado a partir do plano da aula. Você ainda pode mudar tudo.' },
  nl: { sets: 'CS Quest', preset: 'Ingesteld volgens het lesplan. Je kunt alles nog aanpassen.' },
  ru: { sets: 'CS Quest', preset: 'Настроено по плану урока. Всё ещё можно изменить.' },
  ja: { sets: 'CS Quest', preset: '授業プランに合わせて設定しました。あとから変えられます。' },
  'zh-Hant': { sets: 'CS Quest', preset: '已依照課程計畫設定好。你仍然可以更改任何選項。' },
  ar: { sets: 'CS Quest', preset: 'تم الإعداد حسب خطة الدرس. ما زال بإمكانك تغيير أي شيء.' },
  he: { sets: 'CS Quest', preset: 'הוגדר לפי מערך השיעור. עדיין אפשר לשנות הכול.' },
};

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'en-GB.json');
for (const f of files) {
  const code = f.replace(/\.json$/, '');
  const w = W[code];
  if (!w) throw new Error(`no words for ${code}`);
  const p = path.join(DIR, f);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!j.live) throw new Error(`${f} has no live block`);
  // cs goes last inside live (each owner appends its own block at the end of its namespace)
  const { cs: old, ...rest } = j.live;
  j.live = { ...rest, cs: { ...(old || {}), ...w } };
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('✓', f);
}
