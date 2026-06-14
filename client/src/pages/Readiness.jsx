import { useEffect, useState } from 'react';
import { Award, TrendingUp, Zap, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { LoadingScreen } from '../components/ui/LoadingSpinner';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import useAppStore from '../store/appStore';
import api from '../utils/api';
import toast from 'react-hot-toast';

const LEVEL_CONFIG = {
  low:    { color: 'text-red-500', bg: 'bg-red-500', label: 'Low Readiness', range: '0–40%' },
  medium: { color: 'text-yellow-500', bg: 'bg-yellow-500', label: 'Medium Readiness', range: '41–70%' },
  high:   { color: 'text-green-500', bg: 'bg-green-500', label: 'High Readiness', range: '71–100%' },
};

export default function Readiness() {
  const { readinessData, setReadinessData } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(readinessData);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/analysis/readiness');
      setData(res.data.data);
      setReadinessData(res.data.data);
    } catch (err) {
      if (!readinessData) console.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await api.post('/analysis/refresh', { agents: ['knowledge', 'resume', 'jd', 'skillGap', 'readiness'] });
      if (res.data.results?.readiness) {
        setData(res.data.results.readiness);
        setReadinessData(res.data.results.readiness);
      }
      toast.success('Readiness refreshed!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) return <LoadingScreen message="Calculating readiness..." />;

  if (!data) return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-4 text-center animate-fade-in">
      <Award size={48} className="text-gray-300 dark:text-gray-700" />
      <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">No readiness report yet</h2>
      <p className="text-sm text-gray-400 max-w-sm">Run the full analysis to calculate your interview readiness score.</p>
    </div>
  );

  // Map backend format to frontend format
  const scores = {
    overallReadiness: data.compositeReadiness || data.scores?.overallReadiness || 0,
    resumeMatchScore: data.scores?.resume || data.scores?.resumeMatchScore || 0,
    jdMatchScore: data.scores?.criticalSkills || data.scores?.jdMatchScore || 0,
    skillGapScore: data.scores?.skillMatch || data.scores?.skillGapScore || 0,
    companyReadinessScore: data.scores?.kb || data.scores?.companyReadinessScore || 0,
  };

  const readinessLevel = data.readinessTier || data.readinessLevel || 'low';
  const interviewProbability = data.hiringProbabilityNow || data.interviewProbability || 0;
  const detailedReasoning = data.executiveSummary || data.detailedReasoning || '';
  
  const keyStrengths = (data.topStrengths || data.keyStrengths || []).map(s => 
    typeof s === 'object' ? `${s.strength || s.name || ''}${s.impact ? ` (Impact: ${s.impact})` : ''}` : s
  );
  
  const criticalGaps = (data.criticalGapsToFix || data.criticalGaps || []).map(g => 
    typeof g === 'object' ? `${g.gap || g.skill || ''}${g.severity ? ` (Severity: ${g.severity})` : ''}` : g
  );

  const immediateActions = (data.immediateActions || []).map(a => 
    typeof a === 'object' ? `${a.action || ''}${a.timeframe ? ` (${a.timeframe})` : ''}` : a
  );

  const shortTermActions = data.shortTermActions || (data.criticalGapsToFix || []).map(g => 
    typeof g === 'object' ? `Fix: ${g.fix || g.gap}` : g
  ).slice(0, 3);

  const longTermActions = data.longTermActions || [data.motivationalNote].filter(Boolean);

  const rawBreakdown = data.interviewRoundReadiness || data.interviewReadinessBreakdown || {};
  const breakdown = {
    technicalRound: rawBreakdown.technical_interview?.score || rawBreakdown.technicalRound || 0,
    codingRound: rawBreakdown.coding_round?.score || rawBreakdown.codingRound || 0,
    hrRound: rawBreakdown.hr_round?.score || rawBreakdown.hrRound || 0,
    systemDesign: rawBreakdown.online_assessment?.score || rawBreakdown.systemDesign || 0,
  };

  const level = LEVEL_CONFIG[readinessLevel] || LEVEL_CONFIG.low;

  const radarData = [
    { subject: 'Resume', value: scores.resumeMatchScore || 0 },
    { subject: 'JD Match', value: scores.jdMatchScore || 0 },
    { subject: 'Skills', value: scores.skillGapScore || 0 },
    { subject: 'Company', value: scores.companyReadinessScore || 0 },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Interview Readiness</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Your comprehensive placement readiness report</p>
        </div>
        <Button onClick={refresh} loading={loading} variant="secondary" icon={Zap} size="sm">
          Refresh
        </Button>
      </div>

      {/* Hero score */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-8 text-white">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="white" strokeWidth="10"
                  strokeDasharray={`${(scores.overallReadiness || 0) * 3.14} 314`}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
                <text x="60" y="55" textAnchor="middle" fill="white" fontSize="22" fontWeight="bold">
                  {scores.overallReadiness || 0}%
                </text>
                <text x="60" y="73" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="10">
                  Readiness
                </text>
              </svg>
            </div>
            <div>
              <h2 className="text-3xl font-bold">{level.label}</h2>
              <p className="text-brand-200 mt-1">Interview probability: <strong className="text-white">{interviewProbability}%</strong></p>
              <p className="text-brand-200 mt-1 text-sm">{level.range}</p>
              {data.confidenceMessage && (
                <p className="text-white/80 text-sm mt-2 italic max-w-md">"{data.confidenceMessage}"</p>
              )}
            </div>
          </div>
        </div>

        {/* Score breakdown row */}
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Resume Match', value: scores.resumeMatchScore },
              { label: 'JD Match', value: scores.jdMatchScore },
              { label: 'Skill Gap', value: scores.skillGapScore },
              { label: 'Company', value: scores.companyReadinessScore },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-xl font-bold text-gray-900 dark:text-white">{value || 0}%</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Charts + reasoning */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Readiness Radar" subtitle="Multi-dimensional breakdown" />
          <CardBody>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#374151" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }} />
                <Radar name="Score" dataKey="value" stroke="#6366F1" fill="#6366F1" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Interview Round Readiness" />
          <CardBody className="space-y-4">
            {[
              { label: 'Technical Round', value: breakdown.technicalRound },
              { label: 'Coding Round', value: breakdown.codingRound },
              { label: 'HR Round', value: breakdown.hrRound },
              { label: 'System Design', value: breakdown.systemDesign },
            ].map(({ label, value }) => (
              <ProgressBar key={label} value={value || 0} label={label} />
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Detailed reasoning */}
      {detailedReasoning && (
        <Card>
          <CardHeader title="Detailed Analysis" icon={TrendingUp} />
          <CardBody>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line">{detailedReasoning}</p>
          </CardBody>
        </Card>
      )}

      {/* Strengths & Gaps */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Key Strengths" icon={CheckCircle} />
          <CardBody className="space-y-2">
            {keyStrengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2 p-2">
                <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{s}</span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Critical Gaps" icon={AlertTriangle} />
          <CardBody className="space-y-2">
            {criticalGaps.map((g, i) => (
              <div key={i} className="flex items-start gap-2 p-2">
                <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{g}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* Action plan */}
      <div className="grid lg:grid-cols-3 gap-4">
        {[
          { title: 'Immediate Actions', items: immediateActions, color: 'danger', icon: Zap },
          { title: 'Short-Term (2 weeks)', items: shortTermActions, color: 'warning', icon: TrendingUp },
          { title: 'Long-Term', items: longTermActions, color: 'success', icon: Award },
        ].map(({ title, items, color, icon: Icon }) => (
          <Card key={title}>
            <CardHeader title={title} icon={Icon} />
            <CardBody className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ChevronRight size={14} className={`text-${color === 'danger' ? 'red' : color === 'warning' ? 'yellow' : 'green'}-500 mt-0.5 flex-shrink-0`} />
                  <p className="text-xs text-gray-600 dark:text-gray-400">{item}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
