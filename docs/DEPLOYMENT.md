# Aptora Production Deployment

The current Windows installer is configured for direct access at `http://SERVER_IP:9372` without DNS, TLS, or a reverse proxy. Because HTTP does not encrypt traffic, restrict access to trusted networks/VPN or specific source addresses whenever possible.

## Windows single-file installer

Run `npm run build:installer` or `deployment\windows\build-installer.bat` on a build computer with Node.js 20.17+, Inno Setup 6, and internet access. The isolated staging process leaves development dependencies intact and packages only the production client, required backend runtime dependencies, SQLite native runtime, and a portable Node runtime into `dist\AptoraSetup.exe`. The destination Windows server therefore needs no separate Node.js, npm, Git, or database-server installation.

On a fresh server, run the setup as Administrator. It automatically detects the active IPv4 address and configures `http://SERVER_IP:9372`; the first interactive screen creates the administrator. Setup generates Windows PowerShell 5.1-compatible secrets, writes the protected configuration and database under `%ProgramData%\Aptora`, requires QR-based TOTP confirmation, opens TCP 9372 in Windows Firewall, installs the `Aptora Server` startup task under `SYSTEM`, and starts the application. The installed Control Panel handles normal lifecycle, startup, logs, and administrator recovery operations.

If first-time setup is interrupted, rerunning the installer checks for an actual administrator record rather than merely checking whether the SQLite file exists. An empty or partially initialized database therefore resumes administrator enrollment, while a completed installation is preserved.

The installer does not configure router/NAT forwarding, upstream firewalls, VPN access, or backups. Reinstalling/upgrading application files and uninstalling preserve `%ProgramData%\Aptora` deliberately. Uninstall removes the installer-created Windows Firewall rule.

### Scheduled Task reliability and existing installations

The `Aptora Server` task still runs as `SYSTEM` with an `AtStartup` trigger.
Its execution limit is `PT0S` (unlimited), with up to **999 failure retries** at
`PT1M` intervals. Retries are finite, not a guarantee of recovery from a permanent
fault; inspect the logs if they are exhausted. There is no 72-hour runtime cutoff
and no tight restart loop. `run-backend.bat` passes through Node's exit code so
nonzero process failures remain eligible for Task Scheduler recovery. Stop using
the Control Panel or `Stop-ScheduledTask`, rather than killing Node directly, to
request an administrative stop without failure recovery.

Fresh setup installs this policy. Installer upgrades refresh the task before
starting Aptora, without rerunning administrator enrollment. To refresh only the
task on an existing installation, first deploy the updated `server-control.ps1`
to the installed application directory, then run in elevated PowerShell:

```powershell
& 'C:\Program Files\Aptora\server-control.ps1' InstallTask
Get-ScheduledTask -TaskName 'Aptora Server' |
    Select-Object -ExpandProperty Settings |
    Format-List ExecutionTimeLimit,RestartCount,RestartInterval
```

Expected settings:

```text
ExecutionTimeLimit : PT0S
RestartCount       : 999
RestartInterval    : PT1M
```

Automatic startup is stored in the `AtStartup` trigger's `Enabled` property, not
the task's enabled state. Control Panel options 5/6 toggle only boot startup;
the task remains enabled with demand starts allowed, so manual Start, Stop and
Restart work with either preference. Toggling startup does not start or stop an
already running server. No extra task or preference file is created.

`InstallTask` preserves the boot-start preference. Legacy task-wide disabled
installations are migrated to an enabled task with a disabled boot trigger;
manual Start also repairs that legacy state without enabling boot startup.
It does not start or stop the backend, change `aptora.env`, or access the
database, administrator accounts, application data or logs. If Aptora is already
running, use the Control Panel's Restart during a maintenance window so the new
policy applies to a new task invocation. Do not run `setup.bat` to refresh a task.

Verify the startup preference separately from the task state:

```powershell
$task = Get-ScheduledTask -TaskName 'Aptora Server'
$task.Settings | Format-List Enabled,AllowDemandStart,ExecutionTimeLimit,RestartCount,RestartInterval
$task.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' } |
    Format-List Enabled
```

