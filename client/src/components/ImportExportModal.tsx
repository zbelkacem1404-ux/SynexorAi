import React, { useState, useRef } from 'react';
import { X, Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../utils/api';

interface Props {
  onClose: () => void;
  onImportComplete?: () => void;
}

type Tab = 'export' | 'import';
type DataType = 'suppliers' | 'routes';

export default function ImportExportModal({ onClose, onImportComplete }: Props) {
  const [tab, setTab] = useState<Tab>('export');
  const [dataType, setDataType] = useState<DataType>('suppliers');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; errors?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      const endpoint = dataType === 'suppliers' ? '/suppliers/export/csv' : '/routes/export/csv';
      const response = await api.get(endpoint, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dataType}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setResult({ success: true, message: `${dataType} exported successfully` });
    } catch (err: any) {
      setResult({ success: false, message: err.response?.data?.error || 'Export failed' });
    }
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const endpoint = dataType === 'suppliers' ? '/suppliers/import/csv' : '/routes/import/csv';
      const res = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult({
        success: true,
        message: res.data.message,
        errors: res.data.errors?.length ? res.data.errors : undefined
      });
      onImportComplete?.();
    } catch (err: any) {
      setResult({ success: false, message: err.response?.data?.error || 'Import failed' });
    }
    setImporting(false);
  };

  const downloadTemplate = async () => {
    // Same file the Export button produces — edit rows in place and re-import.
    // suppliers: assigned_carriers / lanes / lane_count are derived from route assignments and are ignored on import.
    try {
      const endpoint = dataType === 'suppliers' ? '/suppliers/export/csv' : '/routes/export/csv';
      const response = await api.get(endpoint, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dataType}_template.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setResult({ success: false, message: err.response?.data?.error || 'Could not download template' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-600">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-600">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-brand-vibrant-pink" />
            <h2 className="text-lg font-bold text-white">Import / Export Data</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Tab switch */}
          <div className="flex bg-gray-700 rounded-lg p-0.5">
            {(['export', 'import'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setResult(null); }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === t ? 'bg-brand-vibrant-pink text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t === 'export' ? <Download className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Data type selector */}
          <div>
            <label className="text-xs text-gray-400 uppercase font-medium">Data Type</label>
            <div className="flex gap-2 mt-1">
              {(['suppliers', 'routes'] as DataType[]).map(dt => (
                <button
                  key={dt}
                  onClick={() => { setDataType(dt); setResult(null); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    dataType === dt ? 'bg-brand-vibrant-pink/20 border-brand-vibrant-pink text-brand-vibrant-pink border' : 'bg-gray-700 border-gray-600 text-gray-300 border hover:text-white'
                  }`}
                >
                  {dt.charAt(0).toUpperCase() + dt.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Export section */}
          {tab === 'export' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300">
                Download all {dataType} data as a CSV file (opens in Excel).
              </p>
              <button
                onClick={handleExport}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-vibrant-pink hover:bg-brand-deep-burgundy text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" /> Export {dataType}
              </button>
            </div>
          )}

          {/* Import section */}
          {tab === 'import' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300">
                Upload a CSV or Excel file to import {dataType}. Need the right format?{' '}
                <button onClick={downloadTemplate} className="text-brand-vibrant-pink hover:text-brand-deep-burgundy underline">
                  Download template
                </button>
              </p>

              <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-gray-500 transition-colors">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  id="file-upload"
                  onChange={() => setResult(null)}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-300">Click to select a CSV or Excel file</p>
                  <p className="text-xs text-gray-400 mt-1">{fileRef.current?.files?.[0]?.name || 'No file selected'}</p>
                </label>
              </div>

              {dataType === 'routes' && (
                <div className="bg-gray-700 rounded-lg p-3 text-xs text-gray-300">
                  <p className="font-medium text-white mb-1">Route CSV format:</p>
                  <p><span className="text-brand-vibrant-pink">waypoints</span>: lat,lng,label separated by <code className="bg-gray-800 px-1 rounded">;</code></p>
                  <p><span className="text-brand-vibrant-pink">suppliers</span>: supplier IDs (e.g. SUP-0001) separated by <code className="bg-gray-800 px-1 rounded">;</code></p>
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={importing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-muted-blue hover:bg-brand-muted-blue/80 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Upload className="w-4 h-4" /> {importing ? 'Importing...' : `Import ${dataType}`}
              </button>
            </div>
          )}

          {/* Result message */}
          {result && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
              result.success ? 'bg-status-compliant/20 text-status-compliant' : 'bg-status-deviation/20 text-status-deviation'
            }`}>
              {result.success ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              <div>
                <p>{result.message}</p>
                {result.errors && result.errors.length > 0 && (
                  <ul className="mt-1 text-xs text-status-warning space-y-0.5">
                    {result.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
                    {result.errors.length > 5 && <li>...and {result.errors.length - 5} more</li>}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
