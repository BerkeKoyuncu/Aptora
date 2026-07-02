import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Users, Plus, Edit, Trash2, Shield, Key, RefreshCw, XCircle } from 'lucide-react';

export default function UserManagement({ user: currentUser, addToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);

  // Editor states
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('add'); // 'add', 'edit'
  const [editingId, setEditingId] = useState(null);

  // Form states
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('standard');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.getUsers();
      setUsers(res);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleOpenAdd = () => {
    setModalType('add');
    setEditingId(null);
    setUsername('');
    setEmail('');
    setPassword('');
    setRole('standard');
    setShowModal(true);
  };

  const handleOpenEdit = (u) => {
    setModalType('edit');
    setEditingId(u.id);
    setUsername(u.username);
    setEmail(u.email);
    setPassword(''); // Reset password input
    setRole(u.role);
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!username.trim() || !email.trim()) {
      addToast('Username and Email are required', 'warning');
      return;
    }

    if (modalType === 'add' && !password) {
      addToast('Password is required for new accounts', 'warning');
      return;
    }

    const payload = {
      username,
      email,
      role,
      ...(password ? { password } : {})
    };

    try {
      if (modalType === 'add') {
        await api.createUser(payload);
        addToast(`Account for ${username} created.`);
      } else {
        await api.updateUser(editingId, payload);
        addToast(`Account for ${username} updated.`);
      }
      setShowModal(false);
      fetchUsers();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (userToDelete) => {
    if (userToDelete.id === currentUser.id) {
      addToast('You cannot delete your own admin account!', 'error');
      return;
    }
    if (!confirm(`Are you sure you want to delete user "${userToDelete.username}"?`)) return;
    try {
      await api.deleteUser(userToDelete.id);
      addToast('User deleted successfully.');
      setSelectedIds(prev => prev.filter(id => id !== userToDelete.id));
      fetchUsers();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleBulkDelete = async () => {
    // Cannot delete own account
    const safeIds = selectedIds.filter(id => id !== currentUser.id);
    if (safeIds.length === 0) {
      addToast('No eligible users selected for deletion.', 'warning');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the ${safeIds.length} selected users? This action is permanent.`)) {
      return;
    }
    try {
      await api.bulkDeleteUsers(safeIds);
      addToast(`${safeIds.length} users deleted successfully.`);
      setSelectedIds([]);
      fetchUsers();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  return (
    <>
      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>User Administration</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Manage accounts, passwords, and Role-Based Access Control (RBAC) privileges.</p>
        </div>
        <button onClick={handleOpenAdd} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} />
          <span>Add User Account</span>
        </button>
      </div>

      {selectedIds.length > 0 && (
        <div className="card animate-fade" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-danger)' }}>
            {selectedIds.length} users selected
          </span>
          <button onClick={handleBulkDelete} className="btn btn-danger btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Trash2 size={14} />
            <span>Delete Selected</span>
          </button>
        </div>
      )}

      {/* Users table */}
      <div className="table-container">
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={users.length > 1 && users.filter(u => u.id !== currentUser.id).every(u => selectedIds.includes(u.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const deletableIds = users.filter(u => u.id !== currentUser.id).map(u => u.id);
                      setSelectedIds(prev => Array.from(new Set([...prev, ...deletableIds])));
                    } else {
                      const deletableIds = users.filter(u => u.id !== currentUser.id).map(u => u.id);
                      setSelectedIds(prev => prev.filter(id => !deletableIds.includes(id)));
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{ width: '80px' }}>ID</th>
              <th>Username</th>
              <th>Email Address</th>
              <th>Access Role</th>
              <th>2FA Enforced</th>
              <th>Created Date</th>
              <th style={{ width: '120px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ textAlign: 'center' }}>
                  <input 
                    type="checkbox" 
                    disabled={u.id === currentUser.id}
                    checked={selectedIds.includes(u.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(prev => [...prev, u.id]);
                      } else {
                        setSelectedIds(prev => prev.filter(x => x !== u.id));
                      }
                    }}
                    style={{ cursor: u.id === currentUser.id ? 'not-allowed' : 'pointer' }}
                  />
                </td>
                <td style={{ fontWeight: 600 }}>#{u.id}</td>
                <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{u.username}</td>
                <td>{u.email}</td>
                <td>
                  <span className={`badge ${u.role === 'admin' ? 'badge-danger' : 'badge-accent'}`}>
                    {u.role}
                  </span>
                </td>
                <td>
                  <span className={`badge ${u.twofa_enabled ? 'badge-success' : 'badge-primary'}`}>
                    {u.twofa_enabled ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => handleOpenEdit(u)} className="btn btn-accent btn-sm" style={{ padding: '0.35rem' }}>
                      <Edit size={14} />
                    </button>
                    <button 
                      onClick={() => handleDelete(u)} 
                      className="btn btn-danger btn-sm" 
                      disabled={u.id === currentUser.id}
                      style={{ padding: '0.35rem' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* Editor Modal */}
    {showModal && (
      <div className="modal-overlay">
        <div className="modal-content animate-fade" style={{ maxWidth: '450px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={20} style={{ color: 'var(--color-primary)' }} />
              <h3 style={{ margin: 0 }}>
                {modalType === 'add' ? 'Create User Account' : 'Edit User Profile'}
              </h3>
            </div>
            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <XCircle size={20} />
            </button>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label>Username</label>
              <input 
                type="text" 
                placeholder="e.g. jdoe" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                required 
              />
            </div>

            <div>
              <label>Email Address</label>
              <input 
                type="email" 
                placeholder="jdoe@company.com" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required 
              />
            </div>

            <div>
              <label>
                {modalType === 'add' ? 'Account Password' : 'Reset Password (Leave blank to keep current)'}
              </label>
              <input 
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required={modalType === 'add'} 
              />
            </div>

            <div>
              <label>RBAC Security Role</label>
              <select value={role} onChange={e => setRole(e.target.value)} required>
                <option value="standard">Standard User (Tests & Grade Viewing)</option>
                <option value="admin">Administrator (Full SOC Rights)</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--color-border)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-accent btn-sm">Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm">
                {modalType === 'add' ? 'Create Account' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </>
  );
}
