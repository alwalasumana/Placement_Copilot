import { useEffect, useState } from 'react';
import { Map, CheckCircle, Circle, Clock, BookOpen, Target, Zap, Calendar } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { LoadingScreen } from '../components/ui/LoadingSpinner';
import useAppStore from '../store/appStore';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Roadmap() {
  const { roadmapData, setRoadmapData, roadmapProgress, setWeekComplete } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(roadmapData);
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    fetchRoadmap();
  }, []);

  const fetchRoadmap = async () => {
    setLoading(true);
    try {
      const res = await api.get('/roadmap');
      setData(res.data.data);
      setRoadmapData(res.data.data);
    } catch (err) {
      if (!roadmapData) console.error(err.message);
      else setData(roadmapData);
    } finally {
      setLoading(false);
    }
  };

  const toggleWeek = async (roadmapId, weekNumber, currentState) => {
    const newState = !currentState;
    setUpdating(weekNumber);
    setWeekComplete(weekNumber, newState);

    // Optimistic update
    setData(prev => ({
      ...prev,
      weeks: prev.weeks.map(w =>
        w.week === weekNumber ? { ...w, completed: newState } : w
      ),
      progressPercentage: Math.round(
        (prev.weeks.filter(w => w.week === weekNumber ? newState : w.completed).length / prev.weeks.length) * 100
      )
    }));

    try {
      await api.patch('/roadmap/progress', { roadmapId, weekNumber, completed: newState });
    } catch (err) {
      toast.error(err.message);
      setWeekComplete(weekNumber, currentState);
    } finally {
      setUpdating(null);
    }
  };

  if (loading && !data) return <LoadingScreen message="Loading your roadmap..." />;

  if (!data) return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-4 text-center animate-fade-in">
      <Map size={48} className="text-gray-300 dark:text-gray-700" />
      <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">No roadmap generated yet</h2>
      <p className="text-sm text-gray-400 max-w-sm">Run the full analysis from the dashboard to generate your personalized roadmap.</p>
    </div>
  );

  const weeks = data.weeks || [];
  const isDays = data.timeframeUnit === 'days';
  const totalCount = isDays ? (data.totalDays || weeks.length) : (data.totalWeeks || weeks.length);
  const completedCount = weeks.filter(w => w.completed || roadmapProgress[w.week]).length;
  const progress = weeks.length > 0 ? Math.round((completedCount / weeks.length) * 100) : 0;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{data.title || 'Learning Roadmap'}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{data.description}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: isDays ? 'Total Days' : 'Total Weeks', value: totalCount },
          { label: 'Completed', value: completedCount },
          { label: isDays ? 'Remaining Days' : 'Remaining Weeks', value: Math.max(0, totalCount - completedCount) },
          { label: 'Progress', value: `${progress}%` },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardBody className="py-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
              <p className="text-xs text-gray-400 mt-1">{label}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Progress bar */}
      <Card>
        <CardBody>
          <ProgressBar value={progress} label="Overall Progress" size="lg" />
          <p className="text-xs text-gray-400 mt-2 text-center">
            Target: {data.targetRole} {data.targetCompany && `at ${data.targetCompany}`}
          </p>
        </CardBody>
      </Card>

      {/* Weeks */}
      <div className="space-y-4">
        {weeks.map((week) => {
          const isCompleted = week.completed || !!roadmapProgress[week.week];
          const isExpanded = expandedWeek === week.week;
          const isCurrent = week.week === data.currentWeek;

          return (
            <Card key={week.week}
              className={`transition-all duration-200 ${isCompleted ? 'opacity-80' : ''} ${isCurrent ? 'border-brand-400 dark:border-brand-600 ring-1 ring-brand-400/30' : ''}`}>
              <div
                className="flex items-center gap-4 p-4 cursor-pointer"
                onClick={() => setExpandedWeek(isExpanded ? null : week.week)}
              >
                {/* Week indicator */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleWeek(data._id, week.week, isCompleted); }}
                  disabled={updating === week.week}
                  className="flex-shrink-0 transition-transform hover:scale-110"
                >
                  {isCompleted
                    ? <CheckCircle size={24} className="text-green-500" />
                    : <Circle size={24} className={isCurrent ? 'text-brand-500' : 'text-gray-300 dark:text-gray-600'} />
                  }
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-brand-500 uppercase">{isDays ? 'Day' : 'Week'} {week.week}</span>
                    {isCurrent && <Badge variant="brand" size="xs">Current</Badge>}
                    {isCompleted && <Badge variant="success" size="xs">Done</Badge>}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{week.title}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    {week.estimatedHours && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={10} /> {week.estimatedHours}h/{isDays ? 'day' : 'week'}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{(week.topics || []).length} topics</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 max-w-xs hidden lg:flex">
                  {(week.topics || []).slice(0, 3).map(t => (
                    <Badge key={t} variant="default" size="xs">{t}</Badge>
                  ))}
                  {(week.topics || []).length > 3 && <Badge variant="default" size="xs">+{week.topics.length - 3}</Badge>}
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-4 animate-slide-up">
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Topics */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-1">
                        <BookOpen size={10} /> Topics
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(week.topics || []).map(t => <Badge key={t} variant="brand" size="xs">{t}</Badge>)}
                      </div>
                    </div>

                    {/* Learning objectives */}
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-1">
                        <Target size={10} /> Objectives
                      </p>
                      <ul className="space-y-1">
                        {(week.learningObjectives || []).map((o, i) => (
                          <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
                            <span className="text-brand-400 flex-shrink-0">•</span> {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Practice goals */}
                  {(week.practiceGoals || []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-1">
                        <Zap size={10} /> Practice Goals
                      </p>
                      <div className="space-y-1">
                        {week.practiceGoals.map((g, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                            <span className="text-green-400 flex-shrink-0">▸</span> {g}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Daily Plan */}
                  {!isDays && (week.dailyPlan || []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-1">
                        <Calendar size={10} /> Daily Breakdown
                      </p>
                      <div className="space-y-2">
                        {week.dailyPlan.map((d, i) => (
                          <div key={i} className="flex items-start gap-3 p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50">
                            <span className="text-xs font-semibold text-brand-500 w-28 flex-shrink-0 pt-0.5">{d.day}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{d.focus}</p>
                              <ul className="space-y-0.5">
                                {(d.tasks || []).map((t, j) => (
                                  <li key={j} className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1">
                                    <span className="text-brand-400 flex-shrink-0">·</span>{t}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resources */}
                  {(week.resources || []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Resources</p>
                      <div className="flex flex-wrap gap-2">
                        {week.resources.map((r, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
                            <Badge variant={r.type === 'video' ? 'danger' : r.type === 'practice' ? 'success' : 'default'} size="xs">
                              {r.type}
                            </Badge>
                            <span className="text-gray-600 dark:text-gray-400">{r.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={(e) => { e.stopPropagation(); toggleWeek(data._id, week.week, isCompleted); }}
                    variant={isCompleted ? 'secondary' : 'success'}
                    size="sm"
                    loading={updating === week.week}
                  >
                    {isCompleted ? 'Mark as Incomplete' : 'Mark as Complete'}
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
