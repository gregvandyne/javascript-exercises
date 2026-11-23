// A teacher's picture for the book maker (public/js/storybook-setup.js and storybook-edit.js): made a JPEG of at most
// maxSide pixels here (a white background behind any transparency), then sent as it is; the server cleans it (no
// metadata) and checks it (no people) before keeping it (services/storybook.js addPic).
function toJpeg(file, maxSide, failText) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => (b ? resolve(b) : reject(new Error(failText))), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(failText)); };
    img.src = url;
  });
}
/** -> the server's { id, name, width, height } (throws Error with the server's words). */
export async function uploadPic(file, url, { maxSide = 1600, failText = 'That picture did not work.' } = {}) {
  const blob = await toJpeg(file, maxSide, failText);
  const r = await fetch(`${url}?name=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', body: blob, headers: { 'Content-Type': 'image/jpeg', Accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || failText);
  return j.pic;
}
