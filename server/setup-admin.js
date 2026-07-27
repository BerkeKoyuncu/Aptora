const readline = require('readline');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const { Writable } = require('stream');
const db = require('./db');
const { encrypt, getPasswordPolicyError } = require('./auth');

const mutableStdout = new Writable({
  write(chunk, encoding, callback) {
    if (!this.muted) process.stdout.write(chunk, encoding);
    callback();
  }
});

const rl = readline.createInterface({ input: process.stdin, output: mutableStdout, terminal: true });
const question = query => new Promise(resolve => rl.question(query, resolve));

const readPassword = prompt => new Promise(resolve => {
  process.stdout.write(prompt);
  mutableStdout.muted = true;
  rl.question('', password => {
    mutableStdout.muted = false;
    process.stdout.write('\n');
    resolve(password);
  });
});

async function main() {
  console.log('===========================================================');
  console.log(' Aptora Administrative Account Setup');
  console.log('===========================================================');

  let username = '';
  while (username.trim().length < 3) {
    username = await question('Enter Admin Username: ');
    if (username.trim().length < 3) console.log('Username must contain at least 3 characters.\n');
  }

  let email = '';
  while (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    email = await question('Enter Admin Email Address: ');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) console.log('Enter a valid email address.\n');
  }

  let password = '';
  while (true) {
    password = await readPassword('Enter Admin Password (min 8, upper/lower/number/special): ');
    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
      console.log(`${passwordError}\n`);
      continue;
    }
    const confirmation = await readPassword('Confirm Admin Password: ');
    if (password === confirmation) break;
    console.log('Passwords do not match. Try again.\n');
  }

  const twofaSecret = authenticator.generateSecret();
  console.log('\n===========================================================');
  console.log(' TWO-FACTOR AUTHENTICATION ENROLLMENT');
  console.log('===========================================================');
  console.log(`Manual Secret Key: ${twofaSecret}`);
  console.log('Scan the QR code with your authenticator application.');
  try {
    const otpauthUrl = authenticator.keyuri(email.trim().toLowerCase(), 'Aptora Security', twofaSecret);
    console.log(await qrcode.toString(otpauthUrl, { type: 'terminal', small: true }));
  } catch {
    console.log('QR rendering failed. Use the manual secret key above.');
  }

  while (true) {
    const code = (await question('Enter the current 6-digit authenticator code: ')).trim();
    if (authenticator.verify({ token: code, secret: twofaSecret })) break;
    console.log('Invalid code. Check the device time and try again.\n');
  }

  try {
    await db.initDb();
    await db.run('DELETE FROM users');
    const result = await db.run(
      `INSERT INTO users
       (username, email, password_hash, role, twofa_secret, twofa_enabled, must_setup_2fa)
       VALUES (?, ?, ?, 'admin', ?, 1, 0)`,
      [username.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), encrypt(twofaSecret)]
    );
    console.log('\n===========================================================');
    console.log(' SUCCESS: Administrator and 2FA are configured');
    console.log('===========================================================');
    console.log(`ID:       #${result.id}`);
    console.log(`Username: ${username.trim()}`);
    console.log(`Email:    ${email.trim().toLowerCase()}`);
    rl.close();
    process.exit(0);
  } catch (error) {
    console.error(`\nAdministrative setup failed: ${error.message}`);
    rl.close();
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`Setup failed: ${error.message}`);
  rl.close();
  process.exit(1);
});
