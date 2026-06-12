import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Papa from 'papaparse';
import api from '../../services/api';
import Badge, { statusBadge } from '../../components/UI/Badge';
import Spinner from '../../components/UI/Spinner';
import Modal from '../../components/UI/Modal';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

const STATUSES = ['not_contacted','no_answer','busy','interested','follow_up_required','order_confirmed','not_interested','invalid_number'];
const SOURCES = ['Website','Facebook','Google Ads','Referral','Cold Call','Instagram','Email Campaign','Other'];

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [pagination, setPagination] = useState({});
  const [callers, setCallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [reassignTo, setReassignTo] = useState('');
  const [filters, setFilters] = useState({ page: 1, limit: 20, search: '', status: '', assignedTo: '', source: '' });
  const [form, setForm] = useState({ name: '', phone_number: '', source: '', notes: '', assigned_to: '', assignment_type: 'manual' });
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null); // { headers, rows, nameCol, phoneCol }

  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const s = searchParams.get('search');
    if (s) setFilters(f => ({ ...f, search: s }));
  }, []);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      const { data } = await api.get(`/leads?${params}`);
      setLeads(data.data || []);
      setPagination(data.pagination || {});
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    if (isManager) {
      api.get('/users/callers').then(({ data }) => setCallers(data.callers || [])).catch(() => {});
    }
  }, [isManager]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/leads', form);
      toast.success('Lead created');
      setShowCreate(false);
      setForm({ name: '', phone_number: '', source: '', notes: '', assigned_to: '', assignment_type: 'manual' });
      loadLeads();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFile(file);
    setImportPreview(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const rows = results.data.slice(0, 5);
        const nameCol = headers.find(h => /name/i.test(h)) || headers[0] || '';
        const phoneCol = headers.find(h => /phone|mobile|number|contact/i.test(h)) || headers[1] || '';
        setImportPreview({ headers, rows, nameCol, phoneCol, allRows: results.data });
      },
      error: () => toast.error('Could not parse CSV file'),
    });
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!importPreview) return toast.error('Select a CSV file first');
    const { nameCol, phoneCol, allRows } = importPreview;
    if (!nameCol || !phoneCol) return toast.error('Map the Name and Phone columns');
    setSubmitting(true);
    try {
      const leads = allRows
        .map(r => ({ name: r[nameCol], phone_number: r[phoneCol] }))
        .filter(r => r.name && r.phone_number);
      if (!leads.length) return toast.error('No valid rows found in file');
      const { data } = await api.post('/leads/import-json', { leads });
      toast.success(`Imported ${data.imported} leads${data.failed ? `, ${data.failed} skipped` : ''}`);
      setShowImport(false);
      setImportFile(null);
      setImportPreview(null);
      loadLeads();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} leads?`)) return;
    try {
      await api.delete('/leads/bulk', { data: { ids: selected } });
      toast.success(`${selected.length} leads deleted`);
      setSelected([]);
      loadLeads();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const handleBulkReassign = async () => {
    if (!reassignTo) return toast.error('Select a caller');
    try {
      await api.post('/leads/bulk-reassign', { ids: selected, assignedTo: reassignTo });
      toast.success(`${selected.length} leads reassigned`);
      setSelected([]);
      setShowReassign(false);
      loadLeads();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reassign failed');
    }
  };

  const handleExport = async (format) => {
    try {
      const params = new URLSearchParams({ format });
      const { data } = await api.get(`/leads/export?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    }
  };

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const selectAll = () => setSelected(selected.length === leads.length ? [] : leads.map(l => l.id));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Leads</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isManager && (
            <>
              <button onClick={() => setShowImport(true)} className="btn-secondary text-sm">Import CSV</button>
              <div className="relative group">
                <button className="btn-secondary text-sm">Export ▾</button>
                <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-10 w-32">
                  <button onClick={() => handleExport('csv')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">CSV</button>
                  <button onClick={() => handleExport('xlsx')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">Excel</button>
                </div>
              </div>
              <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">+ New Lead</button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Search name or phone..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
            className="input-field w-48 flex-1"
          />
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))} className="input-field w-auto">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          {isManager && (
            <select value={filters.assignedTo} onChange={e => setFilters(f => ({ ...f, assignedTo: e.target.value, page: 1 }))} className="input-field w-auto">
              <option value="">All Callers</option>
              {callers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value, page: 1 }))} className="input-field w-auto">
            <option value="">All Sources</option>
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.length > 0 && isManager && (
        <div className="flex items-center gap-3 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
          <span className="text-sm font-medium text-primary-700 dark:text-primary-400">{selected.length} selected</span>
          <button onClick={() => setShowReassign(true)} className="btn-secondary text-sm">Reassign</button>
          <button onClick={handleBulkDelete} className="btn-danger text-sm">Delete</button>
          <button onClick={() => setSelected([])} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {isManager && (
                    <th className="table-header w-10">
                      <input type="checkbox" checked={selected.length === leads.length && leads.length > 0} onChange={selectAll} className="rounded" />
                    </th>
                  )}
                  {['Name', 'Phone', 'Source', isManager ? 'Assigned To' : null, 'Status', 'Call Date', 'Follow-Up', 'Order Value', ''].filter(Boolean).map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {leads.map(lead => {
                  const sb = statusBadge(lead.status);
                  return (
                    <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                      {isManager && (
                        <td className="table-cell w-10" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.includes(lead.id)} onChange={() => toggleSelect(lead.id)} className="rounded" />
                        </td>
                      )}
                      <td className="table-cell font-medium" onClick={() => navigate(`/leads/${lead.id}`)}>{lead.name}</td>
                      <td className="table-cell text-gray-500 dark:text-gray-400" onClick={() => navigate(`/leads/${lead.id}`)}>{lead.phone_number}</td>
                      <td className="table-cell text-gray-500 dark:text-gray-400" onClick={() => navigate(`/leads/${lead.id}`)}>{lead.source || '—'}</td>
                      {isManager && <td className="table-cell text-gray-600 dark:text-gray-300" onClick={() => navigate(`/leads/${lead.id}`)}>{lead.assigned_to_name || '—'}</td>}
                      <td className="table-cell" onClick={() => navigate(`/leads/${lead.id}`)}>
                        <Badge variant={sb.variant}>{sb.label}</Badge>
                      </td>
                      <td className="table-cell text-gray-500 dark:text-gray-400 text-xs" onClick={() => navigate(`/leads/${lead.id}`)}>
                        {lead.call_date ? format(new Date(lead.call_date), 'dd MMM') : '—'}
                      </td>
                      <td className="table-cell text-xs" onClick={() => navigate(`/leads/${lead.id}`)}>
                        {lead.follow_up_date ? (
                          <span className={new Date(lead.follow_up_date) < new Date() ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}>
                            {format(new Date(lead.follow_up_date), 'dd MMM')}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="table-cell text-green-600 dark:text-green-400 font-medium" onClick={() => navigate(`/leads/${lead.id}`)}>
                        {lead.order_value > 0 ? `₹${parseFloat(lead.order_value).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="table-cell">
                        <button onClick={() => navigate(`/leads/${lead.id}`)} className="text-primary-700 dark:text-primary-400 hover:underline text-sm">View</button>
                      </td>
                    </tr>
                  );
                })}
                {!leads.length && (
                  <tr><td colSpan={10} className="py-16 text-center text-gray-400">No leads found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {((filters.page - 1) * filters.limit) + 1}–{Math.min(filters.page * filters.limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button disabled={!pagination.hasPrev} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))} className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40">←</button>
              <span className="text-sm px-2 text-gray-700 dark:text-gray-300">{filters.page}/{pagination.totalPages}</span>
              <button disabled={!pagination.hasNext} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))} className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40">→</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Lead Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New Lead" size="md"
        footer={
          <>
            <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm">Cancel</button>
            <button form="create-lead-form" type="submit" disabled={submitting} className="btn-primary text-sm flex items-center gap-2">
              {submitting && <Spinner size="sm" />} Create Lead
            </button>
          </>
        }
      >
        <form id="create-lead-form" onSubmit={handleCreate} className="space-y-4">
          <div><label className="label">Name *</label><input className="input-field" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Lead name" /></div>
          <div><label className="label">Phone Number *</label><input className="input-field" required value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} placeholder="9XXXXXXXXX" /></div>
          <div><label className="label">Source</label>
            <select className="input-field" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
              <option value="">Select source</option>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assignment</label>
            <select className="input-field" value={form.assignment_type} onChange={e => setForm(f => ({ ...f, assignment_type: e.target.value, assigned_to: '' }))}>
              <option value="round_robin">Auto (Round Robin)</option>
              <option value="manual">Manual Assignment</option>
            </select>
          </div>
          {form.assignment_type === 'manual' && (
            <div><label className="label">Assign To</label>
              <select className="input-field" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                <option value="">Select caller</option>
                {callers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div><label className="label">Notes</label><textarea className="input-field" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any initial notes..." /></div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={showImport} onClose={() => { setShowImport(false); setImportFile(null); setImportPreview(null); }} title="Import Leads from CSV" size="lg"
        footer={
          <>
            <button onClick={() => { setShowImport(false); setImportFile(null); setImportPreview(null); }} className="btn-secondary text-sm">Cancel</button>
            <button form="import-form" type="submit" disabled={submitting || !importPreview} className="btn-primary text-sm">
              {submitting ? 'Importing...' : `Import${importPreview ? ` ${importPreview.allRows.length} leads` : ''}`}
            </button>
          </>
        }
      >
        <form id="import-form" onSubmit={handleImport} className="space-y-4">
          <div>
            <label className="label">Select CSV File</label>
            <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} className="input-field" />
          </div>

          {importPreview && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Name column</label>
                  <select className="input-field" value={importPreview.nameCol}
                    onChange={e => setImportPreview(p => ({ ...p, nameCol: e.target.value }))}>
                    {importPreview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Phone column</label>
                  <select className="input-field" value={importPreview.phoneCol}
                    onChange={e => setImportPreview(p => ({ ...p, phoneCol: e.target.value }))}>
                    {importPreview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <p className="label mb-1">Preview (first 5 rows)</p>
                <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Name</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Phone</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {importPreview.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{r[importPreview.nameCol] || '—'}</td>
                          <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{r[importPreview.phoneCol] || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{importPreview.allRows.length} total rows found</p>
              </div>
            </>
          )}
        </form>
      </Modal>

      {/* Bulk Reassign Modal */}
      <Modal isOpen={showReassign} onClose={() => setShowReassign(false)} title={`Reassign ${selected.length} Leads`}
        footer={
          <>
            <button onClick={() => setShowReassign(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleBulkReassign} className="btn-primary text-sm">Reassign</button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">Reassign {selected.length} selected leads to:</p>
          <select className="input-field" value={reassignTo} onChange={e => setReassignTo(e.target.value)}>
            <option value="">Select caller</option>
            {callers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </Modal>
    </div>
  );
}
