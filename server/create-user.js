const db = require('./db');
const bcrypt = require('bcryptjs');
const { getPasswordPolicyError } = require('./auth');

const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('================================================================');
  console.log(' Aptora CLI User Management Helper                              ');
  console.log('================================================================');
  console.log('Usage:');
  console.log('  node server/create-user.js <username> <email> <password>');
  console.log('');
  console.log('Example:');
  console.log('  node server/create-user.js secadmin admin@company.com mySecurePass123');
  console.log('================================================================');
  process.exit(1);
}

const [username, email, password] = args;

const passwordError = getPasswordPolicyError(password);
if (passwordError) {
  console.error(`Error: ${passwordError}`);
  process.exit(1);
}

const createUser = async () => {
  try {
    // Make sure DB schema is set up
    await db.initDb();
    
    // Check if user already exists
    const existing = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      console.error(`Error: User with username "${username}" or email "${email}" already exists.`);
      process.exit(1);
    }
    
    // Hash password & insert
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, email, password_hash, role, must_setup_2fa) VALUES (?, ?, ?, ?, 1)',
      [username, email, passwordHash, 'admin']
    );
    
    console.log('');
    console.log('===========================================================');
    console.log(' SUCCESS: User Account Created Successfully!');
    console.log('===========================================================');
    console.log(` ID:       #${result.id}`);
    console.log(` Username: ${username}`);
    console.log(` Email:    ${email}`);
    console.log(' Role:     ADMIN');
    console.log('===========================================================');
    process.exit(0);
  } catch (error) {
    console.error('Database Error:', error.message);
    process.exit(1);
  }
};

createUser();
