import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/Dashboard';
import KnowledgeBase from './pages/KnowledgeBase';
import Resume from './pages/Resume';
import JobDescription from './pages/JobDescription';
import MockTest from './pages/MockTest';
import SkillGap from './pages/SkillGap';
import Roadmap from './pages/Roadmap';
import Readiness from './pages/Readiness';

export default function App() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Protected app routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="knowledge" element={<KnowledgeBase />} />
        <Route path="resume" element={<Resume />} />
        <Route path="jd" element={<JobDescription />} />
        <Route path="mock-test" element={<MockTest />} />
        <Route path="skill-gap" element={<SkillGap />} />
        <Route path="roadmap" element={<Roadmap />} />
        <Route path="readiness" element={<Readiness />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
