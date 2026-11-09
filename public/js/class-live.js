// A student's class page: shows "Your teacher started a live game · Join now" when the class's live room opens (and
// hides it when it ends), checking every 8 seconds while the page is in view (server/routes/schools.js classLiveBanner).
const box = document.getElementById('class-live');
if (box && box.dataset.class) {
  const game = document.getElementById('class-live-game'), join = document.getElementById('class-live-join');
  const check = async () => {
    if (document.hidden) return;
    try {
      const r = await fetch(`/api/classes/${encodeURIComponent(box.dataset.class)}/live`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!r.ok) return;
      const { live } = await r.json();
      box.hidden = !live;
      if (live) { game.textContent = live.title || ''; join.href = `/join#${live.code}`; }
    } catch { /* offline: try again next time */ }
  };
  setInterval(check, 8000);
  document.addEventListener('visibilitychange', check);
}
