import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import api from '../../utils/api';
import useAppStore from '../../store/appStore';
import toast from 'react-hot-toast';

export default function Login() {
  const navigate = useNavigate();
  const { setAuth, darkMode } = useAppStore();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email';
    if (!form.password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      setAuth({ user: res.data.user, token: res.data.token });
      toast.success(`Welcome back, ${res.data.user.name.split(' ')[0]}!`);
      navigate('/');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-950 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-brand-500/15 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-purple-500/15 rounded-full blur-[120px] pointer-events-none animate-pulse duration-3000" />

      <div className="relative z-10 w-full max-w-md space-y-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
            bg-gradient-to-br from-brand-500 to-purple-600 shadow-xl shadow-brand-500/20 mb-4 transition-all duration-300 hover:scale-105">
            <Zap size={32} className="text-white fill-white/10" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Welcome back</h1>
          <p className="mt-2 text-sm text-gray-400">Sign in to continue your preparation</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-gray-900/40 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-800/80 p-8 space-y-6"
        >
          {/* Email */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Email address
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="email"
                value={form.email}
                onChange={handleChange('email')}
                placeholder="name@company.com"
                className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm
                  bg-gray-950/40 text-white placeholder-gray-500
                  focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all duration-200
                  ${errors.email ? 'border-red-500 focus:ring-red-500/30' : 'border-gray-800/80 hover:border-gray-700'}`}
              />
            </div>
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange('password')}
                placeholder="••••••••"
                className={`w-full pl-10 pr-10 py-3 rounded-xl border text-sm
                  bg-gray-950/40 text-white placeholder-gray-500
                  focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all duration-200
                  ${errors.password ? 'border-red-500 focus:ring-red-500/30' : 'border-gray-800/80 hover:border-gray-700'}`}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl
              bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500
              disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold 
              transition-all duration-300 shadow-lg shadow-brand-500/15 active:scale-[0.98]"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Signing in...</>
            ) : (
              'Sign In'
            )}
          </button>

          <p className="text-center text-sm text-gray-400">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-semibold transition-colors">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
