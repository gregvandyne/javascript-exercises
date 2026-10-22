// Roll ad impressions into the earnings ledger for one day (default: today, UTC). Idempotent.
//   node scripts/rollup.js [YYYY-MM-DD]
//   node scripts/rollup.js yesterday
import { today } from '../server/db.js';
import { rollupDay, isDay, addDays } from '../server/services/earnings.js';
import { audit } from '../server/db.js';

let day = process.argv[2] || today();
if (day === 'yesterday') day = addDays(today(), -1);
if (!isDay(day)) { console.error('Usage: node scripts/rollup.js [YYYY-MM-DD|yesterday]'); process.exit(1); }
const r = rollupDay(day);
audit(null, 'earnings.rollup', day, { ...r, via: 'script' });
console.log(`Rolled up ${r.day}: ${r.games} game(s), ${r.impressions} weighted impressions, builders' share ${(r.builderMillicents / 100000).toFixed(2)} USD`);
