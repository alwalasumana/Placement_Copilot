import { NavLink, useNavigate } from 'react-router-dom';
import {
  Brain, BookOpen, FileText, Briefcase,
  ClipboardList, TrendingUp, Map, Award,
  Sun, Moon, ChevronRight, Zap, LogOut, User,
} from 'lucide-react';
import useAppStore from '../../store/appStore';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { to: '/',             icon: Brain,         label: 'Dashboard',       badge: null },
  { to: '/knowledge',    icon: BookOpen,      label: 'Knowledge Base',  badge: null },
  { to: '/resume',       icon: FileText,      label: 'Resume',          badge: null },
  { to: '/jd',           icon: Briefcase,     label: 'Job Description', badge: null },
  { to: '/mock-test',    icon: ClipboardList, label: 'Mock Test',       badge: 'New' },
  { to: '/skill-gap',    icon: TrendingUp,    label: 'Skill Gap',       badge: null },
  { to: '/roadmap',      icon: Map,           label: 'Roadmap',         badge: null },
  { to: '/readiness',    icon: Award,         label: 'Readiness',       badge: null },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode, analysisComplete, user, resetAll } = useAppStore();

  const handleLogout = () => {
    resetAll();
    toast.success('Signed out successfully');
    navigate('/login');
  };

  // Avatar initials
  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-64 flex flex-col
      bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
      shadow-xl">

      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200 dark:border-gray-800">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700
          flex items-center justify-center shadow-lg shadow-brand-500/30">
          <Zap size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
            Placement
          </h1>
          <p className="text-xs text-brand-500 font-medium leading-tight">Copilot AI</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
               transition-all duration-150
               ${isActive
                 ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                 : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
               }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={isActive ? 'text-brand-500' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'} />
                <span className="flex-1">{label}</span>
                {badge && (
                  <span className="text-xs bg-brand-100 dark:bg-brand-900/50 text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded-md font-medium">
                    {badge}
                  </span>
                )}
                {isActive && <ChevronRight size={14} className="text-brand-400" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Analysis status indicator */}
      {analysisComplete && (
        <div className="mx-3 mb-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-700 dark:text-green-400">
              Analysis Complete
            </span>
          </div>
        </div>
      )}

      {/* Bottom section */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl
            bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
            text-gray-600 dark:text-gray-400 text-sm font-medium transition-colors"
        >
          <span>{darkMode ? 'Dark Mode' : 'Light Mode'}</span>
          {darkMode ? <Moon size={16} /> : <Sun size={16} />}
        </button>

        {/* User info + logout */}
        <div className="flex items-center gap-2 px-2 py-2">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40
            flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-brand-600 dark:text-brand-400">
              {initials}
            </span>
          </div>

          {/* Name + email */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
              {user?.name || 'User'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
              {user?.email || ''}
            </p>
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50
              dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
