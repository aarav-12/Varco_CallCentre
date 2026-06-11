import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import Badge from '../../components/UI/Badge';
import Modal from '../../components/UI/Modal';
import Spinner from '../../components/UI/Spinner';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [showReset, setShowReset] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'caller' });

  const load = async () => {
    try {
      const { data } = await api.get('/users');
      setUsers(data.users || []);
    } catch { toast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/users', form);
      toast.success('User created');
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'caller' });
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const updateUser = async (e) => {
    e.preventDefault();
    if (!showEdit) return;
    setSubmitting(true);
    try {
      await api.put(`/users/${showEdit.id}`, showEdit);
      toast.success('User updated');
      setShowEdit(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSubmitting(false); }
  };

  const resetPassword = async () => {
    if (!newPassword || newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    try {
      await api.post(`/users/${showReset.id}/reset-password`, { newPassword });
      toast.success('Password reset');
      setShowReset(null);
      setNewPassword('');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const toggleStatus = async (user) => {
    const action = user.is_active ? 'Disable' : 'Enable';
    if (!confirm(`${action} ${user.name}?`)) return;
    try {
      await api.patch(`/users/${user.id}/toggle-status`);
      toast.success(`User ${action.toLowerCase()}d`);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Team Management</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">+ Add User</button>
      </div>

      {loading ? <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div> : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                {['Name', 'Email', 'Role', 'Status', 'Created', 'Actions'].map(h => <th key={h} className="table-header">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.map(u => (
                <tr key={u.id}>
                  <td className="table-cell font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-400 text-sm font-semibold flex-shrink-0">
                        {u.name.charAt(0)}
                      </div>
                      {u.name}
                    </div>
                  </td>
                  <td className="table-cell text-gray-500 dark:text-gray-400">{u.email}</td>
                  <td className="table-cell"><Badge variant={u.role === 'manager' ? 'primary' : 'blue'}>{u.role}</Badge></td>
                  <td className="table-cell"><Badge variant={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Disabled'}</Badge></td>
                  <td className="table-cell text-gray-500 dark:text-gray-400 text-xs">{format(new Date(u.created_at), 'dd MMM yyyy')}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowEdit({ ...u })} className="text-xs text-primary-700 dark:text-primary-400 hover:underline">Edit</button>
                      <button onClick={() => setShowReset(u)} className="text-xs text-amber-600 dark:text-amber-400 hover:underline">Reset PW</button>
                      <button onClick={() => toggleStatus(u)} className={`text-xs hover:underline ${u.is_active ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {u.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New User"
        footer={<><button onClick={() => setShowCreate(false)} className="btn-secondary text-sm">Cancel</button><button form="create-user" type="submit" disabled={submitting} className="btn-primary text-sm">{submitting ? 'Creating...' : 'Create User'}</button></>}
      >
        <form id="create-user" onSubmit={createUser} className="space-y-4">
          <div><label className="label">Full Name *</label><input className="input-field" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="label">Email *</label><input type="email" className="input-field" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div><label className="label">Password *</label><input type="password" className="input-field" required minLength={6} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div>
            <label className="label">Role *</label>
            <select className="input-field" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="caller">Caller</option>
              <option value="manager">Manager</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* Edit User */}
      {showEdit && (
        <Modal isOpen={!!showEdit} onClose={() => setShowEdit(null)} title="Edit User"
          footer={<><button onClick={() => setShowEdit(null)} className="btn-secondary text-sm">Cancel</button><button form="edit-user" type="submit" disabled={submitting} className="btn-primary text-sm">Save Changes</button></>}
        >
          <form id="edit-user" onSubmit={updateUser} className="space-y-4">
            <div><label className="label">Full Name</label><input className="input-field" value={showEdit.name} onChange={e => setShowEdit(u => ({ ...u, name: e.target.value }))} /></div>
            <div><label className="label">Email</label><input type="email" className="input-field" value={showEdit.email} onChange={e => setShowEdit(u => ({ ...u, email: e.target.value }))} /></div>
            <div><label className="label">Role</label>
              <select className="input-field" value={showEdit.role} onChange={e => setShowEdit(u => ({ ...u, role: e.target.value }))}>
                <option value="caller">Caller</option>
                <option value="manager">Manager</option>
              </select>
            </div>
          </form>
        </Modal>
      )}

      {/* Reset Password */}
      {showReset && (
        <Modal isOpen={!!showReset} onClose={() => { setShowReset(null); setNewPassword(''); }} title={`Reset Password — ${showReset.name}`}
          footer={<><button onClick={() => { setShowReset(null); setNewPassword(''); }} className="btn-secondary text-sm">Cancel</button><button onClick={resetPassword} className="btn-primary text-sm">Reset Password</button></>}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Enter new password for <strong>{showReset.name}</strong>:</p>
            <input type="password" className="input-field" placeholder="Min 6 characters" minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
