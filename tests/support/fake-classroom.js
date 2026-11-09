// A small stand-in for the Google Classroom API for tests (like tests/support/fake-stripe.js). It never talks to Google
// and imports nothing from server/. Point CLASSROOM_API_BASE at it; the OAuth side (tokens, refresh, revoke) is
// tests/support/fake-google.js. Any "Bearer fake-at-…" token is accepted and acts as the one teacher, `teacherId`.
// The values here are fake test data, not secrets. Run alone: node tests/support/fake-classroom.js --port 5940
import http from 'node:http';
import crypto from 'node:crypto';

export async function startFakeClassroom({ port = 0, host = '127.0.0.1' } = {}) {
  const courses = new Map();   // id -> { id, name, section, courseState, teachers: Set, students: [{ userId, profile }] }
  const courseWork = new Map(); // id -> { courseId, body, submissions: [{ id, userId, draftGrade, assignedGrade, state }] }
  const calls = [];             // { method, path, query, body }
  let failures = [];            // queued { status, body, match }
  let url = '';
  const id = () => String(BigInt('0x' + crypto.randomBytes(6).toString('hex')));

  const send = (res, status, j) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
  const gErr = (res, status, s, message = s) => send(res, status, { error: { code: status, message, status: s } });
  const readJson = req => new Promise(r => { let d = ''; req.on('data', c => { d += c; }); req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch { r(null); } }); });
  const page = (list, u, key) => {
    const size = Math.max(1, Math.min(+u.searchParams.get('pageSize') || 30, 1000));
    const from = +(u.searchParams.get('pageToken') || 0);
    const out = { [key]: list.slice(from, from + size) };
    if (from + size < list.length) out.nextPageToken = String(from + size);
    return out;
  };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, url);
    const body = ['POST', 'PATCH'].includes(req.method) ? await readJson(req) : {};
    calls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), body });
    const auth = String(req.headers.authorization || '');
    if (!/^Bearer fake-at-[0-9a-f]+$/.test(auth)) return gErr(res, 401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.');
    const f = failures.find(x => !x.match || x.match.test(`${req.method} ${u.pathname}`));
    if (f) { failures = failures.filter(x => x !== f); return send(res, f.status, f.body || { error: { code: f.status, status: f.statusText || 'FAILED', message: 'fake failure' } }); }
    if (body === null) return gErr(res, 400, 'INVALID_ARGUMENT', 'bad json');
    let m;
    if (req.method === 'GET' && u.pathname === '/v1/courses') {
      if (u.searchParams.get('teacherId') !== 'me') return gErr(res, 400, 'INVALID_ARGUMENT');
      const states = (u.searchParams.get('courseStates') || '').split(',').filter(Boolean);
      const list = [...courses.values()].filter(c => c.teachers.has('me') && (!states.length || states.includes(c.courseState)))
        .map(c => ({ id: c.id, name: c.name, section: c.section, courseState: c.courseState, alternateLink: `https://classroom.google.com/c/${c.id}` }));
      return send(res, 200, page(list, u, 'courses'));
    }
    if (req.method === 'GET' && (m = u.pathname.match(/^\/v1\/courses\/([^/]+)\/students$/))) {
      const c = courses.get(decodeURIComponent(m[1])); if (!c) return gErr(res, 404, 'NOT_FOUND');
      if (!c.teachers.has('me')) return gErr(res, 403, 'PERMISSION_DENIED');
      return send(res, 200, page(c.students.map(s => ({ courseId: c.id, userId: s.userId, profile: { id: s.userId, name: { fullName: s.fullName } } })), u, 'students'));
    }
    if (req.method === 'POST' && (m = u.pathname.match(/^\/v1\/courses\/([^/]+)\/courseWork$/))) {
      const c = courses.get(decodeURIComponent(m[1])); if (!c) return gErr(res, 404, 'NOT_FOUND');
      if (!c.teachers.has('me')) return gErr(res, 403, 'PERMISSION_DENIED');
      if (!body.title || body.workType !== 'ASSIGNMENT') return gErr(res, 400, 'INVALID_ARGUMENT');
      if (!!body.dueDate !== !!body.dueTime) return gErr(res, 400, 'INVALID_ARGUMENT', 'dueDate and dueTime go together');
      if (!['PUBLISHED', 'DRAFT'].includes(body.state)) return gErr(res, 400, 'INVALID_ARGUMENT', 'state');
      if (body.scheduledTime && (body.state !== 'DRAFT' || !(Date.parse(body.scheduledTime) > Date.now()))) return gErr(res, 400, 'INVALID_ARGUMENT', 'scheduledTime needs DRAFT and a time ahead');
      const cwId = id();
      courseWork.set(cwId, { courseId: c.id, body, submissions: c.students.map(s => ({ id: 'Cg' + id(), userId: s.userId, state: 'CREATED' })) });
      return send(res, 200, { id: cwId, courseId: c.id, ...body, alternateLink: `https://classroom.google.com/c/${c.id}/a/${cwId}/details`, creationTime: new Date().toISOString() });
    }
    if (req.method === 'GET' && (m = u.pathname.match(/^\/v1\/courses\/([^/]+)\/courseWork\/([^/]+)\/studentSubmissions$/))) {
      const cw = courseWork.get(decodeURIComponent(m[2])); if (!cw || cw.courseId !== decodeURIComponent(m[1])) return gErr(res, 404, 'NOT_FOUND');
      return send(res, 200, page(cw.submissions.map(s => ({ ...s, courseId: cw.courseId, courseWorkId: decodeURIComponent(m[2]) })), u, 'studentSubmissions'));
    }
    if (req.method === 'PATCH' && (m = u.pathname.match(/^\/v1\/courses\/([^/]+)\/courseWork\/([^/]+)\/studentSubmissions\/([^/]+)$/))) {
      const cw = courseWork.get(decodeURIComponent(m[2])); if (!cw) return gErr(res, 404, 'NOT_FOUND');
      const sub = cw.submissions.find(s => s.id === decodeURIComponent(m[3])); if (!sub) return gErr(res, 404, 'NOT_FOUND');
      const mask = (u.searchParams.get('updateMask') || '').split(',').filter(Boolean);
      if (!mask.length || mask.some(k => !['draftGrade', 'assignedGrade'].includes(k))) return gErr(res, 400, 'INVALID_ARGUMENT', 'updateMask');
      for (const k of mask) { if (typeof body[k] !== 'number' || body[k] < 0 || body[k] > cw.body.maxPoints) return gErr(res, 400, 'INVALID_ARGUMENT', k); sub[k] = body[k]; }
      return send(res, 200, sub);
    }
    gErr(res, 404, 'NOT_FOUND', 'fake: no such route');
  });
  await new Promise(r => server.listen(port, host, r));
  url = `http://${host}:${server.address().port}`;
  return {
    get url() { return url; }, courses, courseWork, calls,
    /** A course the teacher teaches (or not: teaches false). students: [{ userId, fullName }] */
    addCourse({ id: cid = id(), name = 'Class', section = '', state = 'ACTIVE', teaches = true, students = [] } = {}) {
      courses.set(cid, { id: cid, name, section, courseState: state, teachers: new Set(teaches ? ['me'] : []), students: [...students] });
      return cid;
    },
    addStudent(cid, s) { courses.get(cid).students.push(s); },
    /** The next matching call answers with this status (and body). */
    failNext(status, { match = null, body = null, statusText = '' } = {}) { failures.push({ status, match, body, statusText }); },
    reset() { courses.clear(); courseWork.clear(); calls.length = 0; failures = []; },
    close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const i = process.argv.indexOf('--port'); const port = i > 0 ? +process.argv[i + 1] : 5940;
  startFakeClassroom({ port }).then(f => {
    // A demo course with three students for trying the page by hand (fake names).
    f.addCourse({ id: '700000000001', name: 'Class 4B (Classroom)', section: 'Room 12', students: [
      { userId: '100000000000000000001', fullName: 'Ana Silva' }, { userId: '100000000000000000002', fullName: 'Bo Li' }, { userId: '100000000000000000003', fullName: 'Cara Diaz' }] });
    console.log(`fake Classroom on ${f.url}`);
  });
}
