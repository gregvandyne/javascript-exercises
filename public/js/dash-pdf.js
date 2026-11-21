// Class Board parity: the PDF widget (docs/decisions.md "Class Board: PDF, link tile and stickers"). The teacher uploads
// a PDF (POST /api/dash/<class>/pdfs: the class's teacher only, PDF only, at most 10 MB) and pages through it on the
// board. Pages are drawn by pdf.js (public/vendor/pdfjs/<version>/, self-hosted, the legacy build for older iPads), one
// page at a time, fitted inside the widget; the same Previous / Next buttons work by mouse, touch and keyboard. The file
// comes from /dash/pdfs/<id>, which only its owner can fetch. The page shown is kept in this browser while the page is
// open, never stored: nothing is recorded but the uploaded file. No PDF scripts, forms or links are run.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fill = (s, vars = {}) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

export const PDFJS = '/vendor/pdfjs/4.10.38';
export const PDF_MAX_BYTES = 10 * 1024 * 1024;
/** A page fitted inside a box: the largest scale at which all of it shows (never above maxScale). */
export function fitScale(pageW, pageH, boxW, boxH, maxScale = 4) {
  if (!(pageW > 0 && pageH > 0 && boxW > 0 && boxH > 0)) return 1;
  return Math.min(maxScale, boxW / pageW, boxH / pageH);
}
/** The page after a step, kept between 1 and the last page. */
export const stepPage = (page, step, total) => Math.max(1, Math.min(Math.max(1, total), (page || 1) + step));

