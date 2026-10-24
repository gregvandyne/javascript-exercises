// Profile page: share a link to the profile.
import { copyText, toast, $, t } from '/js/app.js';
const b = $('#shareprofile');
if (b) b.addEventListener('click', async () => {
  const url = location.origin + b.dataset.url;
  if (await copyText(url)) toast(t('js.profile.linkCopied')); else toast(url);
});
