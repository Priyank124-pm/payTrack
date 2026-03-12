import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersAPI } from '../api';
import { Icon, Spinner, Modal } from '../components/UI';

export default function Login() {
  const { signIn } = useAuth();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  // First-run setup modal
  const [showSetup, setShowSetup] = useState(false);
  const [setup, setSetup]   = useState({ name:'', email:'', password:'' });
  const [setupErr, setSetupErr]   = useState('');
  const [setupOK,  setSetupOK]    = useState('');
  const [setupBusy,setSetupBusy] = useState(false);

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
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-control" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button className="btn btn-primary w-full" style={{ justifyContent:'center', marginTop:4, padding:'10px 16px', fontSize:14 }} disabled={loading}>
            {loading ? <Spinner /> : 'Sign In'}
          </button>
        </form>

        <button className="btn btn-ghost w-full" style={{ justifyContent:'center', marginTop:10, fontSize:12 }} onClick={() => setShowSetup(true)}>
          First time? Create Super Admin account
        </button>
      </div>

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
