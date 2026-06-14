import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import useAppStore from '../../store/appStore';

export default function Layout() {
  const darkMode = useAppStore((s) => s.darkMode);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <Sidebar />
        <main className="ml-64 min-h-screen">
          <div className="max-w-7xl mx-auto p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
