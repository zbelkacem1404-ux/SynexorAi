import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { Supplier, TransportRoute, Contact, getIncotermColor } from '../types';
import { useAuth } from '../contexts/AuthContext';
import SupplierForm from '../components/SupplierForm';
import { Plus, Search, Download, Upload, Edit, Trash2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MapPin, Phone, Mail, User, Truck, Package, FolderOpen, AlertTriangle } from 'lucide-react';

export default function SuppliersPage() {
  const { isAdmin } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('company_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/suppliers', {
        params: { search, page, limit: 25, sortBy, sortDir }
      });
      setSuppliers(data.suppliers);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [search, page, sortBy, sortDir]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    await api.delete(`/suppliers/${id}`);
    fetchSuppliers();
  };

  const handleExport = async () => {
    try {
      const { data } = await api.get('/suppliers/export/csv', { responseType: 'blob' });
      const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'suppliers_database.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Make sure the server is running.');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await api.post('/suppliers/import/csv', formData);
      alert(`Imported ${data.imported} suppliers`);
      fetchSuppliers();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Import failed');
    }
    e.target.value = '';
  };

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const SortArrow = ({ col }: { col: string }) => {
    if (sortBy !== col) return <span className="text-gray-600 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'road': return '🚛';
      case 'rail': return '🚂';
      case 'sea': return '🚢';
      case 'air': return '✈️';
      case 'multimodal': return '🔄';
      default: return '📦';
    }
  };

  const getShipmentBadge = (type?: string) => {
    switch (type) {
      case 'ftl': return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400">FTL</span>;
      case 'ltl': return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400">LTL</span>;
      case 'milkrun': return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400">Milkrun</span>;
      default: return null;
    }
  };

  // Extract unique carriers from routes for a supplier
  const getCarriers = (routes?: TransportRoute[]) => {
    if (!routes?.length) return [];
    return [...new Set(routes.filter(r => r.carrier_name).map(r => r.carrier_name!))];
  };

  // Get escalation contacts sorted by level
  const getEscalationContacts = (contacts?: Contact[]) => {
    if (!contacts?.length) return [];
    return contacts
      .filter(c => c.type === 'escalation')
      .sort((a, b) => (a.escalation_level || 0) - (b.escalation_level || 0));
  };

  const getPrimaryContact = (contacts?: Contact[]) => {
    return contacts?.find(c => c.type === 'primary');
  };

  return (
    <div className="flex-1 bg-dark px-4 py-4 overflow-auto">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Supplier Database</h1>
            <p className="text-sm text-gray-400">{total} suppliers total</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            {isAdmin && (
              <>
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                  <Upload className="w-4 h-4" /> Import CSV
                </button>
                <button onClick={() => { setEditSupplier(null); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-brand-vibrant-pink hover:bg-brand-deep-burgundy text-white rounded-lg text-sm font-medium">
                  <Plus className="w-4 h-4" /> Add Supplier
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search suppliers by name, ID, country, or city..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none"
          />
        </div>

        {/* Table */}
        <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="px-3 py-3 w-8"></th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('supplier_id')}>
                    ID <SortArrow col="supplier_id" />
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('company_name')}>
                    Company <SortArrow col="company_name" />
                  </th>
                  <th className="px-3 py-3">Address</th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('default_incoterm')}>
                    Incoterm <SortArrow col="default_incoterm" />
                  </th>
                  <th className="px-3 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('status')}>
                    Status <SortArrow col="status" />
                  </th>
                  <th className="px-3 py-3">Contact</th>
                  <th className="px-3 py-3">Carrier</th>
                  <th className="px-3 py-3">Commodity</th>
                  <th className="px-3 py-3">Projects</th>
                  {isAdmin && <th className="px-3 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                ) : suppliers.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400">No suppliers found</td></tr>
                ) : suppliers.map(s => {
                  const expanded = expandedIds.has(s.id);
                  const primaryContact = getPrimaryContact(s.contacts);
                  const carriers = getCarriers(s.routes);
                  const escalationContacts = getEscalationContacts(s.contacts);

                  return (
                    <React.Fragment key={s.id}>
                      {/* Main row */}
                      <tr className={`border-b border-gray-600 hover:bg-gray-700 transition-colors cursor-pointer ${expanded ? 'bg-gray-700' : ''}`}
                          onClick={() => toggleExpand(s.id)}>
                        <td className="px-3 py-3 text-gray-400">
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </td>
                        <td className="px-3 py-3 text-gray-400 font-mono text-xs">{s.supplier_id}</td>
                        <td className="px-3 py-3">
                          <Link to={`/suppliers/${s.id}`} className="text-brand-vibrant-pink hover:text-brand-deep-burgundy font-medium"
                                onClick={e => e.stopPropagation()}>
                            {s.company_name}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-gray-300 text-xs">
                          <div className="flex items-start gap-1">
                            <MapPin className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                              {s.street_address && <div className="text-gray-300">{s.street_address}</div>}
                              <div className="text-gray-400">{s.city}, {s.country}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {s.default_incoterm && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: getIncotermColor(s.default_incoterm) }}>
                              {s.default_incoterm}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.status === 'active' ? 'bg-status-compliant/20 text-status-compliant' :
                            s.status === 'on-hold' ? 'bg-status-warning/20 text-status-warning' :
                            'bg-status-deviation/20 text-status-deviation'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {primaryContact ? (
                            <div className="text-gray-300 truncate max-w-[120px]" title={primaryContact.name}>
                              {primaryContact.name}
                            </div>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {carriers.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {carriers.slice(0, 2).map(c => (
                                <span key={c} className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 truncate max-w-[80px]" title={c}>{c}</span>
                              ))}
                              {carriers.length > 2 && <span className="text-gray-400">+{carriers.length - 2}</span>}
                            </div>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div className="flex flex-wrap gap-1">
                            {s.commodities?.slice(0, 2).map(c => (
                              <span key={c.id} className="px-1.5 py-0.5 bg-status-warning/20 text-status-warning rounded truncate max-w-[80px]" title={c.name}>{c.name}</span>
                            ))}
                            {(s.commodities?.length || 0) > 2 && <span className="text-gray-400">+{(s.commodities?.length || 0) - 2}</span>}
                            {!s.commodities?.length && <span className="text-gray-500">—</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {s.projects?.slice(0, 2).map(p => (
                              <span key={p.id} className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-300">{p.name}</span>
                            ))}
                            {(s.projects?.length || 0) > 2 && <span className="text-xs text-gray-400">+{(s.projects?.length || 0) - 2}</span>}
                            {!s.projects?.length && <span className="text-xs text-gray-500">—</span>}
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setEditSupplier(s); setShowForm(true); }}
                                className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDelete(s.id)}
                                className="p-1.5 hover:bg-red-900 rounded text-gray-400 hover:text-red-400">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {/* Expanded detail row */}
                      {expanded && (
                        <tr className="bg-gray-700 border-b border-gray-600">
                          <td colSpan={isAdmin ? 11 : 10} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                              {/* Contacts Section */}
                              <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <User className="w-3.5 h-3.5" /> Contacts
                                </h4>
                                {s.contacts && s.contacts.length > 0 ? (
                                  <div className="space-y-2">
                                    {s.contacts.filter(c => c.type === 'primary' || c.type === 'secondary').map((c, i) => (
                                      <div key={i} className="text-xs">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            c.type === 'primary' ? 'bg-brand-vibrant-pink/20 text-brand-vibrant-pink' : 'bg-gray-700 text-gray-300'
                                          }`}>{c.type}</span>
                                          <span className="text-white font-medium">{c.name}</span>
                                        </div>
                                        {c.role_title && <div className="text-gray-400 mt-0.5 ml-1">{c.role_title}</div>}
                                        <div className="flex items-center gap-3 mt-1 ml-1">
                                          {c.email && (
                                            <span className="flex items-center gap-1 text-gray-300">
                                              <Mail className="w-3 h-3" /> {c.email}
                                            </span>
                                          )}
                                          {c.phone && (
                                            <span className="flex items-center gap-1 text-gray-300">
                                              <Phone className="w-3 h-3" /> {c.phone}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}

                                    {/* Escalation chain */}
                                    {escalationContacts.length > 0 && (
                                      <div className="border-t border-gray-600 pt-2 mt-2">
                                        <div className="text-[10px] text-status-warning font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                          <AlertTriangle className="w-3 h-3" /> Escalation Chain
                                        </div>
                                        {escalationContacts.map((c, i) => (
                                          <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                                            <span className="w-5 h-5 rounded-full bg-status-warning/20 text-status-warning text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                              L{c.escalation_level || i + 1}
                                            </span>
                                            <div>
                                              <span className="text-gray-300">{c.name}</span>
                                              {c.role_title && <span className="text-gray-400 ml-1">({c.role_title})</span>}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-400 italic">No contacts</div>
                                )}
                              </div>

                              {/* Lanes & Carriers Section */}
                              <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <Truck className="w-3.5 h-3.5" /> Lanes & Carriers
                                </h4>
                                {s.routes && s.routes.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {s.routes.map((r: TransportRoute) => (
                                      <div key={r.id} className="flex items-center gap-2 text-xs bg-gray-700 rounded px-2 py-1.5">
                                        <span className="text-base leading-none" title={r.transport_mode}>{getModeIcon(r.transport_mode)}</span>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-white font-medium truncate">{r.name}</span>
                                            {getShipmentBadge(r.shipment_type)}
                                          </div>
                                          <div className="flex items-center gap-2 mt-0.5">
                                            {r.carrier_name && (
                                              <span className="text-gray-300">{r.carrier_name}</span>
                                            )}
                                            {r.transit_days && (
                                              <span className="text-gray-400">{r.transit_days}d transit</span>
                                            )}
                                          </div>
                                        </div>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                          r.route_type === 'inbound' ? 'bg-status-compliant/20 text-status-compliant' : 'bg-brand-muted-blue/20 text-brand-muted-blue'
                                        }`}>{r.route_type}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-400 italic">No assigned lanes</div>
                                )}
                              </div>

                              {/* Commodities & Projects Section */}
                              <div className="bg-gray-800 rounded-lg p-3 border border-gray-600">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <Package className="w-3.5 h-3.5" /> Commodities
                                </h4>
                                {s.commodities && s.commodities.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 mb-3">
                                    {s.commodities.map(c => (
                                      <span key={c.id} className="px-2 py-1 bg-status-warning/20 text-status-warning rounded-lg text-xs font-medium border border-status-warning/30">
                                        {c.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-400 italic mb-3">No commodities</div>
                                )}

                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <FolderOpen className="w-3.5 h-3.5" /> Projects
                                </h4>
                                {s.projects && s.projects.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {s.projects.map(p => (
                                      <span key={p.id} className="px-2 py-1 bg-brand-muted-blue/20 text-brand-muted-blue rounded-lg text-xs font-medium border border-brand-muted-blue/30">
                                        {p.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-400 italic">No projects</div>
                                )}

                                {/* Notes */}
                                {s.notes && (
                                  <div className="mt-3 pt-2 border-t border-gray-600">
                                    <div className="text-[10px] text-gray-400 uppercase font-medium mb-1">Notes</div>
                                    <div className="text-xs text-gray-300">{s.notes}</div>
                                  </div>
                                )}
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-600">
            <span className="text-xs text-gray-400">
              Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-300">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-300 px-2">Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-300">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <SupplierForm
          supplier={editSupplier}
          onSave={() => { setShowForm(false); fetchSuppliers(); }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
