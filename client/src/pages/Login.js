import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersAPI, authAPI } from '../api';
import { Icon, Spinner, Modal } from '../components/UI';

// ── Reset Password Form (shown when ?reset_token= is in URL) ──
function ResetPasswordForm({ token, onDone }) {
  const [pw,  setPw]  = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    if (pw.length < 6)   return setError('Password must be at least 6 characters.');
    if (pw !== pw2)       return setError('Passwords do not match.');
    setLoading(true);
    try {
      await authAPI.resetPassword(token, pw);
      setSuccess('Password reset! Redirecting to sign in…');
      setTimeout(onDone, 2000);
    } catch (err) {
      setError(err.message || 'Invalid or expired reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:28, justifyContent:'center' }}>
          <div style={{ width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,#4F46E5,#7C3AED)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:800, fontSize:22 }}>N</div>
          <div>
            <div style={{ fontSize:22, fontWeight:800, color:'var(--text)', letterSpacing:'-.5px' }}>NexPortal</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:1 }}>Project Management Suite</div>
          </div>
        </div>

        <div style={{ fontSize:17, fontWeight:700, marginBottom:3 }}>Set New Password</div>
        <div style={{ fontSize:13, color:'var(--text3)', marginBottom:22 }}>Enter your new password below</div>

        {error   && <div className="alert alert-error"  style={{ marginBottom:14 }}><Icon name="warning" size={14}/>{error}</div>}
        {success && <div className="alert alert-success" style={{ marginBottom:14 }}><Icon name="check" size={14}/>{success}</div>}

        {!success && (
          <form onSubmit={handleReset}>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input
                className="form-control"
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="Min 6 characters"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input
                className="form-control"
                type="password"
                value={pw2}
                onChange={e => setPw2(e.target.value)}
                placeholder="Repeat new password"
                required
              />
              {pw2 && pw !== pw2 && (
                <div className="form-error">Passwords do not match</div>
              )}
              {pw2 && pw === pw2 && pw2.length > 0 && (
                <div style={{ fontSize:11, color:'var(--success)', marginTop:3, fontWeight:500 }}>✓ Passwords match</div>
              )}
            </div>
            <button
              className="btn btn-primary w-full"
              style={{ justifyContent:'center', marginTop:4, padding:'10px 16px', fontSize:14 }}
              disabled={loading}
            >
              {loading ? <Spinner /> : 'Reset Password'}
            </button>
          </form>
        )}

        <button
          className="btn btn-ghost w-full"
          style={{ justifyContent:'center', marginTop:10, fontSize:12 }}
          onClick={onDone}
        >
          ← Back to Sign In
        </button>
      </div>
    </div>
  );
}

// ── Forgot Password Modal ─────────────────────────────────────
function ForgotPasswordModal({ onClose }) {
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [sent,    setSent]    = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email) return setError('Please enter your email address.');
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Forgot Password"
      onClose={onClose}
      small
      footer={
        sent ? (
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? <Spinner /> : <><Icon name="send" size={13}/>Send Reset Link</>}
            </button>
          </>
        )
      }
    >
      {sent ? (
        <div style={{ textAlign:'center', padding:'8px 0' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📧</div>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:8 }}>Check your inbox</div>
          <div style={{ fontSize:13, color:'var(--text3)', lineHeight:1.6 }}>
            If <strong>{email}</strong> is registered, you'll receive a password reset link within a few minutes.
          </div>
          <div style={{ fontSize:12, color:'var(--text4)', marginTop:10 }}>The link expires in 1 hour.</div>
        </div>
      ) : (
        <>
          {error && <div className="alert alert-error" style={{ marginBottom:14 }}><Icon name="warning" size={13}/>{error}</div>}
          <div style={{ fontSize:13, color:'var(--text3)', marginBottom:16, lineHeight:1.6 }}>
            Enter the email address associated with your account and we'll send you a link to reset your password.
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label className="form-label">Email address</label>
              <input
                className="form-control"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoFocus
                required
              />
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}

// ── Main Login Page ───────────────────────────────────────────
export default function Login() {
  const { signIn } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  // First-run setup
  const [showSetup, setShowSetup] = useState(false);
  const [setup,     setSetup]     = useState({ name:'', email:'', password:'' });
  const [setupErr,  setSetupErr]  = useState('');
  const [setupOK,   setSetupOK]   = useState('');
  const [setupBusy, setSetupBusy] = useState(false);

  // Check for reset token in URL
  const [resetToken, setResetToken] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('reset_token');
    if (t) setResetToken(t);
  }, []);

  const clearResetToken = () => {
    setResetToken('');
    window.history.replaceState({}, '', window.location.pathname);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try { await signIn(email, password); }
    catch (err) { setError(err.message || 'Invalid credentials'); }
    finally { setLoading(false); }
  };

  const handleSetup = async () => {
    if (!setup.name || !setup.email || !setup.password) return setSetupErr('All fields required');
    setSetupErr(''); setSetupBusy(true);
    try {
      await usersAPI.seedAdmin(setup);
      setSetupOK('Super Admin created! You can now sign in.');
      setEmail(setup.email);
      setTimeout(() => setShowSetup(false), 2000);
    } catch (e) { setSetupErr(e.message); }
    finally { setSetupBusy(false); }
  };

  // Show reset password form if token is present in URL
  if (resetToken) {
    return <ResetPasswordForm token={resetToken} onDone={clearResetToken} />;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:28, justifyContent:'center' }}>
          <div style={{ width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,#4F46E5,#7C3AED)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:800, fontSize:22 }}>N</div>
          <div>
            <div style={{ fontSize:22, fontWeight:800, color:'var(--text)', letterSpacing:'-.5px' }}>NexPortal</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:1 }}>Project Management Suite</div>
          </div>
        </div>

        <div style={{ fontSize:17, fontWeight:700, marginBottom:3 }}>Sign in</div>
        <div style={{ fontSize:13, color:'var(--text3)', marginBottom:22 }}>Enter your credentials to continue</div>

        {error && <div className="alert alert-error"><Icon name="warning" size={14} />{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input className="form-control" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
          </div>
          <div className="form-group" style={{ marginBottom:6 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
              <label className="form-label" style={{ marginBottom:0 }}>Password</label>
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                style={{ background:'none', border:'none', color:'var(--primary)', fontSize:12, cursor:'pointer', fontWeight:500, padding:0 }}
              >
                Forgot password?
              </button>
            </div>
            <input className="form-control" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button className="btn btn-primary w-full" style={{ justifyContent:'center', marginTop:10, padding:'10px 16px', fontSize:14 }} disabled={loading}>
            {loading ? <Spinner /> : 'Sign In'}
          </button>
        </form>

        <button className="btn btn-ghost w-full" style={{ justifyContent:'center', marginTop:10, fontSize:12 }} onClick={() => setShowSetup(true)}>
          First time? Create Super Admin account
        </button>
      </div>

      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}

      {showSetup && (
        <Modal title="First-Time Setup" onClose={() => setShowSetup(false)} small
          footer={<>
            <button className="btn btn-ghost" onClick={() => setShowSetup(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSetup} disabled={setupBusy}>{setupBusy ? <Spinner /> : 'Create Admin'}</button>
          </>}>
          <div className="info-box mb-4" style={{ marginBottom:14 }}><Icon name="info" size={13} />This can only be done once — when no users exist yet.</div>
          {setupErr && <div className="alert alert-error">{setupErr}</div>}
          {setupOK  && <div className="alert alert-success"><Icon name="check" size={13} />{setupOK}</div>}
          <div className="form-group"><label className="form-label">Full Name</label><input className="form-control" value={setup.name} onChange={e=>setSetup(p=>({...p,name:e.target.value}))} placeholder="Admin Name" /></div>
          <div className="form-group"><label className="form-label">Email</label><input className="form-control" type="email" value={setup.email} onChange={e=>setSetup(p=>({...p,email:e.target.value}))} placeholder="admin@company.com" /></div>
          <div className="form-group"><label className="form-label">Password</label><input className="form-control" type="password" value={setup.password} onChange={e=>setSetup(p=>({...p,password:e.target.value}))} placeholder="Min 6 characters" /></div>
        </Modal>
      )}
    </div>
  );
}
