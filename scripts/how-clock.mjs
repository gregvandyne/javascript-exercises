// For scripts/how-shots.js only (node --import): moves this process's clock to HOW_CLOCK (an ISO time, always ahead of
// now, so session cookies the browser keeps stay valid) and lets it run on from there. The dashboard shots use it so the
// clock and the schedule show a school morning whenever the script is run. Never loaded by the app itself.
const at = Date.parse(process.env.HOW_CLOCK || '');
if (Number.isFinite(at)) {
  const RealDate = Date, realNow = RealDate.now.bind(RealDate), off = at - realNow();
  class ShiftedDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(realNow() + off); }
    static now() { return realNow() + off; }
  }
  globalThis.Date = ShiftedDate;
}
