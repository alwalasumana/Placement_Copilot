import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, BookOpen, FileText, Briefcase,
  Play, TrendingUp, Map, Award, ChevronRight, Zap, AlertTriangle
} from 'lucide-react';
import { Card, StatCard, CardBody, CardHeader } from '../components/ui/Card';
import ProgressBar from '../components/ui/ProgressBar';
import Button from '../components/ui/Button';
import { AgentProgress } from '../components/ui/LoadingSpinner';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import useAppStore from '../store/appStore';
import api from '../utils/api';
import toast from 'react-hot-toast';
import ConfirmationModal from '../components/ui/ConfirmationModal';

export default function Dashboard() {
  const navigate = useNavigate();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const {
    analysisRunning, analysisComplete, analysisError,
    hasResume, hasJD,
    readinessData, skillGapData, roadmapData,
    setAnalysisRunning, setAnalysisComplete, setAnalysisError,
    resetTargetPrep,
  } = useAppStore();

  const [uploadedCount, setUploadedCount] = useState(0);
  const [completedAgents, setCompletedAgents] = useState([]);

  useEffect(() => {
    api.get('/upload').then(r => {
      const files = r.data.files || [];
      setUploadedCount(files.filter(f => f.fileType === 'knowledge').length);
    }).catch(() => {});

    if (analysisComplete) {
      api.get('/analysis/results').then(r => {
        const d = r.data.data;
        if (d.skillGap) useAppStore.getState().setSkillGapData(d.skillGap);
        if (d.readiness) useAppStore.getState().setReadinessData(d.readiness);
      }).catch(() => {});
    }
  }, [analysisComplete]);

  const runAnalysis = async () => {
    setAnalysisRunning(true);
    setCompletedAgents([]);

    // Poll /api/analysis/status every 2s to get real agent completion data
    const pollInterval = setInterval(async () => {
      try {
        const statusRes = await api.get('/analysis/status');
        if (statusRes.data.completedAgents?.length) {
          setCompletedAgents(statusRes.data.completedAgents);
        }
      } catch {
        // polling errors are non-fatal — main request still running
      }
    }, 2000);

    try {
      const res = await api.post('/analysis/run');
      const data = res.data;
      clearInterval(pollInterval);
      if (data.success) {
        const allAgents = ['knowledge', 'resume', 'jd', 'mocktest', 'skillgap', 'roadmap', 'readiness'];
        setCompletedAgents(allAgents);
        setAnalysisComplete(data.results);
        toast.success('Analysis complete! All agents finished successfully.');
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (err) {
      clearInterval(pollInterval);
      setCompletedAgents([]);
      setAnalysisError(err.message);
      toast.error(err.message);
    }
  };

  const resetTargetCompany = () => {
    setIsResetModalOpen(true);
  };

  const handleResetConfirm = async () => {
    try {
      const res = await api.post('/analysis/reset');
      if (res.data.success) {
        toast.success('All preparation data, resume, and results have been reset!');
        resetTargetPrep();
        navigate('/');
        window.location.reload();
      } else {
        throw new Error(res.data.error || 'Reset failed');
      }
    } catch (err) {
      toast.error(err.message || 'Reset failed');
    }
  };

  const readiness = readinessData?.compositeReadiness || 0;
  const readinessTier = readinessData?.readinessTier || '';
  const skillMatch = skillGapData?.overallMatchScore || 0;

  const missingSkillsList = [];
  if (skillGapData) {
    if (Array.isArray(skillGapData.criticalGaps) && skillGapData.criticalGaps.length > 0) {
      skillGapData.criticalGaps.forEach(s => {
        missingSkillsList.push({
          skill: s.skill,
          priority: s.severity || 'critical'
        });
      });
    }
    if (Array.isArray(skillGapData.moderateGaps) && skillGapData.moderateGaps.length > 0) {
      skillGapData.moderateGaps.forEach(s => {
        missingSkillsList.push({
          skill: s.skill,
          priority: s.severity || 'medium'
        });
      });
    }
    if (missingSkillsList.length === 0 && Array.isArray(skillGapData.missingSkills)) {
      skillGapData.missingSkills.forEach(skill => {
        missingSkillsList.push({
          skill: skill,
          priority: 'high'
        });
      });
    }
  }

  const radarData = readinessData ? [
    { subject: 'Resume', value: readinessData.scores?.resume || 0 },
    { subject: 'JD Match', value: readinessData.scores?.criticalSkills || 0 },
    { subject: 'Skills', value: readinessData.scores?.skillMatch || 0 },
    { subject: 'Company', value: readinessData.scores?.kb || 0 },
  ] : [];

  // Map DB tier names → UI colour (same tiers the readiness agent writes to MongoDB)
  const readinessColor =
    readinessTier === 'interview_ready' ? 'green' :
    readinessTier === 'near_ready'      ? 'green' :
    readinessTier === 'developing'      ? 'yellow' :
    readinessTier === 'early_stage'     ? 'red' :
    readinessTier === 'needs_foundation'? 'red' :
    readiness >= 65 ? 'green' : readiness >= 45 ? 'yellow' : 'red';

  const QUICK_ACTIONS = [
    { label: 'Upload Materials', icon: BookOpen, to: '/knowledge', done: uploadedCount > 0 },
    { label: 'Upload Resume', icon: FileText, to: '/resume', done: hasResume },
    { label: 'Upload JD', icon: Briefcase, to: '/jd', done: hasJD },
    { label: 'View Roadmap', icon: Map, to: '/roadmap', done: !!roadmapData },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Placement Copilot
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          AI-powered placement preparation — grounded entirely in your uploaded materials
        </p>
      </div>

      {/* Warning if not ready */}
      {(!uploadedCount || !hasResume || !hasJD) && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl">
          <AlertTriangle size={18} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-700 dark:text-yellow-300">
            <span className="font-semibold">Setup required: </span>
            {!uploadedCount && 'Upload knowledge base materials. '}
            {!hasResume && 'Upload your resume. '}
            {!hasJD && 'Upload a job description. '}
            Then run the full analysis.
          </div>
        </div>
      )}

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Readiness Score" value={`${readiness}%`} icon={Award} color={readinessColor} />
        <StatCard label="Skill Match" value={`${skillMatch}%`} icon={TrendingUp} color="brand" />
        <StatCard label="Knowledge Files" value={uploadedCount} icon={BookOpen} color="cyan" />
        <StatCard label="Roadmap Weeks" value={roadmapData?.totalWeeks || '–'} icon={Map} color="purple" />
      </div>

      {/* Main content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Run Analysis Card */}
        <Card className="lg:col-span-1">
          <CardHeader title="Run AI Analysis" icon={Brain} subtitle="Multi-agent LangGraph pipeline" />
          <CardBody className="space-y-4">
            {analysisRunning ? (
              <AgentProgress
                agents={completedAgents}
                currentAgent={
                  ['knowledge', 'resume', 'jd', 'mocktest', 'skillgap', 'roadmap', 'readiness'][completedAgents.length]
                }
              />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Runs all 7 AI agents in parallel to analyze your documents and generate:
                </p>
                {['Knowledge extraction', 'Resume & JD analysis', 'Mock test generation', 'Skill gap report', 'Learning roadmap', 'Readiness score'].map(item => (
                  <div key={item} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{item}</span>
                  </div>
                ))}
              </div>
            )}

            {analysisError && (
              <div className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
                {analysisError}
              </div>
            )}

            <div className="space-y-2">
              <Button
                onClick={runAnalysis}
                loading={analysisRunning}
                disabled={!uploadedCount && !hasResume && !hasJD}
                fullWidth
                icon={Zap}
              >
                {analysisRunning ? 'Running Agents...' : analysisComplete ? 'Re-run Analysis' : 'Run Full Analysis'}
              </Button>

              {analysisComplete && (
                <Button
                  onClick={resetTargetCompany}
                  variant="danger"
                  fullWidth
                >
                  Reset Target Company
                </Button>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Radar chart */}
        {radarData.length > 0 ? (
          <Card className="lg:col-span-1">
            <CardHeader title="Readiness Breakdown" subtitle="Score across all dimensions" />
            <CardBody>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#F9FAFB' }}
                  />
                  <Radar name="Score" dataKey="value" stroke="#6366F1" fill="#6366F1" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
              <ProgressBar value={readiness} label="Overall Readiness" className="mt-2" />
            </CardBody>
          </Card>
        ) : (
          <Card className="lg:col-span-1 flex items-center justify-center min-h-64">
            <div className="text-center p-6">
              <Brain size={40} className="text-gray-300 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Run analysis to see your readiness breakdown</p>
            </div>
          </Card>
        )}

        {/* Quick actions */}
        <Card className="lg:col-span-1">
          <CardHeader title="Quick Actions" subtitle="Your setup checklist" />
          <CardBody className="space-y-3">
            {QUICK_ACTIONS.map(({ label, icon: Icon, to, done }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border
                  bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700
                  hover:border-brand-400 hover:bg-white dark:hover:bg-gray-800
                  transition-all duration-150 group"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center
                  ${done ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                  <Icon size={16} className={done ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} />
                </div>
                <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 text-left">{label}</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                  ${done ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600'}`}>
                  {done && <span className="text-white text-xs">✓</span>}
                </div>
              </button>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Skill gap preview */}
      {skillGapData && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Top Missing Skills" subtitle="Critical gaps to address" icon={TrendingUp} />
            <CardBody>
              <div className="space-y-2">
                {(missingSkillsList || []).slice(0, 5).map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{s.skill}</span>
                    <span className={`text-xs px-2 py-1 rounded-lg font-medium
                      ${s.priority === 'critical' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' :
                        s.priority === 'high' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' :
                        'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600'}`}>
                      {s.priority}
                    </span>
                  </div>
                ))}
                <button onClick={() => navigate('/skill-gap')} className="text-xs text-brand-500 hover:text-brand-600 mt-2 flex items-center gap-1">
                  View full analysis <ChevronRight size={12} />
                </button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Immediate Actions" subtitle="Do these first" icon={Zap} />
            <CardBody>
              <div className="space-y-2">
                {(readinessData?.immediateActions || []).slice(0, 4).map((action, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5">
                    <div className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-brand-600 dark:text-brand-400 text-xs font-bold">{i + 1}</span>
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {typeof action === 'object' ? `${action.action || ''}${action.timeframe ? ` (${action.timeframe})` : ''}` : action}
                    </span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      <ConfirmationModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetConfirm}
        title="Reset All Preparation Data"
        message="Are you sure you want to reset all preparation data? This will permanently delete all uploaded documents (including your Resume, Job Description, and Knowledge Base materials) as well as all generated Roadmaps, Mock Tests, and reports across all agents."
        confirmText="Reset Everything"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
