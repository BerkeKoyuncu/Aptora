const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dataDir = process.env.APTORA_DATA_DIR ||
  (process.env.ProgramData ? path.join(process.env.ProgramData, 'Aptora') : __dirname);
const databasePath = path.join(dataDir, 'database.sqlite');

const database = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY, (openError) => {
  if (openError) process.exit(1);

  database.get("SELECT 1 AS found FROM users WHERE role = 'admin' LIMIT 1", (queryError, row) => {
    database.close(() => process.exit(!queryError && row?.found === 1 ? 0 : 1));
  });
});