let lib = null;
const pdfjs = () => (lib ||= import(`${PDFJS}/pdf.min.mjs`).then(m => { m.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`; return m; }));
const docs = new Map();     // doc id -> Promise<PDFDocumentProxy> (while the page is open)
const pages = new Map();    // widget id -> the page it shows (this browser only)
function openDoc(id) {
  if (!docs.has(id)) {
    const p = pdfjs().then(m => m.getDocument({ url: `/dash/pdfs/${encodeURIComponent(id)}`, withCredentials: true, isEvalSupported: false, enableXfa: false,
      standardFontDataUrl: `${PDFJS}/standard_fonts/`, cMapUrl: `${PDFJS}/cmaps/`, cMapPacked: true }).promise);
    p.catch(() => docs.delete(id));
    docs.set(id, p);
  }
  return docs.get(id);
}

/** Upload a PDF for this class -> its id. Throws with words to show. */
export async function uploadPdf(classId, file, W) {
  if (!file || (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || ''))) throw new Error(W.bad);
  if (file.size > PDF_MAX_BYTES) throw new Error(W.tooBig);
  const res = await fetch(`/api/dash/${encodeURIComponent(classId)}/pdfs`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/pdf' }, body: file });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || W.bad);
  return data.id;
}
/** An Upload button and its hidden file field. onDone(id) once the PDF is stored. */
export function uploadButton(classId, W, label, onDone, onError) {
  const wrap = el('span', 'dw-pdfup');
  const b = el('button', 'btn btn-sm', `📄 ${label}`); b.type = 'button';
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'application/pdf,.pdf'; file.hidden = true;
  b.addEventListener('click', e => { e.stopPropagation(); file.click(); });
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; if (!f) return; file.value = '';
    b.disabled = true; b.textContent = W.uploading;
    try { onDone(await uploadPdf(classId, f, W)); }
    catch (err) { onError(err.message); }
    finally { b.disabled = false; b.textContent = `📄 ${label}`; }
  });
  wrap.append(b, file);
  return wrap;
}

export function pdf(body, s, ctx) {
  const W = ctx.type.words;
  body.classList.add('dw-pdf');
  if (!s.doc) {
    const box = el('div', 'dw5-emptybox');
    const ic = el('span', 'dw5-bigic', '📄'); ic.setAttribute('aria-hidden', 'true');
    box.append(ic, el('p', 'dw-empty', W.empty));
    if (ctx.teacher) {
      const msg = el('p', 'small dw-pdfmsg'); msg.setAttribute('role', 'status');
      box.append(uploadButton(ctx.classId, W, W.upload, id => { ctx.set('doc', id); ctx.say(W.replace); }, m => { msg.textContent = m; ctx.toast(m, { bad: true }); }), msg);
    }
    body.appendChild(box);
    return null;
  }
  const bar = el('div', 'dw-pdfbar');
  const prev = el('button', 'btn btn-sm dw-pdfprev', '←'); prev.type = 'button'; prev.setAttribute('aria-label', W.prev); prev.title = W.prev;
  const next = el('button', 'btn btn-sm dw-pdfnext', '→'); next.type = 'button'; next.setAttribute('aria-label', W.next); next.title = W.next;
  const where = el('span', 'dw-pdfpage', W.loading); where.setAttribute('aria-live', 'polite');
  bar.append(prev, where, next);
  const area = el('div', 'dw-pdfarea');
  area.tabIndex = 0;
  area.setAttribute('role', 'img');
  const canvas = document.createElement('canvas'); canvas.className = 'dw-pdfcanvas';
  area.appendChild(canvas);
  body.append(bar, area);
  prev.disabled = next.disabled = true;

  let doc = null, gone = false, task = null, drawn = '', total = 0;
  const pageNow = () => pages.get(ctx.id) || 1;
  const show = async () => {
    if (!doc || gone) return;
    const n = pageNow(), box = area.getBoundingClientRect();
    const key = `${n} ${Math.round(box.width)} ${Math.round(box.height)}`;
    if (key === drawn || box.width < 20 || box.height < 20) return;
    drawn = key;
    where.textContent = fill(W.page, { n, total });
    area.setAttribute('aria-label', `${s.title || W.pages} ${fill(W.page, { n, total })}`);
    prev.disabled = n <= 1; next.disabled = n >= total;
    try {
      const page = await doc.getPage(n);
      if (gone || drawn !== key) return;
      const base = page.getViewport({ scale: 1 });
      const scale = fitScale(base.width, base.height, box.width - 4, box.height - 4);
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale: scale * dpr });
      if (task) { try { task.cancel(); } catch { /* done */ } }
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width / dpr)}px`; canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, annotationMode: 0 });
      await task.promise;
      canvas.dataset.page = String(n);
    } catch (err) {
      if (err && err.name === 'RenderingCancelledException') return;
      if (!gone) { drawn = ''; where.textContent = W.bad; }
    }
  };
  const go = step => { const n = stepPage(pageNow(), step, total); if (n === pageNow()) return; pages.set(ctx.id, n); drawn = ''; show(); ctx.say(fill(W.page, { n, total })); };
  prev.addEventListener('click', e => { e.stopPropagation(); go(-1); });
  next.addEventListener('click', e => { e.stopPropagation(); go(1); });
  area.addEventListener('keydown', e => {
    const k = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[e.key];
    if (!k || ctx.editing) return;
    e.preventDefault(); go(document.documentElement.dir === 'rtl' && /Arrow(Left|Right)/.test(e.key) ? -k : k);
  });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { clearTimeout(ro.t); ro.t = setTimeout(show, 120); }) : null;
  openDoc(s.doc).then(d => {
    if (gone) return;
    doc = d; total = d.numPages;
    if (pageNow() > total) pages.set(ctx.id, total);
    ro?.observe(area);
    show();
  }).catch(err => {
    if (gone) return;
    const missing = err && (err.status === 404 || /Missing PDF|Unexpected server response \(404\)/.test(String(err.message)));
    area.textContent = '';
    const box = el('div', 'dw5-emptybox'); box.setAttribute('role', 'status');
    box.append(el('p', 'dw-empty', missing ? W.gone : W.bad));
    if (ctx.teacher) box.appendChild(uploadButton(ctx.classId, W, W.upload, id => ctx.set('doc', id), m => ctx.toast(m, { bad: true })));
    area.appendChild(box);
    where.textContent = '';
  });
  return { destroy() { gone = true; ro?.disconnect(); clearTimeout(ro?.t); try { task && task.cancel(); } catch { /* done */ } } };
}
