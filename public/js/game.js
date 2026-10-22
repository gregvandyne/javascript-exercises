import { api, toast, sheet, pageData, copyText, esc, $ } from '/js/app.js';
const d = pageData();
const needSignIn = () => { toast('Tap “Play as guest” or sign in first.'); };

const rate = $('#rate');
if (rate) rate.addEventListener('click', async e => {
  const b = e.target.closest('[data-stars]'); if (!b) return;
  const n = +b.dataset.stars;
  try {
    const r = await api(`/api/games/${d.gameId}/rate`, { method: 'POST', body: { stars: n } });
    [...rate.children].forEach((x, i) => { x.classList.toggle('on', i < n); x.setAttribute('aria-checked', String(i + 1 === n)); });
    $('#ratemsg').textContent = `You gave it ${n} star${n > 1 ? 's' : ''}. Average is now ${r.average.toFixed(1)}.`;
    toast('Thanks for rating!');
  } catch (err) { toast(err.message, { bad: true }); }
});

const like = $('#likebtn');
if (like) like.addEventListener('click', async () => {
  if (!d.signedIn) return needSignIn();
  try {
    const r = await api(`/api/games/${d.gameId}/like`, { method: 'POST', body: {} });
    like.setAttribute('aria-pressed', String(r.liked)); like.querySelector('.emo').textContent = r.liked ? '❤️' : '🤍';
    $('#likecount').textContent = r.likes; toast(r.liked ? 'Liked!' : 'Like removed');
  } catch (err) { toast(err.message, { bad: true }); }
});

const share = $('#sharebtn');
if (share) share.addEventListener('click', () => {
  const url = `${location.origin}/g/${d.slug}`;
  const icon = { private: '🔒', friends: '👫', public: '🌍' }[d.visibility] || '🔗';
  const s = sheet({ title: 'Share this game', content: `<p class="notice">${icon} ${esc(d.shareText)}</p><div class="field"><label for="shareurl">Link</label><input class="input" id="shareurl" readonly value="${esc(url)}"></div><button class="btn btn-primary btn-block" type="button" id="copylink">Copy link</button>` });
  s.el.querySelector('#copylink').addEventListener('click', async () => { if (await copyText(url)) { toast('Link copied!'); s.close(); } else { s.el.querySelector('#shareurl').select(); toast('Press and hold to copy.'); } });
});

const report = $('#reportbtn');
if (report) report.addEventListener('click', () => {
  if (!d.signedIn) return needSignIn();
  const s = sheet({ title: 'Report this game', content: `<p>What is wrong? A grown-up on our team will look.</p><div class="stack">${d.reasons.map(([k, l]) => `<button class="btn btn-block" type="button" data-reason="${esc(k)}">${esc(l)}</button>`).join('')}</div>` });
  s.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-reason]'); if (!b) return;
    try { const r = await api(`/api/games/${d.gameId}/report`, { method: 'POST', body: { reason: b.dataset.reason } }); s.close(); toast(r.message); }
    catch (err) { toast(err.message, { bad: true }); }
  });
});
