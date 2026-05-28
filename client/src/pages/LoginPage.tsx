import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-600">
        <div className="text-center mb-8">
          <svg width="110" height="79" viewBox="0 0 100 72" className="mx-auto mb-4" aria-hidden="true">
            <path d="M 2,8 L 56,8 L 70,18 L 56,28 L 2,28 Z" fill="#FFFFFF"/>
            <path d="M 98,44 L 44,44 L 30,54 L 44,64 L 98,64 Z" fill="#FFFFFF"/>
            <circle cx="52" cy="36" r="6.5" fill="#E8366D"/>
          </svg>
          <p className="text-white text-2xl font-bold font-primary">Synexor<span className="text-brand-vibrant-pink">AI</span></p>
          <p className="text-gray-400 mt-1">AI-Powered Supply Chain TMS</p>
        </div>
        {error && (
          <div className="bg-red-900 border border-red-600 text-red-300 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-vibrant-pink"
              placeholder="Enter username"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-vibrant-pink"
              placeholder="Enter password"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-brand-vibrant-pink hover:bg-brand-deep-burgundy disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="mt-6 text-center text-xs text-gray-400">
          Demo: admin/admin123 or viewer/viewer123
        </div>
      </div>
    </div>
  );
}
