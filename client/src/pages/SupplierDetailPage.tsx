import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { Supplier, getIncotermColor } from '../types';
import SupplierMap from '../components/SupplierMap';
import { ArrowLeft, Mail, Phone, User, Building2, MapPin } from 'lucide-react';

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/suppliers/${id}`).then(r => {
      setSupplier(r.data);
      setLoading(false);
    }).catch(() => navigate('/suppliers'));
  }, [id]);

  if (loading || !supplier) {
    return <div className="flex-1 bg-gray-900 flex items-center justify-center text-gray-400">Loading...</div>;
  }

  const primaryContact = supplier.contacts?.find(c => c.type === 'primary');
  const secondaryContact = supplier.contacts?.find(c => c.type === 'secondary');
  const escalationContacts = supplier.contacts?.filter(c => c.type === 'escalation').sort((a, b) => (a.escalation_level || 0) - (b.escalation_level || 0));

  return (
    <div className="flex-1 bg-gray-900 overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        <button onClick={() => navigate('/suppliers')} className="flex items-center gap-1 text-gray-400 hover:text-white mb-4 text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to Suppliers
        </button>

        <div className="grid grid-cols-3 gap-6">
          {/* Main info */}
          <div className="col-span-2 space-y-4">
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white">{supplier.company_name}</h1>
                  <p className="text-gray-400 text-sm mt-1 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {supplier.street_address && `${supplier.street_address}, `}{supplier.city}, {supplier.country}
                  </p>
                  <p className="text-gray-500 text-xs mt-1 font-mono">{supplier.supplier_id}</p>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 rounded-full text-sm font-semibold text-white" style={{ background: getIncotermColor(supplier.default_incoterm) }}>
                    {supplier.default_incoterm || 'N/A'}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    supplier.status === 'active' ? 'bg-green-900/50 text-green-400 border border-green-800' :
                    supplier.status === 'on-hold' ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-800' :
                    'bg-red-900/50 text-red-400 border border-red-800'
                  }`}>
                    {supplier.status}
                  </span>
                </div>
              </div>

              {supplier.latitude && supplier.longitude && (
                <p className="text-xs text-gray-500 mt-2">GPS: {supplier.latitude.toFixed(4)}, {supplier.longitude.toFixed(4)}</p>
              )}
            </div>

            {/* Projects & Commodities */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Assigned Projects</h3>
                <div className="flex flex-wrap gap-2">
                  {supplier.projects?.map(p => (
                    <span key={p.id} className="px-3 py-1 bg-blue-900/30 text-blue-300 rounded-lg text-sm border border-blue-800/50">{p.name}</span>
                  ))}
                  {(!supplier.projects || supplier.projects.length === 0) && <span className="text-gray-500 text-sm">None</span>}
                </div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Commodities</h3>
                <div className="flex flex-wrap gap-2">
                  {supplier.commodities?.map(c => (
                    <span key={c.id} className="px-3 py-1 bg-purple-900/30 text-purple-300 rounded-lg text-sm border border-purple-800/50">{c.name}</span>
                  ))}
                  {(!supplier.commodities || supplier.commodities.length === 0) && <span className="text-gray-500 text-sm">None</span>}
                </div>
              </div>
            </div>

            {/* Contacts */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Contacts</h3>
              <div className="space-y-3">
                {[
                  { label: 'Primary Contact', contact: primaryContact },
                  { label: 'Secondary Contact', contact: secondaryContact },
                ].filter(c => c.contact).map(({ label, contact }) => (
                  <div key={label} className="flex items-start gap-3 bg-gray-700/30 rounded-lg p-3">
                    <User className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs text-gray-500 uppercase">{label}</div>
                      <div className="text-white font-medium text-sm">{contact!.name}</div>
                      {contact!.role_title && <div className="text-gray-400 text-xs">{contact!.role_title}</div>}
                      <div className="flex gap-4 mt-1 text-xs">
                        {contact!.email && <span className="flex items-center gap-1 text-gray-400"><Mail className="w-3 h-3" />{contact!.email}</span>}
                        {contact!.phone && <span className="flex items-center gap-1 text-gray-400"><Phone className="w-3 h-3" />{contact!.phone}</span>}
                      </div>
                    </div>
                  </div>
                ))}

                {escalationContacts && escalationContacts.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase mt-2 mb-2">Escalation Chain</div>
                    {escalationContacts.map((c, i) => (
                      <div key={i} className="flex items-start gap-3 bg-gray-700/30 rounded-lg p-3 mb-2">
                        <div className="w-5 h-5 bg-orange-600 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">{c.escalation_level}</div>
                        <div>
                          <div className="text-white font-medium text-sm">{c.name}</div>
                          {c.role_title && <div className="text-gray-400 text-xs">{c.role_title}</div>}
                          <div className="flex gap-4 mt-1 text-xs">
                            {c.email && <span className="flex items-center gap-1 text-gray-400"><Mail className="w-3 h-3" />{c.email}</span>}
                            {c.phone && <span className="flex items-center gap-1 text-gray-400"><Phone className="w-3 h-3" />{c.phone}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {supplier.notes && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Notes</h3>
                <p className="text-gray-300 text-sm whitespace-pre-wrap">{supplier.notes}</p>
              </div>
            )}

            {/* Routes */}
            {supplier.routes && supplier.routes.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Associated Routes</h3>
                <div className="space-y-2">
                  {supplier.routes.map(r => (
                    <div key={r.id} className="flex items-center gap-3 bg-gray-700/30 rounded-lg p-3">
                      <div className={`w-2 h-8 rounded-full ${r.route_type === 'inbound' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                      <div>
                        <div className="text-white text-sm font-medium">{r.name}</div>
                        <div className="text-gray-400 text-xs">{r.transport_mode} · {r.route_type} · {r.transit_days ? `${r.transit_days} days` : 'N/A'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column - Mini Map */}
          <div className="col-span-1">
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden sticky top-6">
              <div className="h-80">
                {supplier.latitude && supplier.longitude ? (
                  <SupplierMap suppliers={[supplier]} routes={supplier.routes || []} singleSupplier />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500 text-sm">No coordinates</div>
                )}
              </div>
              <div className="p-3 border-t border-gray-700">
                <div className="text-xs text-gray-400">Location</div>
                <div className="text-white text-sm font-medium">{supplier.city}, {supplier.country}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
