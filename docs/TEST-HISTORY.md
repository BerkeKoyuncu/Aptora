# Test History: details, editing and exports

In Test History, select a test title or **Details** to view its settings, creator,
creation and edit timestamps, revision, candidate session counts, full questions,
answer options and correct answers. Administrator access is required.

Select **Edit** to open the same configuration form used for test creation. You can
change the title, domains, selection mode, duration, pass threshold, SEB setting,
difficulty targets and question selection. Randomised layouts keep their current
questions unless **Draw a fresh question set when saving** is selected. The normal
pinning controls are available for a fresh draw.

Edits are saved atomically. If another administrator changed the test after it was
opened, the save is rejected: reopen the test to load the latest revision.

## Existing candidates

- Pending candidates use the revised layout when they start.
- Active and completed assessments retain their question snapshot, title,
  duration, pass threshold and SEB settings. Editing a template does not recalculate
  historical scores or change an active candidate's deadline.
- Existing active/completed sessions are backfilled during the upgrade using the
  settings currently stored for their test. Previously overwritten settings cannot
  be reconstructed retrospectively.
- Already sent invitations are not automatically resent. If duration, question
  count or SEB requirements changed, update and resend pending candidates'
  instructions through Execution History.

## DOCX and PDF

Use **DOCX** or **PDF** in the list or detail view. The exported document contains
the current saved questions, E-Data logo, instructions, domain labels,
numbered questions and answer options, and page numbers. Creation details, test
configuration metadata, difficulty labels and points are not printed. These
details remain available in the administrator detail view. An administrator answer
copy can highlight the correct option text in dark red within each question;
this is disabled by default. No separate answer-key section is appended.

DOCX uses Arial and A4 pages. PDF embeds the server's Arial fonts on Windows and
preserves Turkish characters. No Microsoft Word, LibreOffice, SMTP or external
document service is needed to generate either download. On Linux, install Arial
or a supported Liberation Sans fallback before using PDF export.

Dates use UK formatting and the Europe/Istanbul time zone.

## Verification

`node scripts/test-history.test.js` runs integration checks against a fresh
isolated SQLite database under `.build/test-history-qa/`. It checks creation,
details, edits, revision conflicts, pins, candidate flow, historical snapshots,
authorization, audit entries and DOCX/PDF downloads. It also writes sample
documents for rendering and visual inspection. It never opens the production
database.
