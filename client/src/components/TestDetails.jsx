import React from 'react';
import { ArrowLeft, Edit, FileDown } from 'lucide-react';
import TestCreator from './TestCreator';
import { formatDateTimeUK } from '../utils/dateFormat';

const DIFFICULTIES = { 1: 'Beginner', 2: 'Elementary', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert' };

export default function TestDetails({ test, editing, setEditing, onBack, onSaved, onExport, addToast }) {
  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Test History</button>
        <span style={{ flex: 1 }} />
        {!editing && <button className="btn btn-primary" onClick={() => setEditing(true)}><Edit size={16} /> Edit Test</button>}
        {!editing && ['docx', 'pdf'].map(format => <button key={format} className="btn btn-secondary" onClick={() => onExport(test, format)}><FileDown size={16} /> {format.toUpperCase()}</button>)}
      </div>

      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', overflowWrap: 'anywhere' }}>{test.title}</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <span className="badge badge-primary">{test.is_random ? 'Randomized' : 'Manual'}</span>
          <span className="badge badge-accent">Revision {test.revision}</span>
          {test.require_seb && <span className="badge badge-accent">SEB - Direct/LAN Access</span>}
        </div>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', margin: 0 }}>
          {[
            ['Questions', `${test.questions.length} selected`], ['Duration', `${test.duration} minutes`],
            ['Pass threshold', `${test.pass_threshold}%`], ['Total points', test.total_points],
            ['Created by', `${test.creator_name || 'Unknown'} (${test.creator_email || '--'})`],
            ['Created at', formatDateTimeUK(test.created_at)],
            ['Last updated', test.updated_at ? `${formatDateTimeUK(test.updated_at)} by ${test.updated_by_name || 'an administrator'}` : 'No changes since creation'],
            ['Candidate sessions', `${test.session_counts.pending || 0} pending / ${test.session_counts.active || 0} active / ${test.session_counts.completed || 0} completed`]
          ].map(([label, value]) => <div key={label}><dt style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.2rem' }}>{label}</dt><dd style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem', overflowWrap: 'anywhere' }}>{value}</dd></div>)}
        </dl>
        <div style={{ marginTop: '1.25rem', fontSize: '0.85rem' }}><strong>Domains:</strong> {test.domains.join(' · ')}</div>
        <div style={{ marginTop: '0.65rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}><strong>Target distribution:</strong> {Object.entries(test.difficulty_distribution).map(([level, weight]) => `${DIFFICULTIES[level]} ${weight}%`).join(' / ')}</div>
      </div>

      {editing ? <TestCreator key={`${test.id}-${test.revision}`} initialTest={test} addToast={addToast} onSaved={onSaved} onCancel={() => setEditing(false)} /> : (
        <div>
          <h3 style={{ margin: '0 0 1rem' }}>Question Content</h3>
          {test.questions.map((question, index) => (
            <article key={question.id} className="card" style={{ marginBottom: '1rem', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                <span>Question {index + 1} · {question.domain} · {DIFFICULTIES[question.difficulty]}</span>
                <span>{question.points} points{test.pinned_questions.includes(question.id) ? ' · Pinned' : ''}</span>
              </div>
              <p style={{ fontWeight: 600, margin: '0 0 1rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{question.question_text}</p>
              <ol style={{ listStyleType: 'upper-alpha', margin: 0, paddingLeft: '1.5rem' }}>
                {question.options.map(option => <li key={option.id} style={{ padding: '0.4rem 0.2rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {option.text}{option.isCorrect && <span className="badge badge-accent" style={{ marginLeft: '0.6rem', fontSize: '0.65rem' }}>Correct answer</span>}
                </li>)}
              </ol>
            </article>
          ))}
          {!test.questions.length && <div className="card">This test has no linked questions. Edit it to select questions.</div>}
        </div>
      )}
    </div>
  );
}
