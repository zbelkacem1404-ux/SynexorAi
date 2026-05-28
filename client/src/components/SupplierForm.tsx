import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { Supplier, Contact, Project, Commodity } from '../types';
import { X, Plus, Trash2 } from 'lucide-react';

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];

interface Props {
  supplier?: Supplier | null;
  onSave: () => void;
  onClose: () => void;
}

export default function SupplierForm({ supplier, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    company_name: '',
    country: '',
    city: '',
    street_address: '',
    latitude: '',
    longitude: '',
    default_incoterm: '',
    status: 'active',
    notes: '',
  });
  const [contacts, setContacts] = useState<Partial<Contact>[]>([
    { type: 'primary', name: '', role_title: '', email: '', phone: '' },
  ]);
  const [projectIds, setProjectIds] = useState<number[]>([]);
  const [commodityIds, setCommodityIds] = useState<number[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/meta/projects').then(r => setProjects(r.data));
    api.get('/meta/commodities').then(r => setCommodities(r.data));
  }, []);

  useEffect(() => {
    if (supplier) {
      setForm({
        company_name: supplier.company_name,
        country: supplier.country,
        city: supplier.city,
        street_address: supplier.street_address || '',
        latitude: supplier.latitude?.toString() || '',
        longitude: supplier.longitude?.toString() || '',
        default_incoterm: supplier.default_incoterm || '',
        status: supplier.status,
        notes: supplier.notes || '',
      });
      if (supplier.contacts?.length) setContacts(supplier.contacts);
      if (supplier.projects?.length) setProjectIds(supplier.projects.map(p => p.id));
      if (supplier.commodities?.length) setCommodityIds(supplier.commodities.map(c => c.id));
    }
  }, [supplier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        ...form,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        contacts: contacts.filter(c => c.name),
        project_ids: projectIds,
        commodity_ids: commodityIds,
      };
      if (supplier) {
        await api.put(`/suppliers/${supplier.id}`, body);
      } else {
        await api.post('/suppliers', body);
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
    }
    setSaving(false);
  };

  const addContact = (type: Contact['type']) => {
    setContacts([...contacts, { type, escalation_level: type === 'escalation' ? (contacts.filter(c => c.type === 'escalation').length + 1) : undefined, name: '', role_title: '', email: '', phone: '' }]);
  };

  const removeContact = (idx: number) => {
    setContacts(contacts.filter((_, i) => i !== idx));
  };

  const updateContact = (idx: number, field: string, value: string) => {
    const updated = [...contacts];
    (updated[idx] as any)[field] = value;
    setContacts(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-600">
          <h2 className="text-lg font-bold text-white">{supplier ? 'Edit Supplier' : 'Add New Supplier'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {error && <div className="mx-4 mt-4 bg-red-900 border border-red-600 text-red-300 px-4 py-2 rounded">{error}</div>}

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-400">Company Name *</label>
              <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none" required />
            </div>
            <div>
              <label className="text-xs text-gray-400">Country *</label>
              <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none" required />
            </div>
            <div>
              <label className="text-xs text-gray-400">City *</label>
              <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none" required />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-400">Street Address</label>
              <input value={form.street_address} onChange={e => setForm({ ...form, street_address: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Latitude</label>
              <input type="number" step="any" value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Longitude</label>
              <input type="number" step="any" value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Default Incoterm</label>
              <select value={form.default_incoterm} onChange={e => setForm({ ...form, default_incoterm: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none">
                <option value="">Select...</option>
                {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on-hold">On Hold</option>
              </select>
            </div>
          </div>

          {/* Projects & Commodities */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">Projects</label>
              <div className="mt-1 space-y-1 max-h-28 overflow-y-auto">
                {projects.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-gray-300">
                    <input type="checkbox" checked={projectIds.includes(p.id)}
                      onChange={() => setProjectIds(projectIds.includes(p.id) ? projectIds.filter(id => id !== p.id) : [...projectIds, p.id])}
                      className="rounded bg-gray-800 border-gray-600 text-brand-vibrant-pink focus:ring-brand-vibrant-pink" />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400">Commodities</label>
              <div className="mt-1 space-y-1 max-h-28 overflow-y-auto">
                {commodities.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-gray-300">
                    <input type="checkbox" checked={commodityIds.includes(c.id)}
                      onChange={() => setCommodityIds(commodityIds.includes(c.id) ? commodityIds.filter(id => id !== c.id) : [...commodityIds, c.id])}
                      className="rounded bg-gray-800 border-gray-600 text-brand-vibrant-pink focus:ring-brand-vibrant-pink" />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-gray-400">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
              className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none" />
          </div>

          {/* Contacts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-400 uppercase font-medium">Contacts</label>
              <div className="flex gap-1">
                <button type="button" onClick={() => addContact('primary')} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded flex items-center gap-1"><Plus className="w-3 h-3" /> Primary</button>
                <button type="button" onClick={() => addContact('secondary')} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded flex items-center gap-1"><Plus className="w-3 h-3" /> Secondary</button>
                <button type="button" onClick={() => addContact('escalation')} className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded flex items-center gap-1"><Plus className="w-3 h-3" /> Escalation</button>
              </div>
            </div>
            <div className="space-y-2">
              {contacts.map((c, idx) => (
                <div key={idx} className="bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-brand-vibrant-pink uppercase">
                      {c.type}{c.type === 'escalation' ? ` (Level ${c.escalation_level || idx})` : ''}
                    </span>
                    <button type="button" onClick={() => removeContact(idx)} className="text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Name" value={c.name || ''} onChange={e => updateContact(idx, 'name', e.target.value)}
                      className="px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none" />
                    <input placeholder="Role / Title" value={c.role_title || ''} onChange={e => updateContact(idx, 'role_title', e.target.value)}
                      className="px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none" />
                    <input placeholder="Email" value={c.email || ''} onChange={e => updateContact(idx, 'email', e.target.value)}
                      className="px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none" />
                    <input placeholder="Phone" value={c.phone || ''} onChange={e => updateContact(idx, 'phone', e.target.value)}
                      className="px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm focus:ring-2 focus:ring-brand-vibrant-pink focus:outline-none" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-600">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-vibrant-pink hover:bg-brand-deep-burgundy disabled:bg-gray-600 text-white rounded-lg text-sm font-medium">
              {saving ? 'Saving...' : (supplier ? 'Update Supplier' : 'Create Supplier')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
