const db = require('./db');

const testDbQueries = async () => {
  console.log('--- STARTING DATABASE SCHEMAS & ALGORITHM TESTS ---');
  
  try {
    // 1. Initialize DB
    console.log('Step 1: Initializing DB tables...');
    await db.initDb();
    
    // 2. Fetch User Table
    console.log('Step 2: Checking users database...');
    const users = await db.query('SELECT username, role, twofa_enabled FROM users');
    console.log('Loaded users from DB:', users);
    if (users.length < 2) {
      throw new Error('Verification failed: User seeding count mismatch.');
    }
    
    // 3. Fetch Questions
    console.log('Step 3: Checking questions pool...');
    const questions = await db.query('SELECT COUNT(*) as count FROM questions');
    console.log(`Live questions pool count: ${questions[0].count}`);
    if (questions[0].count < 20) {
      throw new Error('Verification failed: Questions seeding count mismatch.');
    }

    // 4. Test randomized query selection algorithm
    console.log('Step 4: Running randomized bell curve test-generator logic simulation...');
    const num_questions = 10;
    const selected_domains = [
      'Network Fundamentals',
      'Network Security & Edge Security',
      'Identity & Access Security',
      'Security Operations & Monitoring'
    ];
    
    // Default Bell Curve distribution percentages: 10% lvl 1, 20% lvl 2, 40% lvl 3, 20% lvl 4, 10% lvl 5
    const targetDist = { "1": 10, "2": 20, "3": 40, "4": 20, "5": 10 };
    
    // Core selection logic mimicking routes.js
    const chosenQuestionsMap = new Map();
    let allocatedCount = 0;
    const diffTargets = {};
    const diffKeys = ["1", "2", "3", "4", "5"];

    diffKeys.forEach((key) => {
      const pct = targetDist[key] !== undefined ? targetDist[key] : 0;
      const targetForLevel = Math.round(num_questions * (pct / 100));
      diffTargets[key] = targetForLevel;
      allocatedCount += targetForLevel;
    });

    let difference = num_questions - allocatedCount;
    if (difference !== 0) {
      diffTargets["3"] += difference;
      if (diffTargets["3"] < 0) diffTargets["3"] = 0;
    }

    console.log('Configured targets per difficulty level:', diffTargets);

    for (const diff of diffKeys) {
      const countNeeded = diffTargets[diff];
      if (countNeeded <= 0) continue;

      const placeholders = selected_domains.map(() => '?').join(',');
      const queryStr = `
        SELECT id, domain, difficulty, points FROM questions 
        WHERE difficulty = ? AND domain IN (${placeholders}) 
        ORDER BY RANDOM() LIMIT ?
      `;

      const params = [parseInt(diff), ...selected_domains, countNeeded];
      const selected = await db.query(queryStr, params);
      console.log(`Difficulty Lv.${diff} requested: ${countNeeded}, fetched: ${selected.length}`);
      
      selected.forEach(q => chosenQuestionsMap.set(q.id, q));
    }

    // Backfill validation
    if (chosenQuestionsMap.size < num_questions) {
      const neededBackfill = num_questions - chosenQuestionsMap.size;
      console.log(`Need backfill: ${neededBackfill}`);
      const placeholders = selected_domains.map(() => '?').join(',');
      const queryStr = `
        SELECT id, domain, difficulty, points FROM questions 
        WHERE domain IN (${placeholders}) 
        ORDER BY RANDOM()
      `;
      const allPossible = await db.query(queryStr, selected_domains);
      for (const q of allPossible) {
        if (chosenQuestionsMap.size >= num_questions) break;
        chosenQuestionsMap.set(q.id, q);
      }
    }

    console.log(`Total questions selected: ${chosenQuestionsMap.size}`);
    if (chosenQuestionsMap.size !== num_questions) {
      throw new Error(`Verification failed: Expected ${num_questions} questions, got ${chosenQuestionsMap.size}`);
    }

    console.log('Selected questions list:');
    Array.from(chosenQuestionsMap.values()).forEach((q, idx) => {
      console.log(`  [${idx+1}] ID: #${q.id} | Domain: ${q.domain} | Diff: Lv.${q.difficulty} | Pts: ${q.points}p`);
    });

    console.log('--- ALL BACKEND DATABASE QUERY AND DISTRIBUTION TESTS PASSED ---');
    process.exit(0);
  } catch (error) {
    console.error('--- DB VERIFICATION ERROR ---', error);
    process.exit(1);
  }
};

testDbQueries();
