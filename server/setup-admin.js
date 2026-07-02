const readline = require('readline');
const bcrypt = require('bcryptjs');
const otplib = require('otplib');
const db = require('./db');
const { encrypt } = require('./auth');
const qrcode = require('qrcode');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('===========================================================');
  console.log('       Aptora Premium Administrative Account Setup         ');
  console.log('===========================================================');
  console.log('This wizard will initialize the database and configure');
  console.log('your custom Administrator account with forced 2FA.');
  console.log('===========================================================');
  console.log('');

  let username = '';
  while (!username.trim()) {
    username = await question('Enter Admin Username: ');
    if (!username.trim()) console.log('Username cannot be empty.\n');
  }

  let email = '';
  while (!email.trim() || !email.includes('@')) {
    email = await question('Enter Admin Email Address: ');
    if (!email.trim() || !email.includes('@')) {
      console.log('Please enter a valid email address.\n');
    }
  }

  let password = '';
  while (password.length < 6) {
    password = await question('Enter Admin Password (min 6 chars): ');
    if (password.length < 6) {
      console.log('Password must be at least 6 characters long.\n');
    }
  }

  console.log('\nInitializing SQLite Database...');
  try {
    // Initialize schema
    await db.initDb();

    // Clear any existing users to ensure clean setup
    await db.run('DELETE FROM users');
    console.log('Cleared default/legacy user accounts.');

    // Generate 2FA Secret
    const twofaSecret = otplib.authenticator.generateSecret();
    const encryptedSecret = encrypt(twofaSecret);
    const passwordHash = bcrypt.hashSync(password, 10);

    // Insert new Admin with forced 2FA enabled
    const result = await db.run(
      'INSERT INTO users (username, email, password_hash, role, twofa_secret, twofa_enabled) VALUES (?, ?, ?, ?, ?, ?)',
      [username.trim(), email.trim(), passwordHash, 'admin', encryptedSecret, 1]
    );

    console.log('\n===========================================================');
    console.log('   🎉 SUCCESS: Administrative Account Setup Complete!');
    console.log('===========================================================');
    console.log(` ID:               #${result.id}`);
    console.log(` Username:         ${username.trim()}`);
    console.log(` Email:            ${email.trim()}`);
    console.log(` Access Role:      ADMINISTRATOR`);
    console.log(` 2FA Status:       FORCED (ENABLED)`);
    console.log('-----------------------------------------------------------');
    console.log(' ⚠️  CRITICAL: TWO-FACTOR AUTHENTICATION DETAILS');
    console.log('-----------------------------------------------------------');
    console.log(` Secret Key:       ${twofaSecret}`);
    console.log(' Add this secret to your Authenticator App (Google Authenticator,');
    console.log(' Microsoft Authenticator, KAYTUS/TOTP) to receive 2FA login codes.');
    
    try {
      const otpauthUrl = otplib.authenticator.keyuri(email.trim(), 'Aptora Security', twofaSecret);
      const qrCodeTerminal = await qrcode.toString(otpauthUrl, { type: 'terminal', small: true });
      console.log('\n Scan this QR Code with your Google Authenticator / Authy app:\n');
      console.log(qrCodeTerminal);
    } catch (qrErr) {
      console.log('\n (Could not render QR code in terminal, please enter the Secret Key manually)');
    }
    console.log('===========================================================');
  } catch (error) {
    console.error('\nDatabase initialization failed:', error.message);
  } finally {
    rl.close();
    process.exit(0);
  }
}

main();
