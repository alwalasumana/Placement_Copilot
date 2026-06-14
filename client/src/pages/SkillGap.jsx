import { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle, XCircle, Zap } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { LoadingScreen } from '../components/ui/LoadingSpinner';
import useAppStore from '../store/appStore';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function SkillGap() {
  const { skillGapData, setSkillGapData, analysisComplete, readinessData } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(skillGapData);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/analysis/skill-gap');
      setData(res.data.data);
      setSkillGapData(res.data.data);
    } catch (err) {
      if (!skillGapData) console.error(err.message);
      else setData(skillGapData);
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await api.post('/analysis/refresh', { agents: ['knowledge', 'resume', 'jd', 'skillGap'] });
      if (res.data.results?.skillGap) {
        setData(res.data.results.skillGap);
        setSkillGapData(res.data.results.skillGap);
      }
      toast.success('Skill gap refreshed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <LoadingScreen message="Analyzing skill gaps..." />;

  if (!data) return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-4 text-center animate-fade-in">
      <TrendingUp size={48} className="text-gray-300 dark:text-gray-700" />
      <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">No skill gap analysis yet</h2>
      <p className="text-sm text-gray-400 max-w-sm">Upload your resume and JD, then run the full analysis from the dashboard.</p>
    </div>
  );

  // Map backend fields to frontend expectations:
  const matchingSkills = [];
  if (Array.isArray(data.strengths) && data.strengths.length > 0) {
    data.strengths.forEach(s => {
      matchingSkills.push({
        skill: s.skill,
        evidence: `${s.level || 'proficient'} · ${s.evidence || 'Found in resume'}`
      });
    });
  } else if (Array.isArray(data.matchedSkills)) {
    data.matchedSkills.forEach(skill => {
      matchingSkills.push({
        skill: skill,
        evidence: 'Matched in resume'
      });
    });
  }

  const missingSkills = [];
  if (Array.isArray(data.criticalGaps) && data.criticalGaps.length > 0) {
    data.criticalGaps.forEach(s => {
      missingSkills.push({
        skill: s.skill,
        priority: s.severity || 'critical',
        reason: s.why_important || 'Required by job description'
      });
    });
  }
  if (Array.isArray(data.moderateGaps) && data.moderateGaps.length > 0) {
    data.moderateGaps.forEach(s => {
      missingSkills.push({
        skill: s.skill,
        priority: s.severity || 'medium',
        reason: s.why_important || 'Preferred by job description'
      });
    });
  }
  if (missingSkills.length === 0 && Array.isArray(data.missingSkills)) {
    data.missingSkills.forEach(skill => {
      missingSkills.push({
        skill: skill,
        priority: 'high',
        reason: 'Required skill missing from resume'
      });
    });
  }

  const weakAreas = (data.criticalGaps || []).map(g => ({
    area: g.skill,
    description: `Takes ${g.time_to_learn || '2-3 weeks'} to learn. ${g.why_important || ''}`
  }));

  const strengthAreas = (data.strengths || []).map(s => ({
    area: s.skill,
    description: `${s.evidence || ''} (${s.relevance || 'high'} relevance)`
  }));

  const insights = data.keyInsight;
  const recommendations = data.quickWins || [];

  const scores = {
    resumeMatchScore: readinessData?.scores?.resume || data.scoreBreakdown?.final || data.overallMatchScore || 0,
    jdMatchScore: readinessData?.scores?.criticalSkills || data.scoreBreakdown?.base || data.overallMatchScore || 0,
    skillMatchPercentage: readinessData?.scores?.skillMatch || data.overallMatchScore || 0,
    knowledgeBaseMatchScore: readinessData?.scores?.kb || (data.scoreBreakdown?.projBonus ? Math.min(100, data.scoreBreakdown.projBonus * 10) : 0),
    overallReadinessScore: readinessData?.compositeReadiness || data.scoreBreakdown?.final || data.overallMatchScore || 0
  };

  const priorityColor = { critical: 'danger', high: 'warning', medium: 'brand', low: 'default' };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Skill Gap Analysis</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Resume vs JD vs Company Knowledge Base comparison
          </p>
        </div>
        <Button onClick={refresh} loading={refreshing} variant="secondary" icon={Zap} size="sm">
          Refresh
        </Button>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Resume Match', value: scores.resumeMatchScore },
          { label: 'JD Match', value: scores.jdMatchScore },
          { label: 'Skill Match', value: scores.skillMatchPercentage },
          { label: 'KB Match', value: scores.knowledgeBaseMatchScore },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardBody className="py-5">
              <ProgressBar value={value || 0} label={label} size="lg" />
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Overall bar */}
      <Card>
        <CardBody>
          <ProgressBar
            value={scores.overallReadinessScore || 0}
            label="Overall Readiness Score"
            size="lg"
          />
        </CardBody>
      </Card>

      {/* Insights */}
      {insights && (
        <Card>
          <CardHeader title="AI Insights" icon={TrendingUp} />
          <CardBody>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{insights}</p>
          </CardBody>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Missing skills */}
        <Card>
          <CardHeader
            title="Missing Skills"
            subtitle={`${missingSkills.length} gaps identified`}
            icon={XCircle}
            action={<span className="text-xs text-red-500">{missingSkills.filter(s => s.priority === 'critical').length} critical</span>}
          />
          <CardBody className="space-y-3">
            {missingSkills.length === 0
              ? <p className="text-sm text-gray-400 text-center py-4">No gaps found! 🎉</p>
              : missingSkills.map((s, i) => (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.skill}</span>
                    <Badge variant={priorityColor[s.priority] || 'default'} size="xs">{s.priority}</Badge>
                  </div>
                  {s.reason && <p className="text-xs text-gray-400 mt-1">{s.reason}</p>}
                </div>
              ))
            }
          </CardBody>
        </Card>

        {/* Matching skills */}
        <Card>
          <CardHeader
            title="Matching Skills"
            subtitle={`${matchingSkills.length} matches found`}
            icon={CheckCircle}
          />
          <CardBody className="space-y-2">
            {matchingSkills.length === 0
              ? <p className="text-sm text-gray-400 text-center py-4">Run analysis to see matches</p>
              : matchingSkills.map((s, i) => (
                <div key={i} className="flex items-start gap-2 p-2">
                  <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.skill}</span>
                    {s.evidence && <p className="text-xs text-gray-400">{s.evidence}</p>}
                  </div>
                </div>
              ))
            }
          </CardBody>
        </Card>

        {/* Weak areas */}
        {weakAreas.length > 0 && (
          <Card>
            <CardHeader title="Areas to Improve" icon={AlertTriangle} />
            <CardBody className="space-y-3">
              {weakAreas.map((a, i) => (
                <div key={i} className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-200 dark:border-yellow-800/50">
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-400">{a.area}</p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">{a.description}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {/* Strengths */}
        {strengthAreas.length > 0 && (
          <Card>
            <CardHeader title="Strengths" icon={CheckCircle} />
            <CardBody className="space-y-3">
              {strengthAreas.map((a, i) => (
                <div key={i} className="p-3 bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-200 dark:border-green-800/50">
                  <p className="text-sm font-medium text-green-800 dark:text-green-400">{a.area}</p>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-1">{a.description}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader title="Recommendations" subtitle="AI-powered action items" icon={Zap} />
          <CardBody>
            <div className="grid sm:grid-cols-2 gap-3">
              {recommendations.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-brand-50 dark:bg-brand-900/20 rounded-xl border border-brand-200 dark:border-brand-800/50">
                  <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-xs text-white font-bold flex-shrink-0">
                    {i + 1}
                  </div>
                  <p className="text-sm text-brand-700 dark:text-brand-300">{r}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
