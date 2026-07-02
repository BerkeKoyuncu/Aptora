import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { HelpCircle, RefreshCw, FileText, CheckSquare, Square, Info } from 'lucide-react';

const DIFFICULTY_LABELS = { 1: 'Beginner', 2: 'Elementary', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert' };

export default function TestCreator({ user, addToast, onViewMailbox }) {
  const [title, setTitle] = useState('');
  const [numQuestions, setNumQuestions] = useState(10);
  const [isRandom, setIsRandom] = useState(true);
  const [difficultyPreset, setDifficultyPreset] = useState('medium');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [duration, setDuration] = useState(20);
  const [useHybrid, setUseHybrid] = useState(false);
  const [selectSearch, setSelectSearch] = useState('');
  const [selectDomain, setSelectDomain] = useState('');
  const [selectDiff, setSelectDiff] = useState('');
  const [requireSeb, setRequireSeb] = useState(false);

  const applyDifficultyPreset = (preset) => {
    setDifficultyPreset(preset);
    if (preset === 'easy') {
      setDist({ '1': 30, '2': 40, '3': 20, '4': 10, '5': 0 });
    } else if (preset === 'medium') {
      setDist({ '1': 10, '2': 20, '3': 40, '4': 20, '5': 10 });
    } else if (preset === 'hard') {
      setDist({ '1': 0, '2': 10, '3': 20, '4': 40, '5': 30 });
    }
  };
  
  // Available domains list
  const domainsList = [
    'Network Fundamentals',
    'Network Security & Edge Security',
    'Identity & Access Security',
    'Security Operations & Monitoring',
    'Vulnerability, Exposure & Security Testing',
    'Application & Software Security',
    'Data Security & Storage',
    'Cloud & Data Centre Infrastructure',
    'OT Security',
    'General'
  ];

  // Domains checkboxes (all checked by default)
  const [selectedDomains, setSelectedDomains] = useState(
    domainsList.reduce((acc, d) => ({ ...acc, [d]: true }), {})
  );

  // Difficulty Distribution state (sums to 100%) - Defaults to a bell curve
  // Level 1: 10%, Level 2: 20%, Level 3: 40%, Level 4: 20%, Level 5: 10%
  const [dist, setDist] = useState({
    '1': 10,
    '2': 20,
    '3': 40,
    '4': 20,
    '5': 10
  });

  // Manual Question Selector states
  const [allQuestions, setAllQuestions] = useState([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      setLoadingQuestions(true);
      const res = await api.getQuestions();
      setAllQuestions(res);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleDomainCheckbox = (domain) => {
    setSelectedDomains(prev => ({
      ...prev,
      [domain]: !prev[domain]
    }));
  };

  const handleDistChange = (level, val) => {
    const num = parseInt(val) || 0;
    setDifficultyPreset('custom');
    setDist(prev => ({
      ...prev,
      [level]: num
    }));
  };

  const loadBellCurve = () => {
    setDist({
      '1': 10,
      '2': 20,
      '3': 40,
      '4': 20,
      '5': 10
    });
    addToast('Default bell curve distribution loaded.');
  };

  const handleManualQuestionToggle = (qId) => {
    setSelectedQuestionIds(prev => {
      if (prev.includes(qId)) {
        return prev.filter(id => id !== qId);
      } else {
        return [...prev, qId];
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      addToast('Please enter a test title', 'warning');
      return;
    }

    const domainsArray = Object.keys(selectedDomains).filter(d => selectedDomains[d]);
    if (domainsArray.length === 0) {
      addToast('Please select at least one domain', 'warning');
      return;
    }

    if (isRandom) {
      // Validate distribution sums to 100%
      const totalPct = Object.values(dist).reduce((sum, v) => sum + v, 0);
      if (totalPct !== 100) {
        addToast(`Difficulty weights must sum to exactly 100%. Currently: ${totalPct}%`, 'error');
        return;
      }
      if (useHybrid) {
        if (selectedQuestionIds.length === 0) {
          addToast('Please pin at least one question or turn off hybrid mode', 'warning');
          return;
        }
        if (selectedQuestionIds.length >= numQuestions) {
          addToast(`Pinned questions (${selectedQuestionIds.length}) cannot exceed or equal total questions (${numQuestions})`, 'error');
          return;
        }
      }
    } else {
      if (selectedQuestionIds.length === 0) {
        addToast('Please select at least one question for manual test', 'warning');
        return;
      }
    }

    try {
      const payload = {
        title,
        num_questions: isRandom ? numQuestions : selectedQuestionIds.length,
        domains: domainsArray,
        is_random: isRandom,
        difficulty_distribution: dist,
        selected_questions: selectedQuestionIds,
        duration: parseInt(duration) || 20,
        require_seb: requireSeb
      };

      await api.createTest(payload);
      addToast('Test configuration generated successfully!');
      
      // Reset form
      setTitle('');
      setNumQuestions(10);
      setSelectedQuestionIds([]);
      setIsRandom(true);
      setDuration(20);
      setUseHybrid(false);
      setRequireSeb(false);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Filter questions for manual selection by active domains and selected UI search filters
  const activeDomains = Object.keys(selectedDomains).filter(d => selectedDomains[d]);
  const filteredQuestions = allQuestions.filter(q => {
    if (!activeDomains.includes(q.domain)) return false;
    if (selectSearch.trim() && !q.question_text.toLowerCase().includes(selectSearch.toLowerCase())) return false;
    if (selectDomain && q.domain !== selectDomain) return false;
    if (selectDiff && q.difficulty !== parseInt(selectDiff)) return false;
    return true;
  });

  const renderQuestionsTable = (label) => {
    return (
      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ margin: 0, fontWeight: 700 }}>{label} ({selectedQuestionIds.length} chosen)</label>
          <span className="badge badge-primary">
            Selected: {selectedQuestionIds.length}
          </span>
        </div>

        {/* Search & Filter Row */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', background: 'var(--color-panel)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <input 
            type="text" 
            placeholder="Search question contents..." 
            value={selectSearch} 
            onChange={e => setSelectSearch(e.target.value)} 
            style={{ flex: 1, minWidth: '180px', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
          />
          <select 
            value={selectDomain} 
            onChange={e => setSelectDomain(e.target.value)} 
            style={{ width: '180px', padding: '0.4rem', fontSize: '0.8rem' }}
          >
            <option value="">-- Filter by Domain --</option>
            {activeDomains.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select 
            value={selectDiff} 
            onChange={e => setSelectDiff(e.target.value)} 
            style={{ width: '130px', padding: '0.4rem', fontSize: '0.8rem' }}
          >
            <option value="">-- Difficulty --</option>
            {[1, 2, 3, 4, 5].map(v => (
              <option key={v} value={v}>{DIFFICULTY_LABELS[v]}</option>
            ))}
          </select>
          {(selectSearch || selectDomain || selectDiff) && (
            <button 
              type="button" 
              onClick={() => { setSelectSearch(''); setSelectDomain(''); setSelectDiff(''); }}
              className="btn btn-accent btn-sm"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
            >
              Clear
            </button>
          )}
        </div>

        {loadingQuestions ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <RefreshCw className="animate-spin" size={24} style={{ color: 'var(--color-primary)' }} />
          </div>
        ) : (
          <div style={{
            maxHeight: '300px',
            overflowY: 'auto',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            background: 'white'
          }}>
            {filteredQuestions.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No questions match the active domains selected above.
              </p>
            ) : (
              <table style={{ width: '100%', fontSize: '0.8rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ width: '50px' }}>Select</th>
                    <th>Domain</th>
                    <th>Diff</th>
                    <th>Pts</th>
                    <th>Question Text</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuestions.map(q => {
                    const isChecked = selectedQuestionIds.includes(q.id);
                    return (
                      <tr 
                        key={q.id} 
                        onClick={() => handleManualQuestionToggle(q.id)}
                        style={{ cursor: 'pointer', background: isChecked ? 'rgba(74, 125, 135, 0.08)' : 'inherit' }}
                      >
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={isChecked} 
                            readOnly
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{q.domain}</td>
                        <td>{DIFFICULTY_LABELS[q.difficulty] || q.difficulty}</td>
                        <td>{q.points}p</td>
                        <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {q.question_text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="animate-fade" style={{ width: '100%', margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <FileText size={24} style={{ color: 'var(--color-primary)' }} />
        <div>
          <h2 style={{ margin: 0 }}>Create Test Layout</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Configure test templates for candidate evaluation. You can generate randomized tests dynamically or pick questions manually.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Title & Duration */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <label>Test Title / Assessment Name</label>
            <input 
              type="text" 
              placeholder="e.g. Cybersecurity Fundamentals Assessment - Q3" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              required 
            />
          </div>
          <div>
            <label>Duration (Minutes)</label>
            <input 
              type="number" 
              min="1"
              max="360"
              value={duration} 
              onChange={e => setDuration(e.target.value)} 
              required 
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: '1.2rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
              <input 
                type="checkbox" 
                checked={requireSeb} 
                onChange={e => setRequireSeb(e.target.checked)} 
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span>Require SEB</span>
            </label>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '1.4rem' }}>Safe Exam Browser</span>
          </div>
        </div>

        {/* Selection Mode Toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div 
            onClick={() => setIsRandom(true)}
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              border: `2px solid ${isRandom ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: isRandom ? 'rgba(74, 125, 135, 0.05)' : 'white',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s'
            }}
          >
            <h4 style={{ margin: '0 0 0.25rem 0', color: isRandom ? 'var(--color-primary)' : 'var(--text-secondary)' }}>System Randomized</h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Dynamically draw questions based on parameters</span>
          </div>

          <div 
            onClick={() => setIsRandom(false)}
            style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              border: `2px solid ${!isRandom ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: !isRandom ? 'rgba(74, 125, 135, 0.05)' : 'white',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.2s'
            }}
          >
            <h4 style={{ margin: '0 0 0.25rem 0', color: !isRandom ? 'var(--color-primary)' : 'var(--text-secondary)' }}>Manual Selection</h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Explicitly select specific questions from database</span>
          </div>
        </div>

        {/* Domain Filter Grid */}
        <div>
          <label>Filter By Vendor Domains (All active by default)</label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '0.75rem',
            padding: '1rem',
            background: 'var(--color-panel)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)'
          }}>
            {domainsList.map(d => (
              <div 
                key={d} 
                onClick={() => handleDomainCheckbox(d)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}
              >
                {selectedDomains[d] ? (
                  <CheckSquare size={18} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                ) : (
                  <Square size={18} style={{ color: 'var(--color-border)', flexShrink: 0 }} />
                )}
                <span>{d}</span>
              </div>
            ))}
          </div>
        </div>

        {isRandom ? (
          /* Randomized Mode Panel */
          <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label>Number of Questions</label>
                <input 
                  type="number" 
                  min={1} 
                  max={100} 
                  value={numQuestions} 
                  onChange={e => setNumQuestions(parseInt(e.target.value) || 0)} 
                  required 
                />
              </div>

              <div>
                <label>Difficulty Preset</label>
                <select 
                  value={difficultyPreset} 
                  onChange={e => applyDifficultyPreset(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="easy">Easy (More beginner questions)</option>
                  <option value="medium">Medium (Standard Bell Curve)</option>
                  <option value="hard">Hard (More expert questions)</option>
                  <option value="custom">Custom (Specify percentages below)</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: '0.25rem' }}>
              <button 
                type="button" 
                onClick={() => setShowAdvanced(!showAdvanced)} 
                className="btn btn-accent btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--text-secondary)' }}
              >
                <RefreshCw size={12} className={showAdvanced ? 'rotate-180' : ''} style={{ transition: 'transform 0.3s' }} />
                <span>{showAdvanced ? 'Hide Custom Percentages' : 'Customize Distribution Percentages'}</span>
              </button>
            </div>

            {showAdvanced && (
              <div className="animate-fade" style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <label style={{ margin: 0, fontSize: '0.85rem' }}>Difficulty Rating Distribution (%)</label>
                  <span className="badge badge-accent" style={{ fontSize: '0.7rem' }}>
                    Total: {Object.values(dist).reduce((s, v) => s + v, 0)}% (Must sum to 100%)
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '0.75rem',
                  padding: '1rem',
                  background: 'var(--color-panel)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  {['1', '2', '3', '4', '5'].map(level => (
                    <div key={level} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.80rem', fontWeight: 600, marginBottom: '0.35rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={DIFFICULTY_LABELS[level]}>
                        {DIFFICULTY_LABELS[level]}
                      </div>
                      <input 
                        type="number" 
                        min={0} 
                        max={100} 
                        value={dist[level]} 
                        onChange={e => handleDistChange(level, e.target.value)} 
                        style={{ textAlign: 'center', padding: '0.5rem' }}
                        required 
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
              <input 
                type="checkbox" 
                id="useHybrid" 
                checked={useHybrid} 
                onChange={e => {
                  setUseHybrid(e.target.checked);
                  if (!e.target.checked) setSelectedQuestionIds([]);
                }}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="useHybrid" style={{ margin: 0, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
                Pre-select / Pin specific questions (Fill remaining questions randomly)
              </label>
            </div>

            {useHybrid && renderQuestionsTable("Pin Questions to Random Test")}
          </div>
        ) : (
          /* Manual Selection Mode Panel */
          renderQuestionsTable("Select Specific Questions")
        )}

        {/* Submit Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
          <button type="submit" className="btn btn-primary" style={{ minWidth: '150px' }}>
            Generate Test Schema
          </button>
        </div>
      </form>
    </div>
  );
}
