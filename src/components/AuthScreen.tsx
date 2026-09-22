import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fn = mode === 'signin' ? signIn : signUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(error);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: 'var(--accent-light)' }}
          >
            <FileText size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            Noted
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'signin' ? 'Sign in to sync your notes' : 'Create an account'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
            }}
          />

          {error && (
            <p className="text-sm px-1" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl py-3 text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Toggle mode */}
        <button
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
          className="w-full text-center text-sm mt-4 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
