const readline = require('readline');
const bcrypt = require('bcryptjs');
const otplib = require('otplib');
const db = require('./db');
const { encrypt, decrypt } = require('./auth');
const qrcode = require('qrcode');
const Writable = require('stream').Writable;

const mutableStdout = new Writable({
  write: function(chunk, encoding, callback) {
    if (!this.muted) {
      process.stdout.write(chunk, encoding);
    }
    callback();
  }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: mutableStdout,
  terminal: true
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Completely silent password reader helper using mutable stdout
const readPassword = (prompt) => {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    mutableStdout.muted = true;
    rl.question('', (pwd) => {
      mutableStdout.muted = false;
      process.stdout.write('\n');
      resolve(pwd);
    });
  });
};

async function main() {
  console.log('===========================================================');
  console.log('        Aptora Administrator Reset & Recovery Tool         ');
  console.log('===========================================================');
  console.log('');

  try {
    await db.initDb();
    
    // Find the admin user
    const adminUser = await db.get("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    if (!adminUser) {
      console.log('ERROR: No Administrator account exists in the database.');
      console.log('Please initialize the administrator account using setup first.');
      rl.close();
      return;
    }

    console.log(`Target Account:    ${adminUser.username} (${adminUser.email})`);
    console.log(`2FA Status:        ${adminUser.twofa_enabled ? 'ENABLED' : 'DISABLED'}`);
    console.log('');
    console.log('Verification Options:');
    console.log(' 1. Verify using current Admin Password');
    console.log(' 2. Verify using current 2FA TOTP Code');
    console.log(' 3. Emergency Reset (Bypass verification - local only)');
    console.log('');

    const verifyOption = await question('Select verification method (1-3): ');

    let verified = false;

    if (verifyOption === '1') {
      const pwd = await readPassword('Enter current Admin Password: ');
      if (bcrypt.compareSync(pwd, adminUser.password_hash)) {
        verified = true;
        console.log('Password verified successfully!\n');
      } else {
        console.log('ERROR: Incorrect password.');
      }
    } else if (verifyOption === '2') {
      if (!adminUser.twofa_enabled || !adminUser.twofa_secret) {
        console.log('ERROR: Two-Factor Authentication is not enabled on this account.');
      } else {
        const token = await question('Enter current 2FA TOTP verification code: ');
        const secret = decrypt(adminUser.twofa_secret);
        if (otplib.authenticator.verify({ token, secret })) {
          verified = true;
          console.log('2FA Code verified successfully!\n');
        } else {
          console.log('ERROR: Invalid 2FA TOTP code.');
        }
      }
    } else if (verifyOption === '3') {
      console.log('⚠️  WARNING: Bypassing verification should only be done for local emergency recoveries.');
      const confirm = await question('Are you sure you want to proceed? (y/n): ');
      if (confirm.toLowerCase() === 'y') {
        verified = true;
        console.log('Verification bypassed.\n');
      }
    } else {
      console.log('Invalid option selected.');
    }

    if (verified) {
      console.log('Choose reset action:');
      console.log(' 1. Reset Admin Password');
      console.log(' 2. Reset/Re-initialize 2FA (Generates new Secret Key & QR Code)');
      console.log(' 3. Disable 2FA completely');
      console.log('');
      
      const resetOption = await question('Select reset action (1-3): ');

      if (resetOption === '1') {
        let newPwd = '';
        while (newPwd.length < 6) {
          newPwd = await readPassword('Enter New Password (min 6 chars): ');
          if (newPwd.length < 6) {
            console.log('Password must be at least 6 characters long.\n');
            continue;
          }
          const confirmNewPwd = await readPassword('Confirm New Password: ');
          if (newPwd !== confirmNewPwd) {
            console.log('Passwords do not match. Please try again.\n');
            newPwd = '';
          }
        }
        
        const newHash = bcrypt.hashSync(newPwd, 10);
        await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, adminUser.id]);
        console.log('🎉 SUCCESS: Admin password has been updated successfully!');
      } 
      else if (resetOption === '2') {
        const twofaSecret = otplib.authenticator.generateSecret();
        const encryptedSecret = encrypt(twofaSecret);
        await db.run('UPDATE users SET twofa_secret = ?, twofa_enabled = 1 WHERE id = ?', [encryptedSecret, adminUser.id]);
        
        console.log('🎉 SUCCESS: 2FA has been re-initialized!');
        console.log('-----------------------------------------------------------');
        console.log(` New Secret Key:   ${twofaSecret}`);
        console.log(' Add this secret to your Authenticator App.');
        
        try {
          const otpauthUrl = otplib.authenticator.keyuri(adminUser.email, 'Aptora Security', twofaSecret);
          const qrCodeTerminal = await qrcode.toString(otpauthUrl, { type: 'terminal', small: true });
          console.log('\n Scan this QR Code with your Google Authenticator / Authy app:\n');
          console.log(qrCodeTerminal);
        } catch (qrErr) {
          console.log('\n (Could not render QR code in terminal, please enter the Secret Key manually)');
        }
      } 
      else if (resetOption === '3') {
        await db.run('UPDATE users SET twofa_enabled = 0 WHERE id = ?', [adminUser.id]);
        console.log('🎉 SUCCESS: Two-Factor Authentication has been disabled for this account.');
      } 
      else {
        console.log('Invalid reset action selected.');
      }
    }
  } catch (err) {
    console.error('An error occurred during reset:', err.message);
  } finally {
    rl.close();
    process.exit(0);
  }
}

main();
