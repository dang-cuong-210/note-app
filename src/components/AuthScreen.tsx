import { useRef, useState } from 'react';
import { ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { TanookiBrand } from '@/components/TanookiBrand';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const login = mode === 'signin';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    setNotice(null);
    if (!login && password !== confirmation) {
      setError('Mật khẩu xác nhận chưa khớp. Vui lòng kiểm tra lại.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const result = await (login ? signIn : signUp)(email.trim(), password);
      if (result.error) {
        setError(result.error === 'Invalid login credentials'
          ? 'Email hoặc mật khẩu không đúng.'
          : 'Không thể hoàn tất yêu cầu. Vui lòng kiểm tra thông tin và thử lại.');
      } else if (!login) {
        setNotice('Đã gửi yêu cầu đăng ký. Nếu cần xác nhận email, hãy kiểm tra hộp thư của bạn.');
      }
    } catch {
      setError('Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="tanooki-auth">
      <section className="tanooki-auth-brand" aria-label="Tanooki">
        <TanookiBrand />
        <p className="tanooki-tagline">Ghi chú cho chính mình,<br />một cuộc sống nhẹ nhàng hơn.</p>
        <div className="tanooki-art-slot" aria-label="Vị trí tranh minh họa mùa thu">
          <span>Tranh minh họa mùa thu — đang chờ tài nguyên chính thức</span>
        </div>
      </section>
      <section className="tanooki-auth-panel" aria-labelledby="auth-heading">
        <div className="tanooki-auth-card tanooki-card">
          <div className="tanooki-mobile-brand"><TanookiBrand /></div>
          <header className="tanooki-auth-heading">
            <h1 id="auth-heading">{login ? 'Chào mừng trở lại' : 'Tạo tài khoản'}</h1>
            <p>{login ? 'Tiếp tục hành trình ghi chú của bạn cùng Tanooki nhé!' : 'Bắt đầu hành trình cùng Tanooki.'}</p>
          </header>
          <form onSubmit={handleSubmit} aria-busy={busy} className="tanooki-auth-form">
            <label className="tanooki-field">
              <span className="sr-only">Email</span><Mail size={20} aria-hidden="true" />
              <input type="email" autoComplete="email" inputMode="email" placeholder="Email" required
                value={email} onChange={e => setEmail(e.target.value)} disabled={busy} />
            </label>
            <label className="tanooki-field">
              <span className="sr-only">Mật khẩu</span><LockKeyhole size={20} aria-hidden="true" />
              <input aria-label="Mật khẩu" ref={passwordRef} type={visible ? 'text' : 'password'} autoComplete={login ? 'current-password' : 'new-password'}
                placeholder="Mật khẩu" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} />
              <button type="button" className="tanooki-icon-button" disabled={busy}
                aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible}
                onMouseDown={e => { if (document.activeElement === passwordRef.current) e.preventDefault(); }}
                onClick={() => setVisible(value => !value)}>
                {visible ? <Eye size={20} aria-hidden="true" /> : <EyeOff size={20} aria-hidden="true" />}
              </button>
            </label>
            {!login && <label className="tanooki-field">
              <span className="sr-only">Xác nhận mật khẩu</span><LockKeyhole size={20} aria-hidden="true" />
              <input type={visible ? 'text' : 'password'} autoComplete="new-password" placeholder="Xác nhận mật khẩu"
                required minLength={6} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy} />
            </label>}
            {login && <div className="tanooki-session-note"><Check size={18} aria-hidden="true" /><span>Ghi nhớ đăng nhập <small>— tự động trên thiết bị này</small></span></div>}
            {error && <p className="tanooki-auth-error" role="alert">{error}</p>}
            {notice && <p className="tanooki-auth-notice" role="status">{notice}</p>}
            <button type="submit" className="tanooki-button-primary" disabled={busy}>
              {busy ? <><Loader2 size={20} className="animate-spin" aria-hidden="true" />Đang xử lý…</>
                : <>{login ? 'Đăng nhập' : 'Đăng ký'}<ArrowRight size={20} aria-hidden="true" /></>}
            </button>
          </form>
          {login && <>
            <div className="tanooki-divider"><span>Cần trợ giúp?</span></div>
            <aside className="tanooki-auth-help">
              <LockKeyhole size={26} aria-hidden="true" />
              <div><h2>Quên mật khẩu?</h2><p>Đặt lại mật khẩu chưa được hỗ trợ trong phiên bản này.</p></div>
            </aside>
          </>}
          <footer className="tanooki-auth-footer">
            <span>{login ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}</span>{' '}
            <button type="button" className="tanooki-button-ghost" disabled={busy} onClick={() => {
              setMode(login ? 'signup' : 'signin'); setError(null); setNotice(null);
              setPassword(''); setConfirmation(''); setVisible(false);
            }}>{login ? 'Đăng ký' : 'Đăng nhập'}</button>
          </footer>
        </div>
      </section>
    </main>
  );
}
