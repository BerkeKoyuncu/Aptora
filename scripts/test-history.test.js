// Integration smoke test: always uses a new isolated database, never live candidate data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const workspace = path.resolve(__dirname, '..');
const qaRoot = path.join(workspace, '.build', 'test-history-qa');
fs.mkdirSync(qaRoot, { recursive: true });
process.env.APTORA_DATA_DIR = fs.mkdtempSync(path.join(qaRoot, 'database-'));
process.env.NODE_ENV = 'development';
const db = require('../server/db');
const express = require('../server/node_modules/express');
const jwt = require('../server/node_modules/jsonwebtoken');
const JSZip = require('../server/node_modules/jszip');
const bcrypt = require('../server/node_modules/bcryptjs');
const routes = require('../server/routes');

async function main() {
  await db.initDb();
  const admin = await db.run(`INSERT INTO users (username, email, password_hash, must_setup_2fa) VALUES (?, ?, ?, 0)`,
    ['QA Administrator', 'qa@example.invalid', await bcrypt.hash('qa-only-password', 4)]);
  const adminToken = jwt.sign({ id: admin.id, ver: 0 }, 'aptora_development_jwt_secret_key_2026', {
    issuer: 'aptora', audience: 'aptora-admin', algorithm: 'HS256', expiresIn: '5m'
  });
  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let checks = 0;
  const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
  async function request(url, { body, method = 'GET', cookie, auth = true, status = 200 } = {}) {
    const response = await fetch(`${base}${url}`, { method, headers: {
      ...(auth ? { Authorization: `Bearer ${adminToken}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {})
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const type = response.headers.get('content-type') || '';
    const result = type.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, status, `${method} ${url}: ${JSON.stringify(result).slice(0, 500)}`);
    checks++;
    return { result, response };
  }
  try {
    const all = await db.query('SELECT * FROM questions ORDER BY id');
    const domains = [...new Set(all.map(question => question.domain))];
    const config = { title: 'Security Assessment — İstanbul', num_questions: 10, domains,
      is_random: true, difficulty_distribution: { 1: 10, 2: 20, 3: 40, 4: 20, 5: 10 },
      selected_questions: [all[0].id], pinned_questions: [all[0].id], duration: 20, pass_threshold: 70, require_seb: false };
    const { result: created } = await request('/tests', { method: 'POST', body: config, status: 201 });
    const id = created.testId;
    const initialTestCount = (await db.get('SELECT COUNT(*) AS count FROM tests')).count;
    await request('/tests', { method: 'POST', body: { ...config, num_questions: 100 }, status: 400 });
    check((await db.get('SELECT COUNT(*) AS count FROM tests')).count, initialTestCount);
    const { result: original } = await request(`/tests/${id}`);
    check(original.questions.length, 10);
    check(original.pinned_questions, [all[0].id]);
    assert(original.questions.some(question => question.id === all[0].id)); checks++;
    check(original.creator_name, 'QA Administrator');
    await request(`/tests/${id}`, { auth: false, status: 401 });
    await request(`/tests/${id}/export/pdf`, { auth: false, status: 401 });
    await request('/tests/999999', { status: 404 });
    // Actual candidate login/start ensures the snapshots are written at the API boundary.
    const { result: invited } = await request('/sessions', { method: 'POST', body: {
      test_id: id, candidate_email: 'candidate@example.invalid', candidate_password: 'x'
    }, status: 201 });
    const { response: login } = await request('/auth/login', { method: 'POST', auth: false,
      body: { username: 'candidate@example.invalid', password: 'x' } });
    const candidateCookie = login.headers.getSetCookie().find(cookie => cookie.startsWith('aptora_candidate_session=')).split(';')[0];
    const { result: started } = await request('/candidate/start', { method: 'POST', auth: false, cookie: candidateCookie, body: { candidate_name: 'Ada' } });
    check(started.questions.length, 10);
    check(started.duration, 20);
    check(started.questions[0].options.some(option => 'isCorrect' in option), false);
    await request('/candidate/start', { method: 'POST', auth: false, cookie: candidateCookie, body: { candidate_name: 'Ada' }, status: 409 });
    const chosen = all.slice(-6).map(question => question.id);
    const update = { ...config, title: 'Revised Assessment — Çığ, ş, ö, ü', revision: original.revision,
      selected_questions: chosen, pinned_questions: [], is_random: false, num_questions: 6,
      duration: 45, pass_threshold: 90, require_seb: true };
    const { result: edited } = await request(`/tests/${id}`, { method: 'PUT', body: update });
    check(edited.questions.map(question => question.id), chosen);
    check(edited.revision, 2);
    check(edited.duration, 45);
    check(edited.updated_by_name, 'QA Administrator');
    await request(`/tests/${id}`, { method: 'PUT', body: update, status: 409 });
    await request(`/tests/${id}`, { method: 'PUT', body: { ...update, revision: 2, selected_questions: [999999] }, status: 400 });
    check((await request(`/tests/${id}`)).result.revision, 2);
    await request(`/tests/${id}/regenerate`, { method: 'POST', status: 400 });
    const { result: resume } = await request('/candidate/take', { auth: false, cookie: candidateCookie });
    check(resume.duration, 20);
    check(resume.questions.map(question => question.id), started.questions.map(question => question.id));
    const { result: activeInfo } = await request('/candidate/session', { auth: false, cookie: candidateCookie });
    check(activeInfo.test_title, original.title);
    check(activeInfo.num_questions, 10);
    check(activeInfo.require_seb, false);
    // Submit the old layout after an edit: old threshold and title survive.
    await request('/candidate/submit', { method: 'POST', auth: false, cookie: candidateCookie, body: { responses: {} } });
    const { result: result } = await request('/candidate/result', { auth: false, cookie: candidateCookie });
    check(result.test_title, original.title);
    check(result.pass_threshold, 70);
    check(result.feedback.length, 10);
    check(result.require_seb, false);
    check(await db.get('SELECT id FROM candidate_accounts WHERE session_id = ?', [invited.sessionId]), undefined);
    const history = (await request('/sessions')).result.find(session => session.candidate_email === 'candidate@example.invalid');
    check(history.test_title, original.title);
    check(history.pass_threshold, 70);
    // New candidates see the updated configuration; old completed results remain unchanged.
    await request('/sessions', { method: 'POST', body: { test_id: id, candidate_email: 'pending@example.invalid', candidate_password: 'x' }, status: 201 });
    const { response: pendingLogin } = await request('/auth/login', { method: 'POST', auth: false, body: { username: 'pending@example.invalid', password: 'x' } });
    const pendingCookie = pendingLogin.headers.getSetCookie().find(cookie => cookie.startsWith('aptora_candidate_session=')).split(';')[0];
    await request(`/tests/${id}/export/docx`, { auth: false, cookie: pendingCookie, status: 401 });
    const { result: pendingInfo } = await request('/candidate/session', { auth: false, cookie: pendingCookie });
    check(pendingInfo.test_title, edited.title);
    check(pendingInfo.duration, 45);
    check(pendingInfo.num_questions, 6);
    check(pendingInfo.require_seb, true);
    // Random redraw preserves pins and ordered selection without duplicates.
    const { result: random } = await request(`/tests/${id}`, { method: 'PUT', body: { ...config, revision: 2, redraw_questions: true } });
    check(random.questions.length, 10);
    assert(random.questions.some(question => question.id === all[0].id)); checks++;
    await request(`/tests/${id}/regenerate`, { method: 'POST' });
    const redrawn = (await request(`/tests/${id}`)).result;
    check(new Set(redrawn.questions.map(question => question.id)).size, 10);
    assert(redrawn.questions.some(question => question.id === all[0].id)); checks++;
    const saves = await Promise.all([1, 2].map(() => fetch(`${base}/tests/${id}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, revision: redrawn.revision,
        selected_questions: redrawn.questions.map(question => question.id), redraw_questions: false })
    })));
    check(saves.map(response => response.status).sort(), [200, 409]);
    const latest = (await request(`/tests/${id}`)).result;
    check(latest.revision, redrawn.revision + 1);
    // Idempotent migration must not replace historical snapshot values.
    await db.initDb();
    check((await request('/candidate/result', { auth: false, cookie: candidateCookie })).result.pass_threshold, 70);
    // Multi-page papers, Turkish characters, and deliberately long options.
    const inserted = await db.run(`INSERT INTO questions (domain, difficulty, points, question_text, options) VALUES (?, ?, ?, ?, ?)`,
      ['General', 3, 15, 'Türkçe karakter kontrolü: Çığ, şifre, öğrenci, güvenlik.\nWhich option best explains this long scenario? ' + 'Detailed assessment context. '.repeat(28),
        JSON.stringify([{ id: 'a', text: 'Correct response — İstanbul: ' + 'Long option content. '.repeat(25), isCorrect: true },
          { id: 'b', text: 'Alternative response ' + 'Additional explanation. '.repeat(20), isCorrect: false }])]);
    const { result: paper } = await request(`/tests/${id}`, { method: 'PUT', body: { ...config, revision: latest.revision, is_random: false,
      pinned_questions: [], selected_questions: [...all.map(question => question.id), inserted.id] } });
    await request(`/tests/${id}/export/exe`, { status: 400 });
    for (const format of ['docx', 'pdf']) {
      for (const answers of [false, true]) {
        const { result: buffer, response } = await request(`/tests/${id}/export/${format}?answers=${answers ? 1 : 0}`);
        check(response.headers.get('cache-control'), 'private, no-store');
        assert(response.headers.get('content-disposition').includes(`.${format}`)); checks++;
        check(buffer.subarray(0, format === 'pdf' ? 5 : 2).toString(), format === 'pdf' ? '%PDF-' : 'PK');
        fs.writeFileSync(path.join(qaRoot, `assessment${answers ? '-with-key' : ''}.${format}`), buffer);
        if (format === 'docx') {
          const zip = await JSZip.loadAsync(buffer);
          const xml = await zip.file('word/document.xml').async('string');
          check(xml.includes('Answer Key'), false);
          const redRuns = [...xml.matchAll(/<w:r>.*?<\/w:r>/gs)].filter(match => match[0].includes('w:color w:val="8B0000"'));
          const expectedCorrect = paper.questions.flatMap(question => question.options.filter(option => option.isCorrect));
          check(redRuns.length, answers ? expectedCorrect.length : 0);
          if (answers) {
            const plain = value => value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
            expectedCorrect.forEach((option, index) => check(plain(redRuns[index][0]).slice(3), option.text));
          }
          check(xml.includes('Türkçe karakter'), true);
          check(xml.includes('<w:br/>'), true);
          for (const hidden of ['Created by', 'Last edited', 'Test reference', 'Revision', 'total points', 'Pass threshold', 'Intermediate', '15 points', 'QA Administrator', 'qa@example.invalid']) {
            check(xml.includes(hidden), false);
          }
          check(xml.includes(paper.title), false);
          check(xml.includes('Instructions'), true);
          check(xml.includes('General'), true);
          check((xml.match(/Question \d+<\/w:t>/g) || []).length, paper.questions.length);
          assert(Object.keys(zip.files).some(file => file.startsWith('word/media/'))); checks++;
          check((await zip.file('word/styles.xml').async('string')).includes('Arial'), true);
        }
      }
    }
    const logs = await db.query("SELECT action FROM security_audit_logs WHERE action LIKE 'test.%'");
    for (const action of ['test.created', 'test.updated', 'test.questions_redrawn', 'test.exported']) {
      assert(logs.some(log => log.action === action)); checks++;
    }
    console.log(`PASS: ${checks} integration assertions. QA documents: ${qaRoot}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.db.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; db.db.close(() => {}); });