Task `Enabled` and `AllowDemandStart` should always be true; the boot trigger's
`Enabled` value represents the user's preference. Repository regression checks:
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-startup-preference.ps1`.
These use native CIM objects and an in-memory Scheduler, not a real reboot or live
SYSTEM task. Confirm boot and lifecycle behaviour on the target server as well.

## 1. Configure the process environment

The variables in `.env.example` are a reference; the application does not automatically load `.env` files. Define them in the service account, IIS process manager, PM2, or the shell that starts Node.

Generate secrets in PowerShell:

```powershell
$jwtSecret = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
$encryptionKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
```

Both values must be stored in your password/secrets manager. `ENCRYPTION_KEY` is exactly 32 ASCII bytes and must never change after the administrator, 2FA, or SMTP settings are created.

Example for the current PowerShell session:

```powershell
$env:NODE_ENV = 'production'
$env:PUBLIC_URL = 'http://192.168.1.50:9372'
$env:JWT_SECRET = $jwtSecret
$env:ENCRYPTION_KEY = $encryptionKey
$env:TRUST_PROXY = 'false'
$env:ALLOWED_ORIGINS = 'http://192.168.1.50:9372'
$env:PORT = '9372'
$env:APTORA_LISTEN_HOST = '0.0.0.0'
$env:ALLOW_PUBLIC_NODE_BIND = 'true'
$env:ALLOW_INSECURE_HTTP = 'true'
$env:SESSION_LINK_TTL_HOURS = '72'
$env:RESULT_LINK_TTL_HOURS = '168'
```

Run `server/setup-admin.js` with the same `ENCRYPTION_KEY` that the production service will use.

## 2. Build and start

Install Node.js 20.17 or newer (an active LTS release is recommended), then:

```powershell
npm run install:all
npm run build:client
node server/setup-admin.js
npm start
```

The production process intentionally refuses to start when `PUBLIC_URL`, `JWT_SECRET`, or `ENCRYPTION_KEY` is missing or invalid.

## 3. Direct port 9372 access

- Use a fixed server IP and browse to `http://SERVER_IP:9372`.
- Keep the frontend and API on the same origin. Direct HTTP mode uses an `HttpOnly`, `SameSite=Strict` admin cookie; it is intentionally not marked `Secure` because browsers reject Secure cookies over HTTP.
- The installer sets `APTORA_LISTEN_HOST=0.0.0.0`, explicitly enables public binding/insecure HTTP, and creates the Windows Firewall rule.
- Prefer limiting the firewall rule to company/VPN address ranges after installation. If access crosses a router, configure NAT/port forwarding separately.
- HTTP exposes credentials, candidate details, and answers to network interception. Restore HTTPS before using an untrusted or public network.
- Do not log authentication cookies or candidate passwords.

## 4. Operations

- Run Node under a service manager and enable automatic restart.
- Back up `server/database.sqlite` while coordinating writes or while the process is stopped.
- Restrict filesystem access to the service account and backup operators.
- Store the application directory and backups on an encrypted OS volume (for example BitLocker/LUKS). Candidate identity, answers, and scores are not field-encrypted inside SQLite.
- Restrict read access to `security_audit_logs`; define retention and monitoring for repeated login failures, admin changes, and destructive actions.
- Collect JSON lines with `"type":"security_audit"` from service stdout into the company SIEM/log platform. Database audit records are pruned after `AUDIT_RETENTION_DAYS` (default 180).
- Administrators and temporary candidates sign in through the Aptora login page. Candidate accounts are isolated from administrator accounts and are removed after submission.
- New panel-created administrators must enroll an authenticator at first login. They may later disable 2FA from Account Settings by entering a current TOTP code.
- Pending candidate accounts expire after `SESSION_LINK_TTL_HOURS`. Candidate accounts are deleted after submission; admin reports remain available after authenticated login.
- `require_seb` sessions disable task switching, reload, printing, context menus, new windows, and manual quit in the generated config, and validate the SEB Config Key request header on the backend. Test this with the exact SEB versions used by the company before rollout.
- For high-stakes supervised exams, deploy SEB on company-managed devices. Browser Exam Keys are client-version/configuration-specific and cannot be generated reliably by this dynamic per-session config service alone.
- The built-in rate limiter is process-local. If you run multiple Node instances, enforce shared rate limiting at the reverse proxy/WAF as well.
- After deployment, verify admin and candidate login, 2FA, temporary-account deletion after submission, SEB configuration download, and restore from a test backup.
