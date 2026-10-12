const db = require('./db');

const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const integer = (value, min, max, label) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) fail(`${label} must be between ${min} and ${max}.`);
  return number;
};
const ids = (value, label) => {
  if (!Array.isArray(value) || value.length > 100) fail(`${label} must be a list of at most 100 questions.`);
  const result = value.map(item => integer(item, 1, Number.MAX_SAFE_INTEGER, 'Question ID'));
  if (new Set(result).size !== result.length) fail(`${label} contains duplicate questions.`);
  return result;
};

function normalizeConfig(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > 200) fail('Test title must contain between 1 and 200 characters.');
  if (typeof body.is_random !== 'boolean') fail('A valid question selection mode is required.');
  if (!Array.isArray(body.domains) || !body.domains.length || body.domains.length > 50 ||
      body.domains.some(domain => typeof domain !== 'string' || !domain.trim() || domain.length > 150)) {
    fail('Select at least one valid question domain.');
  }
  const distribution = Object.fromEntries([1, 2, 3, 4, 5].map(level => [String(level),
    integer(body.difficulty_distribution?.[level] ?? 0, 0, 100, 'Difficulty weight')]));
  if (body.is_random && Object.values(distribution).reduce((sum, value) => sum + value, 0) !== 100) {
    fail('Difficulty weights must sum to 100%.');
  }
  const selected = ids(body.selected_questions || [], 'Selected questions');
  const pinned = ids(body.pinned_questions || (body.is_random ? selected : []), 'Pinned questions');
  const count = body.is_random ? integer(body.num_questions, 1, 100, 'Question count') : selected.length;
  if (!count) fail('Select at least one question.');
  if (body.is_random && pinned.length > count) fail('Pinned questions cannot exceed the total question count.');
  return {
    title, domains: [...new Set(body.domains.map(domain => domain.trim()))],
    difficulty_distribution: distribution, is_random: body.is_random,
    num_questions: count, selected_questions: selected, pinned_questions: body.is_random ? pinned : [],
    duration: integer(body.duration ?? 20, 1, 240, 'Duration'),
    pass_threshold: integer(body.pass_threshold ?? 70, 0, 100, 'Pass threshold'),
    require_seb: !!body.require_seb
  };
}

async function selectQuestions(tx, config, redraw) {
  const all = await tx.query(`SELECT q.id, q.domain, q.difficulty,
    (SELECT COUNT(*) FROM test_selected_questions WHERE question_id = q.id) AS usage_count
    FROM questions q ORDER BY RANDOM()`);
  const byId = new Map(all.map(question => [question.id, question]));
  const selectedIds = config.is_random && redraw ? config.pinned_questions : config.selected_questions;
  for (const id of selectedIds) {
    const question = byId.get(id);
    if (!question) fail(`Question ${id} no longer exists. Refresh the question list.`);
    if (!config.domains.includes(question.domain)) fail(`Selected question ${id} is outside the selected domains.`);
  }
  if (!config.is_random || !redraw) {
    if (selectedIds.length !== config.num_questions) fail('Selected question count must match the total. Change the selection or enable a fresh random draw.');
    if (config.pinned_questions.some(id => !selectedIds.includes(id))) fail('Pinned questions must be included in the selected questions.');
    return selectedIds;
  }
  const pool = all.filter(question => config.domains.includes(question.domain));
  if (pool.length < config.num_questions) fail(`Only ${pool.length} questions are available in the selected domains. Reduce the question count or add domains.`);
  const selected = selectedIds.map(id => byId.get(id));
  const available = pool.filter(question => !selectedIds.includes(question.id));
  while (selected.length < config.num_questions) {
    const score = question => {
      const actualDomain = selected.filter(item => item.domain === question.domain).length;
      const actualDifficulty = selected.filter(item => item.difficulty === question.difficulty).length;
      const domainDeficit = config.num_questions / config.domains.length - actualDomain;
      const difficultyDeficit = config.num_questions * config.difficulty_distribution[question.difficulty] / 100 - actualDifficulty;
      return difficultyDeficit * 2 + domainDeficit;
    };
    available.sort((a, b) => score(b) - score(a) || a.usage_count - b.usage_count);
    selected.push(available.shift());
  }
  return selected.map(question => question.id);
}

async function replaceQuestionLinks(tx, testId, questionIds) {
  await tx.run('DELETE FROM test_selected_questions WHERE test_id = ?', [testId]);
  for (const [position, questionId] of questionIds.entries()) {
    await tx.run('INSERT INTO test_selected_questions (test_id, question_id, position) VALUES (?, ?, ?)', [testId, questionId, position]);
  }
}

async function getTestDetail(id, tx = db) {
  const test = await tx.get(`SELECT t.*, creator.username AS creator_name, creator.email AS creator_email,
    editor.username AS updated_by_name FROM tests t
    LEFT JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users editor ON editor.id = t.updated_by WHERE t.id = ?`, [id]);
  if (!test) fail('Test configuration not found.', 404);
  const questions = await tx.query(`SELECT q.*, tsq.position FROM test_selected_questions tsq
    JOIN questions q ON q.id = tsq.question_id WHERE tsq.test_id = ? ORDER BY tsq.position, q.id`, [id]);
  const sessions = await tx.query('SELECT status, COUNT(*) AS count FROM test_sessions WHERE test_id = ? GROUP BY status', [id]);
  return {
    ...test, domains: JSON.parse(test.domains), difficulty_distribution: JSON.parse(test.difficulty_distribution),
    pinned_questions: JSON.parse(test.pinned_questions || '[]'), is_random: !!test.is_random, require_seb: !!test.require_seb,
    questions: questions.map(question => ({ ...question, options: JSON.parse(question.options) })),
    total_points: questions.reduce((sum, question) => sum + Number(question.points), 0),
    session_counts: Object.fromEntries(sessions.map(item => [item.status, item.count]))
  };
}

module.exports = { normalizeConfig, selectQuestions, replaceQuestionLinks, getTestDetail, fail };
