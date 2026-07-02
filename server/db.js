const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// Wrap sqlite3 in Promises for async/await usage
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// Initialize schema and seed data
const initDb = async () => {
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Create Users table
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'standard')),
      twofa_secret TEXT,
      twofa_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create Questions table
  await run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 5),
      points INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      options TEXT NOT NULL, -- JSON string of option array
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Create Tests table
  await run(`
    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      num_questions INTEGER NOT NULL,
      difficulty_distribution TEXT NOT NULL, -- JSON object of weights
      domains TEXT NOT NULL, -- JSON array of selected domains
      is_random INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create TestSelectedQuestions table (for direct question selection)
  await run(`
    CREATE TABLE IF NOT EXISTS test_selected_questions (
      test_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      PRIMARY KEY (test_id, question_id),
      FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE,
      FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE
    )
  `);

  // Create TestSessions table
  await run(`
    CREATE TABLE IF NOT EXISTS test_sessions (
      id TEXT PRIMARY KEY, -- UUID / Token
      test_id INTEGER NOT NULL,
      candidate_email TEXT NOT NULL,
      candidate_name TEXT,
      candidate_info TEXT, -- JSON string for additional info
      started_at DATETIME,
      completed_at DATETIME,
      score REAL,
      total_points REAL,
      status TEXT CHECK(status IN ('pending', 'active', 'completed')) DEFAULT 'pending',
      responses TEXT, -- JSON object of responses
      questions_snapshot TEXT, -- JSON copy of questions at creation
      FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE
    )
  `);

  // Create QuestionAdvices table
  await run(`
    CREATE TABLE IF NOT EXISTS question_advices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      advised_by INTEGER NOT NULL,
      domain TEXT NOT NULL,
      difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 5),
      points INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      options TEXT NOT NULL, -- JSON string
      status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(advised_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create SimulatedEmails table
  await run(`
    CREATE TABLE IF NOT EXISTS simulated_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      link TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create EmailSettings table
  await run(`
    CREATE TABLE IF NOT EXISTS email_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      smtp_host TEXT,
      smtp_port INTEGER,
      smtp_user TEXT,
      smtp_pass TEXT,
      from_email TEXT,
      smtp_secure INTEGER DEFAULT 0,
      is_enabled INTEGER DEFAULT 0
    )
  `);

  // Seed default email settings if empty
  const settingsCount = await get(`SELECT COUNT(*) as count FROM email_settings`);
  if (settingsCount.count === 0) {
    await run(`
      INSERT INTO email_settings (smtp_host, smtp_port, smtp_user, smtp_pass, from_email, smtp_secure, is_enabled)
      VALUES ('smtp.gmail.com', 587, '', '', 'noreply@aptora.com', 0, 0)
    `);
  }

  // Default users auto-seeding removed as users are managed via CLI script

  // Seed default questions if empty
  const questionCount = await get(`SELECT COUNT(*) as count FROM questions`);
  if (questionCount.count === 0) {
    const defaultQuestions = [
      // 1. Network Fundamentals
      {
        domain: 'Network Fundamentals',
        difficulty: 1,
        points: 5,
        question_text: 'What does DHCP stand for and what is its primary function?',
        options: JSON.stringify([
          { id: '1', text: 'Dynamic Host Configuration Protocol; automatically assigns IP addresses', isCorrect: true },
          { id: '2', text: 'Data Handler Control Protocol; handles routing tables', isCorrect: false },
          { id: '3', text: 'Domain Host Connection Port; resolves DNS lookups', isCorrect: false },
          { id: '4', text: 'Dynamic Hypertext Control Path; encrypts local web traffic', isCorrect: false }
        ])
      },
      {
        domain: 'Network Fundamentals',
        difficulty: 3,
        points: 15,
        question_text: 'Which transport layer protocol guarantees packet delivery, order, and error checking, and what is its mechanism called?',
        options: JSON.stringify([
          { id: '1', text: 'UDP, using fire-and-forget datagram streaming', isCorrect: false },
          { id: '2', text: 'TCP, using a three-way handshake and sliding window flow control', isCorrect: true },
          { id: '3', text: 'ICMP, using echo request and response sequences', isCorrect: false },
          { id: '4', text: 'SCTP, using stream multi-homing transmission', isCorrect: false }
        ])
      },
      {
        domain: 'Network Fundamentals',
        difficulty: 5,
        points: 25,
        question_text: 'Explain BGP Hijacking. Which security framework specifically mitigates BGP hijacking by verifying AS route advertisements using cryptographic certificates?',
        options: JSON.stringify([
          { id: '1', text: 'IPsec VPN tunneling', isCorrect: false },
          { id: '2', text: 'DNSSEC (Domain Name System Security Extensions)', isCorrect: false },
          { id: '3', text: 'RPKI (Resource Public Key Infrastructure)', isCorrect: true },
          { id: '4', text: 'IEEE 802.1AE (MACsec)', isCorrect: false }
        ])
      },

      // 2. Network Security & Edge Security (SonicWall)
      {
        domain: 'Network Security & Edge Security',
        difficulty: 2,
        points: 10,
        question_text: 'In a SonicWall SonicOS security appliance, what is the default zone mapping for the WAN interface port (X1)?',
        options: JSON.stringify([
          { id: '1', text: 'LAN Zone', isCorrect: false },
          { id: '2', text: 'DMZ Zone', isCorrect: false },
          { id: '3', text: 'WLAN Zone', isCorrect: false },
          { id: '4', text: 'Untrusted (WAN) Zone', isCorrect: true }
        ])
      },
      {
        domain: 'Network Security & Edge Security',
        difficulty: 4,
        points: 20,
        question_text: 'How does SonicWall\'s Real-Time Deep Memory Inspection (RTDMI) technology identify zero-day threats inside its Capture ATP sandbox?',
        options: JSON.stringify([
          { id: '1', text: 'By examining malware signatures in static files on disk', isCorrect: false },
          { id: '2', text: 'By inspecting memory spaces in real-time during execution to catch malware before it can hide itself', isCorrect: true },
          { id: '3', text: 'By running basic network behavior logs through a firewall filter', isCorrect: false },
          { id: '4', text: 'By blocking all connections from unrecognized foreign IP addresses', isCorrect: false }
        ])
      },

      // 3. Identity & Access Security (BeyondTrust, Mirket, Netwrix)
      {
        domain: 'Identity & Access Security',
        difficulty: 2,
        points: 10,
        question_text: 'Mirket is often deployed to add MFA layers. Which protocol does Mirket use as a standard to intercept user authentication on VPN gateways or firewalls?',
        options: JSON.stringify([
          { id: '1', text: 'LDAP only', isCorrect: false },
          { id: '2', text: 'RADIUS (Remote Authentication Dial-In User Service)', isCorrect: true },
          { id: '3', text: 'FTP (File Transfer Protocol)', isCorrect: false },
          { id: '4', text: 'SNMP v3', isCorrect: false }
        ])
      },
      {
        domain: 'Identity & Access Security',
        difficulty: 3,
        points: 15,
        question_text: 'How does BeyondTrust Privileged Access Manager (PAM) control session monitoring?',
        options: JSON.stringify([
          { id: '1', text: 'It enforces administrative password rotations and records video/keystrokes of privileged sessions', isCorrect: true },
          { id: '2', text: 'It replaces Active Directory with a custom LDAP server', isCorrect: false },
          { id: '3', text: 'It acts as an external antivirus scanner on administrative desktops', isCorrect: false },
          { id: '4', text: 'It requires administrators to manually submit Excel spreadsheets of passwords', isCorrect: false }
        ])
      },
      {
        domain: 'Identity & Access Security',
        difficulty: 4,
        points: 20,
        question_text: 'What security audit task does Netwrix Auditor excel at, particularly in Active Directory environments?',
        options: JSON.stringify([
          { id: '1', text: 'Injecting anti-malware code into client endpoints', isCorrect: false },
          { id: '2', text: 'Tracking configuration changes, user logins, and group memberships, generating comparison reports before and after changes', isCorrect: true },
          { id: '3', text: 'Routing external DNS requests through a proxy', isCorrect: false },
          { id: '4', text: 'Managing hardware load balancers', isCorrect: false }
        ])
      },

      // 4. Security Operations & Monitoring (Exabeam, D3, Trellix, Sonlogger, Subgate, E-Logger)
      {
        domain: 'Security Operations & Monitoring',
        difficulty: 2,
        points: 10,
        question_text: 'Trellix ePolicy Orchestrator (ePO) is primarily used for which operational activity?',
        options: JSON.stringify([
          { id: '1', text: 'A firewall for cloud databases', isCorrect: false },
          { id: '2', text: 'Centralized security management of agents, endpoints, policies, and threat reporting', isCorrect: true },
          { id: '3', text: 'A software compilation engine', isCorrect: false },
          { id: '4', text: 'A digital forensic imaging tool', isCorrect: false }
        ])
      },
      {
        domain: 'Security Operations & Monitoring',
        difficulty: 3,
        points: 15,
        question_text: 'In the context of Security Operations, how does Exabeam use User and Entity Behavior Analytics (UEBA) to identify compromised credentials?',
        options: JSON.stringify([
          { id: '1', text: 'By checking hashes of all user passwords against public breaches', isCorrect: false },
          { id: '2', text: 'By building baseline behavior timelines for each user and triggering alerts on anomalies', isCorrect: true },
          { id: '3', text: 'By blocking all non-workday login attempts automatically', isCorrect: false },
          { id: '4', text: 'By recording screen logs of standard users during business hours', isCorrect: false }
        ])
      },
      {
        domain: 'Security Operations & Monitoring',
        difficulty: 4,
        points: 20,
        question_text: 'What is the primary architectural value of D3 SOAR (Security Orchestration, Automation, and Response) during incident handling?',
        options: JSON.stringify([
          { id: '1', text: 'It acts as an intrusion detection system on the local switch', isCorrect: false },
          { id: '2', text: 'It integrates multiple security tools and automates playbooks to respond to incidents instantly', isCorrect: true },
          { id: '3', text: 'It backups server snapshots to local tape drives', isCorrect: false },
          { id: '4', text: 'It blocks raw ports at the ISP level', isCorrect: false }
        ])
      },

      // 5. Vulnerability, Exposure & Security Testing (Tenable, Keysight)
      {
        domain: 'Vulnerability, Exposure & Security Testing',
        difficulty: 3,
        points: 15,
        question_text: 'In Tenable Nessus, what is the primary benefit of credentialed (authenticated) vulnerability scanning compared to non-credentialed (unauthenticated) scanning?',
        options: JSON.stringify([
          { id: '1', text: 'Credentialed scanning takes less network bandwidth', isCorrect: false },
          { id: '2', text: 'Credentialed scanning queries local system registries and patch levels directly, minimizing false positives', isCorrect: true },
          { id: '3', text: 'Credentialed scanning performs a denial of service test to verify system resistance', isCorrect: false },
          { id: '4', text: 'Credentialed scanning doesn\'t require any administrator access privileges', isCorrect: false }
        ])
      },
      {
        domain: 'Vulnerability, Exposure & Security Testing',
        difficulty: 4,
        points: 20,
        question_text: 'What is Keysight CyPerf\'s primary function in network security testing?',
        options: JSON.stringify([
          { id: '1', text: 'Scanning source code for vulnerable libraries', isCorrect: false },
          { id: '2', text: 'Simulating high-volume application traffic and cyber threats to test performance and security posture of hybrid networks', isCorrect: true },
          { id: '3', text: 'Encrypting data backup folders in virtual machines', isCorrect: false },
          { id: '4', text: 'Detecting physical copper wire leaks in cables', isCorrect: false }
        ])
      },

      // 6. Application & Software Security (Black Duck, TR7)
      {
        domain: 'Application & Software Security',
        difficulty: 3,
        points: 15,
        question_text: 'Black Duck SCA (Software Composition Analysis) is primarily integrated into software CI/CD pipelines to achieve which security goal?',
        options: JSON.stringify([
          { id: '1', text: 'To run unit tests on database endpoints', isCorrect: false },
          { id: '2', text: 'To detect open-source components, vulnerabilities in libraries, and license compliance issues', isCorrect: true },
          { id: '3', text: 'To obfuscate Javascript frontend bundles', isCorrect: false },
          { id: '4', text: 'To monitor runtime server CPU usage metrics', isCorrect: false }
        ])
      },
      {
        domain: 'Application & Software Security',
        difficulty: 4,
        points: 20,
        question_text: 'TR7 WAF (Web Application Firewall) operates at which layer of the OSI model to inspect HTTP/HTTPS payloads and block OWASP Top 10 vulnerabilities?',
        options: JSON.stringify([
          { id: '1', text: 'Layer 3 (Network Layer)', isCorrect: false },
          { id: '2', text: 'Layer 4 (Transport Layer)', isCorrect: false },
          { id: '3', text: 'Layer 7 (Application Layer)', isCorrect: true },
          { id: '4', text: 'Layer 2 (Data Link Layer)', isCorrect: false }
        ])
      },

      // 7. Data Security & Storage (Blancco, Apricorn, NGX)
      {
        domain: 'Data Security & Storage',
        difficulty: 2,
        points: 10,
        question_text: 'Why is Blancco Drive Eraser software preferred by compliance standards (like NIST 800-88) over simple hard drive formatting?',
        options: JSON.stringify([
          { id: '1', text: 'Formatting destroys the physical drive', isCorrect: false },
          { id: '2', text: 'Blancco overwrites sectors multiple times and verifies deletion, ensuring data cannot be recovered by forensic tools', isCorrect: true },
          { id: '3', text: 'Blancco simply changes drive letters to hide files', isCorrect: false },
          { id: '4', text: 'Formatting only works on SSDs', isCorrect: false }
        ])
      },
      {
        domain: 'Data Security & Storage',
        difficulty: 3,
        points: 15,
        question_text: 'How does an Apricorn Aegis Padlock secure physical USB flash drives and hard drives?',
        options: JSON.stringify([
          { id: '1', text: 'Via software-based encryption run from the host operating system', isCorrect: false },
          { id: '2', text: 'Via an onboard hardware keypad allowing pin-verification and hardware-based AES XTS 256-bit encryption independent of OS', isCorrect: true },
          { id: '3', text: 'By requiring a cloud connection before granting folder access', isCorrect: false },
          { id: '4', text: 'By using dynamic biometrics over a USB webcam connection', isCorrect: false }
        ])
      },

      // 8. Cloud & Data Centre Infrastructure (Inspur, KAYTUS, Vertiv)
      {
        domain: 'Cloud & Data Centre Infrastructure',
        difficulty: 2,
        points: 10,
        question_text: 'What is Vertiv SmartCabinet designed to accomplish in server room deployments?',
        options: JSON.stringify([
          { id: '1', text: 'It stores extra networking patch cables', isCorrect: false },
          { id: '2', text: 'It provides a fully integrated, self-contained micro-datacenter with built-in power, cooling, monitoring, and security', isCorrect: true },
          { id: '3', text: 'It compiles server source codes automatically', isCorrect: false },
          { id: '4', text: 'It acts as an external hardware firewall', isCorrect: false }
        ])
      },
      {
        domain: 'Cloud & Data Centre Infrastructure',
        difficulty: 4,
        points: 20,
        question_text: 'Inspur and KAYTUS servers are engineered to support intensive Cloud and AI workloads. What hardware feature makes their modern motherboards highly performant for this role?',
        options: JSON.stringify([
          { id: '1', text: 'Dual floppy disk drives', isCorrect: false },
          { id: '2', text: 'High-bandwidth PCIe Gen 5 configurations supporting multi-GPU nodes with advanced liquid-cooling manifolds', isCorrect: true },
          { id: '3', text: 'SATA II hard drive arrays only', isCorrect: false },
          { id: '4', text: 'Standard 10Mbps legacy RJ45 ports', isCorrect: false }
        ])
      },

      // 9. OT Security (Tenable)
      {
        domain: 'OT Security',
        difficulty: 3,
        points: 15,
        question_text: 'Tenable OT Security (formerly Indegy) performs asset discovery in Operational Technology (OT) networks. What is its standard safe discovery mechanism?',
        options: JSON.stringify([
          { id: '1', text: 'Aggressively running raw port scans which could freeze older PLCs', isCorrect: false },
          { id: '2', text: 'Passive network traffic monitoring combined with safe, controller-specific query protocols (Modbus, S7, Ethernet/IP)', isCorrect: true },
          { id: '3', text: 'Installing agent software directly on legacy motors and sensors', isCorrect: false },
          { id: '4', text: 'Encrypting industrial fieldbus communication', isCorrect: false }
        ])
      },
      {
        domain: 'OT Security',
        difficulty: 5,
        points: 25,
        question_text: 'Why is standard IT security vulnerability scanning dangerous when run directly on an OT network segment, and how does Tenable OT mitigate it?',
        options: JSON.stringify([
          { id: '1', text: 'Active scanning can crash sensitive PLC units due to unexpected network packets; Tenable OT uses specialized read-only passive sniffing and verified protocols', isCorrect: true },
          { id: '2', text: 'OT networks run at higher voltages; standard IT software can burn out lines', isCorrect: false },
          { id: '3', text: 'Active scanning increases file transfer speeds; Tenable OT limits it to 10 bytes/sec', isCorrect: false },
          { id: '4', text: 'OT devices do not have MAC addresses; Tenable OT assigns virtual IPs to scan', isCorrect: false }
        ])
      },

      // 10. General
      {
        domain: 'General',
        difficulty: 1,
        points: 5,
        question_text: 'In cybersecurity, what does the classic CIA Triad represent?',
        options: JSON.stringify([
          { id: '1', text: 'Central Intelligence Agency directives', isCorrect: false },
          { id: '2', text: 'Confidentiality, Integrity, and Availability', isCorrect: true },
          { id: '3', text: 'Coding, Indexing, and Auditing', isCorrect: false },
          { id: '4', text: 'Connection, Identity, and Authentication', isCorrect: false }
        ])
      },
      {
        domain: 'General',
        difficulty: 3,
        points: 15,
        question_text: 'What is the difference between symmetric and asymmetric cryptography in key distribution?',
        options: JSON.stringify([
          { id: '1', text: 'Symmetric uses a single shared secret key for encryption and decryption; asymmetric uses a public/private key pair', isCorrect: true },
          { id: '2', text: 'Symmetric is always secure against quantum computing; asymmetric is not', isCorrect: false },
          { id: '3', text: 'Symmetric requires public directory servers; asymmetric is serverless', isCorrect: false },
          { id: '4', text: 'Symmetric is only used for emails; asymmetric is only used for drives', isCorrect: false }
        ])
      },
      {
        domain: 'General',
        difficulty: 5,
        points: 25,
        question_text: 'Explain the zero-trust principle "Never Trust, Always Verify" and its main components.',
        options: JSON.stringify([
          { id: '1', text: 'Assuming all users inside the intranet are safe and only scanning external logins', isCorrect: false },
          { id: '2', text: 'Eliminating implicit trust, enforcing continuous validation, microsegmentation, and dynamic policy checks at every access request', isCorrect: true },
          { id: '3', text: 'Requiring users to enter their passwords three times every hour', isCorrect: false },
          { id: '4', text: 'Restricting web browsing on all administrative servers', isCorrect: false }
        ])
      }
    ];

    for (const q of defaultQuestions) {
      await run(
        `INSERT INTO questions (domain, difficulty, points, question_text, options) VALUES (?, ?, ?, ?, ?)`,
        [q.domain, q.difficulty, q.points, q.question_text, q.options]
      );
    }
    console.log('Seeded 25 base cybersecurity & networking questions.');
  }
};

module.exports = {
  db,
  query,
  get,
  run,
  initDb
};
