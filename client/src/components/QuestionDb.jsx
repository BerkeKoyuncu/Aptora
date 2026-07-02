import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Database, Plus, Edit, Trash2, CheckCircle, XCircle, Search, RefreshCw, Send, Check, Upload, Download, AlertCircle } from 'lucide-react';

const DIFFICULTY_LABELS = { 1: 'Beginner', 2: 'Elementary', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert' };

const getDifficultyBadgeStyle = (diff) => {
  const styles = {
    1: { backgroundColor: 'rgba(46, 125, 50, 0.1)', color: 'var(--color-success)', border: '1px solid rgba(46, 125, 50, 0.2)' },
    2: { backgroundColor: 'rgba(2, 136, 209, 0.1)', color: 'var(--color-info)', border: '1px solid rgba(2, 136, 209, 0.2)' },
    3: { backgroundColor: 'rgba(74, 125, 135, 0.1)', color: 'var(--color-secondary)', border: '1px solid rgba(74, 125, 135, 0.2)' },
    4: { backgroundColor: 'rgba(237, 108, 2, 0.1)', color: 'var(--color-warning)', border: '1px solid rgba(237, 108, 2, 0.2)' },
    5: { backgroundColor: 'rgba(211, 47, 47, 0.1)', color: 'var(--color-error)', border: '1px solid rgba(211, 47, 47, 0.2)' }
  };
  return styles[diff] || { backgroundColor: 'var(--color-border)', color: 'var(--text-secondary)' };
};

export default function QuestionDb({ user, addToast, isAdviceOnly = false, triggerAdd = false, onTriggerAddReset = null, defaultView = 'list', onSaveSuccess = null, onNavigateToAdd = null }) {
  const [questions, setQuestions] = useState([]);
  const [advices, setAdvices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Bulk Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreviewList, setImportPreviewList] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedIds, setSelectedIds] = useState([]);

  // Editor Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add'); // 'add', 'edit', 'advice'
  const [editingId, setEditingId] = useState(null);

  // Form states
  const [domain, setDomain] = useState('Network Fundamentals');
  const [difficulty, setDifficulty] = useState(3);
  const [points, setPoints] = useState(15);
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState([
    { id: '1', text: '', isCorrect: true },
    { id: '2', text: '', isCorrect: false },
    { id: '3', text: '', isCorrect: false },
    { id: '4', text: '', isCorrect: false }
  ]);

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

  const fetchQuestionsAndAdvices = async () => {
    try {
      setLoading(true);
      if (user.role === 'admin' && !isAdviceOnly) {
        const [qRes, aRes] = await Promise.all([
          api.getQuestions(),
          api.getAdvices()
        ]);
        setQuestions(qRes);
        setAdvices(aRes);
      } else {
        const aRes = await api.getAdvices();
        setAdvices(aRes);
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestionsAndAdvices();
  }, [isAdviceOnly]);

  useEffect(() => {
    if (triggerAdd) {
      handleOpenAdd();
      if (onTriggerAddReset) onTriggerAddReset();
    }
  }, [triggerAdd]);

  useEffect(() => {
    if (defaultView === 'add') {
      setModalType(isAdviceOnly ? 'advice' : 'add');
      setDomain('Network Fundamentals');
      setDifficulty(3);
      setPoints(15);
      setQuestionText('');
      setOptions([
        { id: '1', text: '', isCorrect: true },
        { id: '2', text: '', isCorrect: false },
        { id: '3', text: '', isCorrect: false },
        { id: '4', text: '', isCorrect: false }
      ]);
    }
  }, [defaultView, isAdviceOnly]);

  const handleOpenAdd = () => {
    setModalType(isAdviceOnly ? 'advice' : 'add');
    setEditingId(null);
    setDomain('Network Fundamentals');
    setDifficulty(3);
    setPoints(15);
    setQuestionText('');
    setOptions([
      { id: '1', text: '', isCorrect: true },
      { id: '2', text: '', isCorrect: false },
      { id: '3', text: '', isCorrect: false },
      { id: '4', text: '', isCorrect: false }
    ]);
    setShowModal(true);
  };

  const handleOpenEdit = (q) => {
    setModalType('edit');
    setEditingId(q.id);
    setDomain(q.domain);
    setDifficulty(q.difficulty);
    setPoints(q.points);
    setQuestionText(q.question_text);
    setOptions(q.options);
    setShowModal(true);
  };

  const handleOptionTextChange = (id, text) => {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, text } : o));
  };

  const handleCorrectOptionChange = (id) => {
    setOptions(prev => prev.map(o => ({ ...o, isCorrect: o.id === id })));
  };

  // Adjust points automatically when difficulty changes to make it simpler, but allow override
  const handleDifficultyChange = (val) => {
    const diff = parseInt(val);
    setDifficulty(diff);
    // Auto points mapping: 1->5, 2->10, 3->15, 4->20, 5->25
    setPoints(diff * 5);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!questionText.trim()) {
      addToast('Question text cannot be empty', 'warning');
      return;
    }

    // Check options are filled
    const invalidOptions = options.some(o => !o.text.trim());
    if (invalidOptions) {
      addToast('Please fill in all option choices', 'warning');
      return;
    }

    const payload = {
      domain,
      difficulty,
      points,
      question_text: questionText,
      options
    };

    try {
      if (modalType === 'add') {
        await api.createQuestion(payload);
        addToast('Question added successfully.');
      } else if (modalType === 'edit') {
        await api.updateQuestion(editingId, payload);
        addToast('Question updated successfully.');
      } else if (modalType === 'advice') {
        await api.submitAdvice(payload);
        addToast('Advice suggestion sent to Admin for approval.');
      }
      setShowModal(false);
      fetchQuestionsAndAdvices();
      if (onSaveSuccess) onSaveSuccess();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await api.deleteQuestion(id);
      addToast('Question deleted.');
      // Remove from selected list if deleted individually
      setSelectedIds(prev => prev.filter(x => x !== id));
      fetchQuestionsAndAdvices();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedIds.length} selected questions? This action is permanent.`)) {
      return;
    }
    try {
      await api.bulkDeleteQuestions(selectedIds);
      addToast(`${selectedIds.length} questions deleted successfully.`);
      setSelectedIds([]);
      fetchQuestionsAndAdvices();
      if (onSaveSuccess) onSaveSuccess();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleApproveAdvice = async (id) => {
    try {
      await api.approveAdvice(id);
      addToast('Advice question approved and added to live database!');
      fetchQuestionsAndAdvices();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleRejectAdvice = async (id) => {
    if (!confirm('Are you sure you want to reject this advice?')) return;
    try {
      await api.rejectAdvice(id);
      addToast('Advice question rejected.');
      fetchQuestionsAndAdvices();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem('aptora_token');
      const response = await fetch(`${api.API_BASE}/questions/template`, {
        method: 'GET',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (!response.ok) {
        throw new Error('Failed to download template.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'aptora_question_import_template.xlsx');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDownloadJsonTemplate = () => {
    const sampleJson = [
      {
        domain: 'Network Fundamentals',
        difficulty: 3,
        points: 15,
        question_text: 'Which protocol is used to automatically assign IP addresses in a network?',
        options: [
          { text: 'Dynamic Host Configuration Protocol (DHCP)', isCorrect: true },
          { text: 'Simple Mail Transfer Protocol (SMTP)', isCorrect: false },
          { text: 'Domain Name System (DNS)', isCorrect: false },
          { text: 'Transmission Control Protocol (TCP)', isCorrect: false }
        ]
      },
      {
        domain: 'Network Security & Edge Security',
        difficulty: 2,
        points: 10,
        question_text: 'What is the default port zone for the WAN interface (X1) in SonicWall SonicOS?',
        options: [
          { text: 'LAN Zone', isCorrect: false },
          { text: 'DMZ Zone', isCorrect: false },
          { text: 'WLAN Zone', isCorrect: false },
          { text: 'Untrusted (WAN) Zone', isCorrect: true }
        ]
      }
    ];

    const jsonContent = JSON.stringify(sampleJson, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'aptora_question_import_template.json');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const detectDelimiter = (firstLine) => {
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    return semicolons > commas ? ';' : ',';
  };

  const parseCSV = (text, delimiter = ',') => {
    const lines = [];
    let row = [""];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delimiter && !inQuotes) {
        row.push('');
      } else if ((c === '\r' || c === '\n') && !inQuotes) {
        if (c === '\r' && next === '\n') {
          i++;
        }
        lines.push(row);
        row = [''];
      } else {
        row[row.length - 1] += c;
      }
    }
    if (row.length > 1 || row[0] !== '') {
      lines.push(row);
    }
    return lines;
  };

  const handleFileLoad = (fileName, fileContent) => {
    try {
      let parsedQuestions = [];
      if (fileName.endsWith('.json')) {
        const jsonData = JSON.parse(fileContent);
        if (!Array.isArray(jsonData)) {
          throw new Error('JSON file must contain an array of question objects.');
        }
        parsedQuestions = jsonData.map((q) => {
          const errors = [];
          if (!q.domain) errors.push('Domain is required.');
          const diff = parseInt(q.difficulty);
          if (isNaN(diff) || diff < 1 || diff > 5) errors.push('Difficulty must be between 1 and 5.');
          const pts = parseInt(q.points) || (diff ? diff * 5 : 15);
          if (!q.question_text) errors.push('Question text is required.');
          if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
            errors.push('Options array is required and must have at least 2 options.');
          } else {
            const hasCorrect = q.options.some(opt => opt.isCorrect === true || opt.isCorrect === 'true' || opt.isCorrect === 1);
            if (!hasCorrect) errors.push('No option is marked as correct.');
            const emptyText = q.options.some(opt => !opt.text || !opt.text.trim());
            if (emptyText) errors.push('One or more option choices have empty text.');
          }

          return {
            domain: q.domain || 'Network Fundamentals',
            difficulty: isNaN(diff) ? 3 : diff,
            points: pts,
            question_text: q.question_text || '',
            options: (q.options || []).map((o, idx) => ({
              id: String(idx + 1),
              text: o.text || '',
              isCorrect: !!o.isCorrect
            })),
            errors,
            isValid: errors.length === 0
          };
        });
      } else {
        // CSV
        const firstLine = fileContent.split('\n')[0] || '';
        const delimiter = detectDelimiter(firstLine);
        const rows = parseCSV(fileContent, delimiter);
        if (rows.length < 2) {
          throw new Error('CSV file must have a header row and at least one question row.');
        }

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const idxDomain = headers.indexOf('domain');
        const idxDifficulty = headers.indexOf('difficulty');
        const idxPoints = headers.indexOf('points');
        const idxQuestionText = headers.indexOf('question_text');
        const idxOptionA = headers.indexOf('option_a');
        const idxOptionB = headers.indexOf('option_b');
        const idxOptionC = headers.indexOf('option_c');
        const idxOptionD = headers.indexOf('option_d');
        const idxCorrect = headers.indexOf('correct_option');

        if (idxDomain === -1 || idxDifficulty === -1 || idxQuestionText === -1 || idxOptionA === -1 || idxOptionB === -1 || idxCorrect === -1) {
          throw new Error('CSV file must contain columns: domain, difficulty, question_text, option_a, option_b, correct_option. (Optional: points, option_c, option_d)');
        }

        parsedQuestions = rows.slice(1).filter(row => row.some(cell => cell && cell.trim() !== '')).map((row) => {
          const errors = [];
          const domainVal = (row[idxDomain] || '').trim();
          const diffStr = (row[idxDifficulty] || '').trim();
          const diff = parseInt(diffStr);
          const ptsStr = idxPoints !== -1 ? (row[idxPoints] || '').trim() : '';
          let pts = parseInt(ptsStr);
          const qText = (row[idxQuestionText] || '').trim();
          const optA = (row[idxOptionA] || '').trim();
          const optB = (row[idxOptionB] || '').trim();
          const optC = idxOptionC !== -1 ? (row[idxOptionC] || '').trim() : '';
          const optD = idxOptionD !== -1 ? (row[idxOptionD] || '').trim() : '';
          const correctChar = (row[idxCorrect] || '').trim().toUpperCase();

          if (!domainVal) errors.push('Domain area is required.');
          if (isNaN(diff) || diff < 1 || diff > 5) errors.push('Difficulty must be between 1 and 5.');
          if (isNaN(pts)) pts = isNaN(diff) ? 15 : diff * 5;
          if (pts <= 0) errors.push('Points must be greater than 0.');
          if (!qText) errors.push('Question text is required.');
          if (!optA) errors.push('Option A text is required.');
          if (!optB) errors.push('Option B text is required.');

          const availableOptions = [];
          if (optA) availableOptions.push({ char: 'A', text: optA });
          if (optB) availableOptions.push({ char: 'B', text: optB });
          if (optC) availableOptions.push({ char: 'C', text: optC });
          if (optD) availableOptions.push({ char: 'D', text: optD });

          const correctChars = availableOptions.map(o => o.char);
          if (!correctChar || !correctChars.includes(correctChar)) {
            errors.push(`Correct option must be one of: ${correctChars.join(', ')}`);
          }

          const optionsArray = availableOptions.map((o, optIdx) => ({
            id: String(optIdx + 1),
            text: o.text,
            isCorrect: o.char === correctChar
          }));

          return {
            domain: domainVal || 'Network Fundamentals',
            difficulty: isNaN(diff) ? 3 : diff,
            points: pts,
            question_text: qText || '',
            options: optionsArray,
            errors,
            isValid: errors.length === 0
          };
        });
      }

      setImportPreviewList(parsedQuestions);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleConfirmImport = async () => {
    const validQuestions = importPreviewList.filter(q => q.isValid);
    if (validQuestions.length === 0) {
      addToast('No valid questions found to import.', 'warning');
      return;
    }

    try {
      setImporting(true);
      const res = await api.importQuestions(validQuestions);
      addToast(`${res.count} questions imported successfully!`);
      setShowImportModal(false);
      setImportPreviewList([]);
      fetchQuestionsAndAdvices();
      if (onSaveSuccess) onSaveSuccess();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const renderSortHeader = (label, key, width) => {
    const isSorted = sortBy === key;
    return (
      <th 
        style={{ ...(width ? { width } : {}), cursor: 'pointer', userSelect: 'none' }}
        onClick={() => {
          if (isSorted) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
          } else {
            setSortBy(key);
            setSortOrder('asc');
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span>{label}</span>
          <span style={{ fontSize: '0.65rem', color: isSorted ? 'var(--color-primary)' : 'var(--text-muted)', opacity: isSorted ? 1 : 0.4 }}>
            {isSorted ? (sortOrder === 'asc' ? '▲' : '▼') : '⇅'}
          </span>
        </div>
      </th>
    );
  };

  // Filter and Sort lists
  const filteredQuestions = questions.filter(q => {
    const matchSearch = q.question_text.toLowerCase().includes(searchQuery.toLowerCase());
    const matchDomain = selectedDomain ? q.domain === selectedDomain : true;
    const matchDifficulty = selectedDifficulty ? q.difficulty === parseInt(selectedDifficulty) : true;
    return matchSearch && matchDomain && matchDifficulty;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'id') {
      comparison = a.id - b.id;
    } else if (sortBy === 'domain') {
      comparison = a.domain.localeCompare(b.domain);
    } else if (sortBy === 'difficulty') {
      comparison = a.difficulty - b.difficulty;
    } else if (sortBy === 'points') {
      comparison = a.points - b.points;
    } else if (sortBy === 'question_text') {
      comparison = a.question_text.localeCompare(b.question_text);
    } else if (sortBy === 'created_at') {
      comparison = new Date(a.created_at || 0) - new Date(b.created_at || 0);
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  if (defaultView === 'add') {
    return (
      <div className="animate-fade" style={{ width: '100%', margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <Database size={24} style={{ color: 'var(--color-primary)' }} />
          <div>
            <h2 style={{ margin: 0 }}>{isAdviceOnly ? 'Propose Sample Question' : 'Add New Question'}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Create a new cybersecurity assessment question with custom domains, difficulty tiers, and point allocations.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label>Domain Area</label>
              <select value={domain} onChange={e => setDomain(e.target.value)} required>
                {domainsList.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <div>
                <label>Difficulty Rating</label>
                <select value={difficulty} onChange={e => handleDifficultyChange(e.target.value)} required>
                  {[1, 2, 3, 4, 5].map(v => (
                    <option key={v} value={v}>{DIFFICULTY_LABELS[v]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Points</label>
                <input 
                  type="number" 
                  min={1} 
                  max={100} 
                  value={points} 
                  onChange={e => setPoints(parseInt(e.target.value) || 0)} 
                  required 
                />
              </div>
            </div>
          </div>

          <div>
            <label>Question Text</label>
            <textarea 
              rows={3} 
              placeholder="Type the cybersecurity or networking question details..." 
              value={questionText} 
              onChange={e => setQuestionText(e.target.value)} 
              required 
            />
          </div>

          <div>
            <label style={{ marginBottom: '0.75rem' }}>Option Choices & Correct Answer (Radio Select)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {options.map((opt, idx) => (
                <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input 
                    type="radio" 
                    name="correct-option" 
                    checked={opt.isCorrect} 
                    onChange={() => handleCorrectOptionChange(opt.id)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Choice {String.fromCharCode(65 + idx)}:</span>
                  <input 
                    type="text" 
                    placeholder={`Option ${String.fromCharCode(65 + idx)} content`} 
                    value={opt.text} 
                    onChange={e => handleOptionTextChange(opt.id, e.target.value)}
                    required 
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={() => { if (onSaveSuccess) onSaveSuccess(); }} className="btn btn-accent btn-sm">Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm">
              {isAdviceOnly ? 'Submit Suggestion' : 'Save Question'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Header Panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>{isAdviceOnly ? 'Submit Question Advice' : 'Question Database Management'}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isAdviceOnly 
              ? 'Recommend sample questions to administrators to expand the cyber concepts catalog.' 
              : 'Add, update, or delete live questions. Review user suggestions.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {!isAdviceOnly && user.role === 'admin' && (
            <button 
              onClick={() => {
                setImportPreviewList([]);
                setShowImportModal(true);
              }} 
              className="btn btn-accent" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Upload size={18} />
              <span>Bulk Import</span>
            </button>
          )}
          <button onClick={onNavigateToAdd ? onNavigateToAdd : handleOpenAdd} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isAdviceOnly ? <Send size={18} /> : <Plus size={18} />}
            <span>{isAdviceOnly ? 'Propose Question' : 'Add Question'}</span>
          </button>
        </div>
      </div>

      {/* Admin View split: Database Questions & Advices */}
      {!isAdviceOnly && user.role === 'admin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* 1. Proposed Advices Inbox (Admin view) */}
          {advices.length > 0 && (
            <div className="card animate-fade" style={{ borderLeft: '4px solid var(--color-secondary)', background: 'rgba(74, 125, 135, 0.05)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '1.05rem', margin: 0, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={18} style={{ color: 'var(--color-secondary)' }} /> Pending Question Advices ({advices.filter(a=>a.status==='pending').length} items)
              </h3>
              
              <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-card)' }}>
                <table style={{ width: '100%', fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Suggested By</th>
                      <th>Domain</th>
                      <th>Diff/Pts</th>
                      <th>Question Text</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {advices.map(advice => (
                      <tr key={advice.id}>
                        <td style={{ fontWeight: 600 }}>{advice.advisor_name || 'Standard User'}</td>
                        <td>{advice.domain}</td>
                        <td>{DIFFICULTY_LABELS[advice.difficulty] || advice.difficulty} ({advice.points}p)</td>
                        <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {advice.question_text}
                        </td>
                        <td>
                          <span className={`badge ${advice.status === 'approved' ? 'badge-success' : advice.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                            {advice.status}
                          </span>
                        </td>
                        <td>
                          {advice.status === 'pending' ? (
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                              <button onClick={() => handleApproveAdvice(advice.id)} className="btn btn-success btn-sm" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <Check size={12} /> Approve
                              </button>
                              <button onClick={() => handleRejectAdvice(advice.id)} className="btn btn-danger btn-sm" style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <XCircle size={12} /> Reject
                              </button>
                            </div>
                          ) : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. Search and Filter Bar */}
          <div className="card" style={{ display: 'flex', gap: '0.75rem', padding: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px', background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.25rem 0.75rem' }}>
              <Search size={18} style={{ color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search question contents..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                style={{ border: 'none', padding: '0.5rem 0', boxShadow: 'none', background: 'transparent' }}
              />
            </div>
            
            <div style={{ width: '180px' }}>
              <select value={selectedDomain} onChange={e => setSelectedDomain(e.target.value)}>
                <option value="">-- All Domains --</option>
                {domainsList.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div style={{ width: '150px' }}>
              <select value={selectedDifficulty} onChange={e => setSelectedDifficulty(e.target.value)}>
                <option value="">-- All Difficulties --</option>
                {[1, 2, 3, 4, 5].map(v => (
                  <option key={v} value={v}>{DIFFICULTY_LABELS[v]}</option>
                ))}
              </select>
            </div>


            
            <button onClick={fetchQuestionsAndAdvices} className="btn btn-accent" style={{ padding: '0.65rem' }} title="Refresh List">
              <RefreshCw size={18} />
            </button>
          </div>

          {selectedIds.length > 0 && (
            <div className="card animate-fade" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-danger)' }}>
                {selectedIds.length} questions selected
              </span>
              <button onClick={handleBulkDelete} className="btn btn-danger btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Trash2 size={14} />
                <span>Delete Selected</span>
              </button>
            </div>
          )}

          {/* 3. Live Question Database */}
          <div className="table-container">
            <table style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={filteredQuestions.length > 0 && filteredQuestions.every(q => selectedIds.includes(q.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const allFilteredIds = filteredQuestions.map(q => q.id);
                          setSelectedIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
                        } else {
                          const allFilteredIds = filteredQuestions.map(q => q.id);
                          setSelectedIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  {renderSortHeader('ID', 'id', '80px')}
                  {renderSortHeader('Domain', 'domain', '220px')}
                  {renderSortHeader('Difficulty', 'difficulty', '120px')}
                  {renderSortHeader('Points', 'points', '80px')}
                  {renderSortHeader('Question Text', 'question_text')}
                  {renderSortHeader('Created At', 'created_at', '140px')}
                  <th style={{ width: '100px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuestions.map(q => (
                  <tr key={q.id}>
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(q.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(prev => [...prev, q.id]);
                          } else {
                            setSelectedIds(prev => prev.filter(x => x !== q.id));
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ fontWeight: 600 }}>#{q.id}</td>
                    <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{q.domain}</td>
                    <td>
                      <span className="badge" style={getDifficultyBadgeStyle(q.difficulty)}>{DIFFICULTY_LABELS[q.difficulty] || q.difficulty}</span>
                    </td>
                    <td style={{ fontWeight: 700 }}>{q.points}p</td>
                    <td>{q.question_text}</td>
                    <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      {q.created_at ? new Date(q.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => handleOpenEdit(q)} className="btn btn-accent btn-sm" style={{ padding: '0.35rem' }}>
                          <Edit size={14} />
                        </button>
                        <button onClick={() => handleDelete(q.id)} className="btn btn-danger btn-sm" style={{ padding: '0.35rem' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredQuestions.length === 0 && (
              <p style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No database questions match the filter criteria.</p>
            )}
          </div>
        </div>
      )}

      {/* Standard User advice history list */}
      {(isAdviceOnly || user.role === 'standard') && (
        <div className="card">
          <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Database size={18} /> My Proposed Question Advices
            </h3>
          </div>

          <div style={{ overflowX: 'auto' }}>
            {advices.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>You haven't recommended any sample questions yet.</p>
            ) : (
              <table style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Difficulty</th>
                    <th>Points</th>
                    <th>Question</th>
                    <th>Status</th>
                    <th>Proposed Date</th>
                  </tr>
                </thead>
                <tbody>
                  {advices.map(advice => (
                    <tr key={advice.id}>
                      <td style={{ fontWeight: 600 }}>{advice.domain}</td>
                      <td>{DIFFICULTY_LABELS[advice.difficulty] || advice.difficulty}</td>
                      <td style={{ fontWeight: 700 }}>{advice.points}p</td>
                      <td>{advice.question_text}</td>
                      <td>
                        <span className={`badge ${advice.status === 'approved' ? 'badge-success' : advice.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                          {advice.status}
                        </span>
                      </td>
                      <td>{new Date(advice.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>

    {/* Add / Edit / Advice Modal */}
    {showModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade" style={{ maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={20} style={{ color: 'var(--color-primary)' }} />
                <h3 style={{ margin: 0 }}>
                  {modalType === 'add' && 'Create Live Question'}
                  {modalType === 'edit' && 'Edit Question Details'}
                  {modalType === 'advice' && 'Propose Sample Question'}
                </h3>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label>Domain Area</label>
                  <select value={domain} onChange={e => setDomain(e.target.value)} required>
                    {domainsList.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <label>Difficulty Rating</label>
                    <select value={difficulty} onChange={e => handleDifficultyChange(e.target.value)} required>
                      {[1, 2, 3, 4, 5].map(v => (
                        <option key={v} value={v}>{DIFFICULTY_LABELS[v]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Points</label>
                    <input 
                      type="number" 
                      min={1} 
                      max={100} 
                      value={points} 
                      onChange={e => setPoints(parseInt(e.target.value) || 0)} 
                      required 
                    />
                  </div>
                </div>
              </div>

              <div>
                <label>Question Text</label>
                <textarea 
                  rows={3} 
                  placeholder="Type the cybersecurity or networking question details..." 
                  value={questionText} 
                  onChange={e => setQuestionText(e.target.value)} 
                  required 
                />
              </div>

              <div>
                <label style={{ marginBottom: '0.75rem' }}>Option Choices & Correct Answer (Radio Select)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {options.map((opt, idx) => (
                    <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <input 
                        type="radio" 
                        name="correct-option" 
                        checked={opt.isCorrect} 
                        onChange={() => handleCorrectOptionChange(opt.id)}
                        style={{ width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Choice {String.fromCharCode(65 + idx)}:</span>
                      <input 
                        type="text" 
                        placeholder={`Option ${String.fromCharCode(65 + idx)} content`} 
                        value={opt.text} 
                        onChange={e => handleOptionTextChange(opt.id, e.target.value)}
                        required 
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-accent btn-sm">Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">
                  {modalType === 'advice' ? 'Submit Suggestion' : 'Save Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Upload size={20} style={{ color: 'var(--color-primary)' }} />
                <h3 style={{ margin: 0 }}>Bulk Import Questions</h3>
              </div>
              <button onClick={() => setShowImportModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} disabled={importing}>
                <XCircle size={20} style={{ display: 'block' }} />
              </button>
            </div>

            {/* Guidelines / Template download */}
            <div className="card" style={{ padding: '1rem', background: 'rgba(121, 164, 175, 0.05)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-primary)' }}>Import Guidelines</h4>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Download the Excel template (<strong>.xlsx</strong>) below which has built-in dropdown menus for domains, difficulty levels, and correct option mapping. 
                Fill it out in Excel, save it as a <strong>CSV (Comma Delimited)</strong> or <strong>JSON</strong> file, and upload it here.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button 
                  onClick={handleDownloadTemplate} 
                  className="btn btn-sm btn-accent" 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.75rem', marginTop: '0.25rem' }}
                >
                  <Download size={14} />
                  <span>Download Excel Template (.xlsx)</span>
                </button>
                <button 
                  onClick={handleDownloadJsonTemplate} 
                  className="btn btn-sm btn-accent" 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.75rem', fontSize: '0.75rem', marginTop: '0.25rem' }}
                >
                  <Download size={14} />
                  <span>Download JSON Template (.json)</span>
                </button>
              </div>
            </div>

            {/* Drag & Drop Area */}
            <div 
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  const file = e.dataTransfer.files[0];
                  const reader = new FileReader();
                  reader.onload = (evt) => handleFileLoad(file.name, evt.target.result);
                  reader.readAsText(file);
                }
              }}
              onClick={() => document.getElementById('bulk-import-file-input').click()}
              style={{
                border: dragActive ? '2px dashed var(--color-primary)' : '2px dashed var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '2rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragActive ? 'rgba(17, 75, 78, 0.03)' : 'var(--color-panel)',
                transition: 'all 0.2s ease-in-out',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem'
              }}
            >
              <input 
                id="bulk-import-file-input"
                type="file" 
                accept=".csv,.json"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (evt) => handleFileLoad(file.name, evt.target.result);
                    reader.readAsText(file);
                  }
                }}
                style={{ display: 'none' }}
              />
              <Upload size={32} style={{ color: dragActive ? 'var(--color-primary)' : 'var(--color-secondary)' }} />
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  Drag and drop your CSV/JSON file here
                </p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  or click to browse files
                </p>
              </div>
            </div>

            {/* Preview Section */}
            {importPreviewList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* Summary Badges */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  <div className="card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', border: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Parsed</span>
                    <strong style={{ fontSize: '1.25rem' }}>{importPreviewList.length}</strong>
                  </div>
                  <div className="card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', border: '1px solid var(--color-success)', background: 'rgba(46, 125, 50, 0.02)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Valid</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--color-success)' }}>
                      {importPreviewList.filter(q => q.isValid).length}
                    </strong>
                  </div>
                  <div className="card" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', border: '1px solid var(--color-error)', background: 'rgba(211, 47, 47, 0.02)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Invalid</span>
                    <strong style={{ fontSize: '1.25rem', color: 'var(--color-error)' }}>
                      {importPreviewList.filter(q => !q.isValid).length}
                    </strong>
                  </div>
                </div>

                {/* Table */}
                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
                  <table style={{ width: '100%', fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '100px' }}>Status</th>
                        <th style={{ width: '150px' }}>Domain</th>
                        <th style={{ width: '80px' }}>Diff/Pts</th>
                        <th>Question Text</th>
                        <th>Choices</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreviewList.map((q, idx) => (
                        <tr key={idx} style={{ background: q.isValid ? 'transparent' : 'rgba(211, 47, 47, 0.04)' }}>
                          <td>
                            {q.isValid ? (
                              <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                <CheckCircle size={10} /> Valid
                              </span>
                            ) : (
                              <span 
                                className="badge badge-danger" 
                                title={q.errors.join(' ')} 
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', cursor: 'help' }}
                              >
                                <AlertCircle size={10} /> Invalid
                              </span>
                            )}
                          </td>
                          <td style={{ fontWeight: 600 }}>{q.domain}</td>
                          <td>{q.difficulty} ({q.points}p)</td>
                          <td>
                            <div>{q.question_text}</div>
                            {!q.isValid && (
                              <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: 500 }}>
                                Errors: {q.errors.join(' ')}
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                              {q.options.map(opt => (
                                <div key={opt.id} style={{ fontSize: '0.75rem', color: opt.isCorrect ? 'var(--color-success)' : 'var(--text-secondary)', fontWeight: opt.isCorrect ? 600 : 400 }}>
                                  • {opt.text} {opt.isCorrect && '✓'}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {importPreviewList.filter(q => !q.isValid).length > 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(237, 108, 2, 0.05)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(237, 108, 2, 0.2)' }}>
                    <AlertCircle size={16} style={{ color: 'var(--color-warning)' }} />
                    <span>Some questions have errors and will be skipped during importing. Please fix the file if you wish to import them all.</span>
                  </div>
                )}

              </div>
            )}

            {/* Footer Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem' }}>
              <button 
                type="button" 
                onClick={() => setShowImportModal(false)} 
                className="btn btn-accent btn-sm"
                disabled={importing}
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleConfirmImport} 
                className="btn btn-primary btn-sm"
                disabled={importing || importPreviewList.filter(q => q.isValid).length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                {importing ? (
                  <>
                    <RefreshCw className="animate-spin" size={14} />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Import {importPreviewList.filter(q => q.isValid).length} Valid Questions</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
