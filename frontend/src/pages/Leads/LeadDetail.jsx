import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Badge, { statusBadge } from '../../components/UI/Badge';
import Modal from '../../components/UI/Modal';
import Spinner from '../../components/UI/Spinner';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

const STATUSES = ['not_contacted','no_answer','busy','interested','follow_up_required','order_confirmed','not_interested','invalid_number'];

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [fuForm, setFuForm] = useState({ scheduled_date: '', scheduled_time: '', notes: '' });
  const [callForm, setCallForm] = useState({ duration: '', outcome: '', recording_link: '', notes: '' });
  const [editStatus, setEditStatus] = useState('');
  const [editOrderValue, setEditOrderValue] = useState('');
  const [callers, setCallers] = useState([]);
  const [reassignTo, setReassignTo] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get(`/leads/${id}`);
      setData(data);
      setEditStatus(data.lead.status);
      setEditOrderValue(data.lead.order_value || '');
    } catch {
      toast.error('Lead not found');
      navigate('/leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (isManager) {
      api.get('/users/callers').then(r => setCallers(r.data.callers || [])).catch(() => {});
    }
  }, [isManager]);

  const updateField = async (fields) => {
    setUpdating(true);
    try {
      await api.put(`/leads/${id}`, fields);
      toast.success('Updated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    try {
      await api.post(`/leads/${id}/notes`, { note: noteText });
      toast.success('Note added');
      setNoteText('');
      setShowNote(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const addFollowUp = async (e) => {
    e.preventDefault();
    try {
      await api.post('/follow-ups', { lead_id: id, ...fuForm });
      toast.success('Follow-up scheduled');
      setShowFollowUp(false);
      setFuForm({ scheduled_date: '', scheduled_time: '', notes: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const logCall = async (e) => {
    e.preventDefault();
    try {
      await api.post('/calls', { lead_id: id, ...callForm, duration: parseInt(callForm.duration) || 0 });
      toast.success('Call logged');
      setShowCall(false);
      setCallForm({ duration: '', outcome: '', recording_link: '', notes: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleReassign = async () => {
    if (!reassignTo) return toast.error('Select a caller');
    await updateField({ assigned_to: reassignTo });
    setReassignTo('');
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  if (!data) return null;

  const { lead, notes, followUps, callHistory, assignments } = data;
  const sb = statusBadge(lead.status);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button onClick={() => navigate('/leads')} className="text-sm text-gray-500 dark:text-gray-400 hover:text-primary-700 dark:hover:text-primary-400 mb-2 flex items-center gap-1">
            ← Back to Leads
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{lead.name}</h1>
            <Badge variant={sb.variant}>{sb.label}</Badge>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{lead.phone_number} · Created {format(new Date(lead.created_at), 'dd MMM yyyy')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowNote(true)} className="btn-secondary text-sm">Add Note</button>
          <button onClick={() => setShowFollowUp(true)} className="btn-secondary text-sm">Schedule Follow-Up</button>
          <button onClick={() => setShowCall(true)} className="btn-primary text-sm">Log Call</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Lead Info */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-5">
            <h2 className="section-title mb-4">Lead Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Source</p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{lead.source || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Assigned To</p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{lead.assigned_to_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Call Date</p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {lead.call_date ? format(new Date(lead.call_date), 'dd MMM yyyy') : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Call Duration</p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {lead.call_duration ? `${Math.floor(lead.call_duration / 60)}m ${lead.call_duration % 60}s` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Follow-Up Date</p>
                <p className={`text-sm font-medium ${lead.follow_up_date && new Date(lead.follow_up_date) < new Date() ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>
                  {lead.follow_up_date ? format(new Date(lead.follow_up_date), 'dd MMM yyyy') : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Order Value</p>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                  {lead.order_value > 0 ? `₹${parseFloat(lead.order_value).toLocaleString('en-IN')}` : '—'}
                </p>
              </div>
            </div>

            {lead.recording_link && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Recording</p>
                <a href={lead.recording_link} target="_blank" rel="noreferrer" className="text-sm text-primary-700 dark:text-primary-400 hover:underline">
                  {lead.recording_link}
                </a>
              </div>
            )}

            {lead.notes && (
              <div className="mt-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notes</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">{lead.notes}</p>
              </div>
            )}
          </div>

          {/* Update Status */}
          <div className="card p-5">
            <h2 className="section-title mb-4">Update Status</h2>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => {
                const b = statusBadge(s);
                return (
                  <button
                    key={s}
                    onClick={() => updateField({ status: s })}
                    disabled={updating}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      lead.status === s
                        ? 'ring-2 ring-primary-500 border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700'
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
            {lead.status === 'order_confirmed' && (
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1">
                  <label className="label">Order Value (₹)</label>
                  <input type="number" className="input-field" value={editOrderValue} onChange={e => setEditOrderValue(e.target.value)} />
                </div>
                <button onClick={() => updateField({ order_value: parseFloat(editOrderValue) || 0 })} className="btn-primary text-sm mt-5">Save</button>
              </div>
            )}
          </div>

          {/* Call History */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="section-title">Call History</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {callHistory.map(call => (
                <div key={call.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {format(new Date(call.call_date), 'dd MMM yyyy')} at {call.call_time?.slice(0, 5)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {call.caller_name} · {call.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : 'Not connected'}
                    </p>
                    {call.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{call.notes}</p>}
                  </div>
                  <Badge variant={call.outcome === 'order_confirmed' ? 'green' : call.duration > 0 ? 'blue' : 'gray'}>
                    {call.outcome ? call.outcome.replace(/_/g, ' ') : 'No answer'}
                  </Badge>
                </div>
              ))}
              {!callHistory.length && <p className="text-center text-gray-400 py-8 text-sm">No calls logged</p>}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Reassign (manager only) */}
          {isManager && (
            <div className="card p-4">
              <h2 className="section-title mb-3">Reassign Lead</h2>
              <select className="input-field mb-3" value={reassignTo} onChange={e => setReassignTo(e.target.value)}>
                <option value="">Select caller</option>
                {callers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={handleReassign} disabled={!reassignTo} className="btn-primary text-sm w-full disabled:opacity-50">Reassign</button>
            </div>
          )}

          {/* Follow-Ups */}
          <div className="card p-4">
            <h2 className="section-title mb-3">Follow-Ups</h2>
            <div className="space-y-2">
              {followUps.map(fu => (
                <div key={fu.id} className={`p-3 rounded-lg border text-sm ${
                  fu.category === 'red' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' :
                  fu.category === 'amber' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' :
                  'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                } ${fu.is_completed ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{format(new Date(fu.scheduled_date), 'dd MMM yyyy')}</span>
                    {fu.is_completed ? <Badge variant="green">Done</Badge> : <Badge variant={fu.category}>{fu.category}</Badge>}
                  </div>
                  {fu.notes && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{fu.notes}</p>}
                </div>
              ))}
              {!followUps.length && <p className="text-sm text-gray-400 text-center py-4">No follow-ups</p>}
            </div>
          </div>

          {/* Notes */}
          <div className="card p-4">
            <h2 className="section-title mb-3">Notes</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notes.map(n => (
                <div key={n.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{n.note}</p>
                  <p className="text-xs text-gray-400 mt-1">{n.user_name} · {format(new Date(n.created_at), 'dd MMM, HH:mm')}</p>
                </div>
              ))}
              {!notes.length && <p className="text-sm text-gray-400 text-center py-4">No notes added</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Add Note Modal */}
      <Modal isOpen={showNote} onClose={() => setShowNote(false)} title="Add Note"
        footer={<><button onClick={() => setShowNote(false)} className="btn-secondary text-sm">Cancel</button><button form="note-form" type="submit" className="btn-primary text-sm">Add Note</button></>}
      >
        <form id="note-form" onSubmit={addNote}>
          <textarea className="input-field" rows={4} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Write your note here..." required />
        </form>
      </Modal>

      {/* Follow-Up Modal */}
      <Modal isOpen={showFollowUp} onClose={() => setShowFollowUp(false)} title="Schedule Follow-Up"
        footer={<><button onClick={() => setShowFollowUp(false)} className="btn-secondary text-sm">Cancel</button><button form="fu-form" type="submit" className="btn-primary text-sm">Schedule</button></>}
      >
        <form id="fu-form" onSubmit={addFollowUp} className="space-y-4">
          <div><label className="label">Date *</label><input type="date" className="input-field" required value={fuForm.scheduled_date} onChange={e => setFuForm(f => ({ ...f, scheduled_date: e.target.value }))} /></div>
          <div><label className="label">Time</label><input type="time" className="input-field" value={fuForm.scheduled_time} onChange={e => setFuForm(f => ({ ...f, scheduled_time: e.target.value }))} /></div>
          <div><label className="label">Notes</label><textarea className="input-field" rows={2} value={fuForm.notes} onChange={e => setFuForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </form>
      </Modal>

      {/* Log Call Modal */}
      <Modal isOpen={showCall} onClose={() => setShowCall(false)} title="Log Call"
        footer={<><button onClick={() => setShowCall(false)} className="btn-secondary text-sm">Cancel</button><button form="call-form" type="submit" className="btn-primary text-sm">Log Call</button></>}
      >
        <form id="call-form" onSubmit={logCall} className="space-y-4">
          <div><label className="label">Duration (seconds)</label><input type="number" className="input-field" min="0" value={callForm.duration} onChange={e => setCallForm(f => ({ ...f, duration: e.target.value }))} placeholder="Duration in seconds (0 if not connected)" /></div>
          <div><label className="label">Outcome</label>
            <select className="input-field" value={callForm.outcome} onChange={e => setCallForm(f => ({ ...f, outcome: e.target.value }))}>
              <option value="">Select outcome</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div><label className="label">Recording Link</label><input type="url" className="input-field" value={callForm.recording_link} onChange={e => setCallForm(f => ({ ...f, recording_link: e.target.value }))} placeholder="https://..." /></div>
          <div><label className="label">Notes</label><textarea className="input-field" rows={2} value={callForm.notes} onChange={e => setCallForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </form>
      </Modal>
    </div>
  );
}
