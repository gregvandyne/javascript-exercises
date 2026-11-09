// A student's class page and Class tab: shows "Your teacher started a live game · Join now" when a class's live room
// opens (and hides it when it ends), checking every 8 seconds while the page is in view (server/routes/schools.js
// classLiveBanner). The Class tab has one banner per class.
const boxes = [...document.querySelectorAll('.class-live[data-class]')];
if (boxes.length) {
  const check = async () => {
    if (document.hidden) return;
    for (const box of boxes) {
      try {
        const r = await fetch(`/api/classes/${encodeURIComponent(box.dataset.class)}/live`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
        if (!r.ok) continue;
        const { live } = await r.json();
        box.hidden = !live;
        const game = box.querySelector('[data-live-game]'), join = box.querySelector('[data-live-join]');
        if (live) { if (game) game.textContent = live.title || ''; if (join) join.href = `/join#${live.code}`; }
      } catch { /* offline: try again next time */ }
    }
  };
  setInterval(check, 8000);
  document.addEventListener('visibilitychange', check);
}
