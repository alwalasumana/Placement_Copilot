import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Zap, Clock, CheckCircle, XCircle, Trophy, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardBody, StatCard } from '../components/ui/Card';
import Button from '../components/ui/Button';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';
import useAppStore from '../store/appStore';
import api from '../utils/api';
import toast from 'react-hot-toast';
import ConfirmationModal from '../components/ui/ConfirmationModal';

const SECTION_LABELS = {
  mcqs: 'Multiple Choice', coding: 'Coding', aptitude: 'Aptitude', hr: 'HR', technical: 'Technical'
};
const SECTION_COLORS = {
  mcqs: 'brand', coding: 'purple', aptitude: 'cyan', hr: 'green', technical: 'yellow'
};

export default function MockTest() {
  const { activeTest, testAnswers, testResult, testStartTime, setActiveTest, setAnswer, setTestResult } = useAppStore();
  const [tests, setTests] = useState([]);
  const [completedTest, setCompletedTest] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [testToDelete, setTestToDelete] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'taking' | 'result'
  const [activeSection, setActiveSection] = useState('mcqs');
  const [elapsed, setElapsed] = useState(0);

  // Custom mock test choices state
  const [jd, setJD] = useState(null);
  const [jdTopics, setJdTopics] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedNumQuestions, setSelectedNumQuestions] = useState(15);
  const [selectedDifficulty, setSelectedDifficulty] = useState('medium');
  const [selectedFormats, setSelectedFormats] = useState(['mcq', 'typing', 'coding']);
  const [selectedTopics, setSelectedTopics] = useState([]);
 
  useEffect(() => { 
    fetchTests(); 
    // Fetch JD topics on mount
    api.get('/upload/jd').then(res => {
      if (res.data?.success && res.data?.data) {
        const jdDoc = res.data.data;
        setJD(jdDoc);
        
        const topicsList = [];
        if (jdDoc.structured?.requiredSkills) {
          topicsList.push(...jdDoc.structured.requiredSkills);
        }
        if (jdDoc.structured?.interviewTopics) {
          topicsList.push(...jdDoc.structured.interviewTopics.map(t => typeof t === 'string' ? t : t.topic || t));
        }
        
        const unique = [...new Set(topicsList.map(t => typeof t === 'string' ? t.trim() : ''))].filter(Boolean);
        setJdTopics(unique);
        setSelectedTopics(unique);
      }
    }).catch(err => {
      console.log('Job description not loaded or error:', err.message);
    });
  }, []);
 
  useEffect(() => {
    if (testResult) setView('result');
    else if (activeTest) setView('taking');
    else {
      setView('list');
      setCompletedTest(null);
    }
  }, [activeTest, testResult]);
 
  useEffect(() => {
    if (view !== 'taking') return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (testStartTime || Date.now())) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [view, testStartTime]);
 
  const fetchTests = async (newlyGeneratedTest = null) => {
    try {
      const res = await api.get(`/mock-test?t=${Date.now()}`);
      let serverTests = res.data.data || [];
      if (newlyGeneratedTest) {
        const exists = serverTests.some(t => t.testId === newlyGeneratedTest.testId);
        if (!exists) {
          serverTests = [newlyGeneratedTest, ...serverTests];
        }
      }
      setTests(serverTests);
    } catch (err) {
      console.error(err);
    }
  };
 
  const handleFormatChange = (format) => {
    setSelectedFormats(prev => 
      prev.includes(format) 
        ? prev.filter(f => f !== format) 
        : [...prev, format]
    );
  };

  const handleTopicChange = (topic) => {
    setSelectedTopics(prev => 
      prev.includes(topic) 
        ? prev.filter(t => t !== topic) 
        : [...prev, topic]
    );
  };

  const handleSelectAllTopics = () => {
    setSelectedTopics(jdTopics);
  };

  const handleDeselectAllTopics = () => {
    setSelectedTopics([]);
  };

  const generateTest = async (e) => {
    if (e) e.preventDefault();
    if (selectedFormats.length === 0) {
      toast.error('Please select at least one question format');
      return;
    }
    setGenerating(true);
    try {
      const res = await api.post('/mock-test/generate', {
        numQuestions: Number(selectedNumQuestions),
        difficulty: selectedDifficulty,
        questionTypes: selectedFormats,
        topics: selectedTopics
      });
      toast.success('Mock test generated!');
      setIsModalOpen(false);
      
      if (res.data?.success && res.data?.testId) {
        const diffLabel = selectedDifficulty.charAt(0).toUpperCase() + selectedDifficulty.slice(1);
        let topicsStr = "";
        if (selectedTopics.length > 0) {
          topicsStr = ` (${selectedTopics.slice(0, 2).join(", ")}${selectedTopics.length > 2 ? "..." : ""})`;
        }
        const newTest = {
          _id: res.data.testMongoId || res.data.testId,
          testId: res.data.testId,
          title: res.data.title || `Custom ${diffLabel} Mock Test${topicsStr}`,
          totalQuestions: res.data.totalQuestions || selectedNumQuestions,
          status: 'generated',
          createdAt: new Date().toISOString(),
          generatedFrom: 'Custom Generation'
        };
        // Set state immediately to render the card without refresh
        setTests(prev => {
          const filtered = prev.filter(t => t.testId !== newTest.testId);
          return [newTest, ...filtered];
        });
        
        // Wait 1 second and fetch tests to fully sync, merging local state to prevent visual disappearances
        setTimeout(async () => {
          try {
            const syncRes = await api.get(`/mock-test?t=${Date.now()}`);
            const serverTests = syncRes.data.data || [];
            setTests(prev => {
              const merged = [...serverTests];
              const localNew = prev.find(t => t.testId === newTest.testId);
              if (localNew && !merged.some(t => t.testId === newTest.testId)) {
                merged.unshift(localNew);
              }
              return merged;
            });
          } catch (syncErr) {
            console.error('Failed to sync tests list:', syncErr);
          }
        }, 1000);
      } else {
        await fetchTests();
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };
 
  const startTest = async (testId) => {
    try {
      const res = await api.get(`/mock-test/${testId}`);
      setActiveTest(res.data.data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleViewResults = async (testId) => {
    setLoadingResults(true);
    try {
      const testRes = await api.get(`/mock-test/${testId}`);
      const resultRes = await api.get(`/mock-test/results/${testId}`);
      setCompletedTest(testRes.data.data);
      setTestResult(resultRes.data.data);
    } catch (err) {
      toast.error('Could not load test results: ' + err.message);
    } finally {
      setLoadingResults(false);
    }
  };

  const handleDeleteTest = (testId) => {
    setTestToDelete(testId);
  };

  const handleConfirmDeleteTest = async () => {
    if (!testToDelete) return;
    // Optimistically remove the test from state to make it disappear instantly
    setTests(prev => prev.filter(t => t.testId !== testToDelete));
    try {
      await api.delete(`/mock-test/${testToDelete}`);
      toast.success('Mock test deleted');
      await fetchTests();
      // Update global store analysis cache
      api.get('/analysis/results').then(r => {
        const d = r.data.data;
        if (d.readiness) useAppStore.getState().setReadinessData(d.readiness);
      }).catch(() => {});
    } catch (err) {
      toast.error('Could not delete test: ' + err.message);
      await fetchTests(); // restore list if API call failed
    } finally {
      setTestToDelete(null);
    }
  };
 
  const submitTest = async () => {
    if (!activeTest) return;
    setSubmitting(true);
    try {
      const answers = Object.entries(testAnswers).map(([questionId, userAnswer]) => ({
        questionId, userAnswer
      }));
      const res = await api.post('/mock-test/submit', {
        testId: activeTest.testId,
        answers,
        timeTaken: elapsed,
      });
      setCompletedTest(activeTest);
      setTestResult(res.data);
      toast.success('Test submitted!');
      // Update global store analysis cache
      api.get('/analysis/results').then(r => {
        const d = r.data.data;
        if (d.readiness) useAppStore.getState().setReadinessData(d.readiness);
      }).catch(() => {});
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const getAllQuestions = () => {
    if (!activeTest) return [];
    return Object.entries(activeTest.sections).flatMap(([section, qs]) =>
      (qs || []).map(q => ({ ...q, sectionType: section }))
    );
  };

  const getSectionQuestions = (section) => activeTest?.sections?.[section] || [];

  const answeredCount = Object.keys(testAnswers).length;
  const totalQs = activeTest ? getAllQuestions().length : 0;

  const getCompletedQuestions = () => {
    if (!completedTest) return [];
    return Object.entries(completedTest.sections).flatMap(([section, qs]) =>
      (qs || []).map(q => ({ ...q, sectionType: section }))
    );
  };

  const getAnswerForQuestion = (qId) => {
    return (testResult?.answers || []).find(a => a.questionId === qId);
  };

  // ── Result view ───────────────────────────────────────────────────────────
  if (view === 'result' && testResult) {
    const scores = testResult.scores || {};
    return (
      <div className="space-y-8 animate-fade-in">
        <div className="text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-brand-500/30">
            <Trophy size={36} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {scores.overall?.percentage || 0}%
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {scores.overall?.obtained}/{scores.overall?.total} correct
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {['mcq', 'coding', 'aptitude', 'hr', 'technical'].map(s => (
            <StatCard key={s} label={s.toUpperCase()} value={`${scores[s]?.percentage || 0}%`}
              color={SECTION_COLORS[s === 'mcq' ? 'mcqs' : s] || 'brand'} />
          ))}
        </div>

        {testResult.analysis && (
          <Card>
            <CardHeader title="AI Performance Analysis" icon={Zap} />
            <CardBody>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{testResult.analysis}</p>
              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                {testResult.weakTopics?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-500 uppercase mb-2">Weak Areas</p>
                    <div className="flex flex-wrap gap-1">
                      {testResult.weakTopics.map(t => <Badge key={t} variant="danger" size="xs">{t}</Badge>)}
                    </div>
                  </div>
                )}
                {testResult.strongTopics?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-500 uppercase mb-2">Strong Areas</p>
                    <div className="flex flex-wrap gap-1">
                      {testResult.strongTopics.map(t => <Badge key={t} variant="success" size="xs">{t}</Badge>)}
                    </div>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {completedTest && (
          <Card>
            <CardHeader title="Question Review & Source Analysis" icon={ClipboardList} />
            <CardBody className="divide-y divide-gray-150 dark:divide-gray-800 space-y-6">
              {getCompletedQuestions().map((q, idx) => {
                const ans = getAnswerForQuestion(q.questionId) || {};
                const isMcqOrApt = q.type === 'mcq' || q.type === 'aptitude';
                return (
                  <div key={q.questionId} className={`pt-6 ${idx === 0 ? 'pt-0 border-t-0' : 'border-t border-gray-100 dark:border-gray-800/60'} space-y-3`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white leading-relaxed">{q.question}</p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge variant={ans.isCorrect ? 'success' : 'danger'} size="xs" className="flex items-center gap-1">
                              {ans.isCorrect ? (
                                <>
                                  <CheckCircle size={10} /> Correct
                                </>
                              ) : (
                                <>
                                  <XCircle size={10} /> Incorrect
                                </>
                              )}
                            </Badge>
                            <Badge variant="default" size="xs">{SECTION_LABELS[q.sectionType] || q.sectionType}</Badge>
                            {q.source && (
                              <Badge variant="info" size="xs" className="normal-case">
                                Source: {q.source}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {isMcqOrApt ? (
                      <div className="grid sm:grid-cols-2 gap-2 pl-8">
                        {q.options?.map((opt, i) => {
                          const letter = ['A', 'B', 'C', 'D'][i];
                          const isUserAnswer = ans.userAnswer === letter;
                          const isCorrectAnswer = q.correctAnswer === letter;
                          let borderClass = 'border-gray-200 dark:border-gray-800';
                          let bgClass = 'bg-transparent';
                          let textClass = 'text-gray-600 dark:text-gray-400';

                          if (isCorrectAnswer) {
                            borderClass = 'border-green-500 dark:border-green-600';
                            bgClass = 'bg-green-50 dark:bg-green-950/20';
                            textClass = 'text-green-700 dark:text-green-300 font-medium';
                          } else if (isUserAnswer && !ans.isCorrect) {
                            borderClass = 'border-red-500 dark:border-red-600';
                            bgClass = 'bg-red-50 dark:bg-red-950/20';
                            textClass = 'text-red-700 dark:text-red-300 font-medium';
                          }

                          return (
                            <div key={i} className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${borderClass} ${bgClass} ${textClass}`}>
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0
                                ${isCorrectAnswer ? 'bg-green-500 text-white' : isUserAnswer ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                                {letter}
                              </span>
                              <span>{opt.replace(/^[A-D]\)\s*/, '')}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="pl-8 space-y-2">
                        <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-150 dark:border-gray-800/60">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Your Answer / Approach:</p>
                          <p className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                            {ans.userAnswer || <span className="italic text-gray-400">Unanswered</span>}
                          </p>
                        </div>
                        {q.correctAnswer && (
                          <div className="bg-green-50/30 dark:bg-green-950/5 p-3 rounded-xl border border-green-500/10">
                            <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-1">Ideal Answer / Expected Key Points:</p>
                            <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{q.correctAnswer}</p>
                          </div>
                        )}
                        {q.key_points && (
                          <div className="bg-green-50/30 dark:bg-green-950/5 p-3 rounded-xl border border-green-500/10">
                            <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-1">Key Points Evaluated:</p>
                            <ul className="list-disc list-inside text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
                              {q.key_points.map((kp, kIdx) => <li key={kIdx}>{kp}</li>)}
                            </ul>
                          </div>
                        )}
                        {q.expected_approach && (
                          <div className="bg-brand-50/20 dark:bg-brand-950/5 p-3 rounded-xl border border-brand-500/10">
                            <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wider mb-1">Expected Approach:</p>
                            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{q.expected_approach}</p>
                            {q.time_complexity && <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Time Complexity: {q.time_complexity} | Space Complexity: {q.space_complexity || 'O(1)'}</p>}
                          </div>
                        )}
                      </div>
                    )}

                    {q.explanation && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 pl-8 leading-relaxed">
                        <strong className="text-gray-600 dark:text-gray-300">Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        )}

        <Button onClick={() => { setTestResult(null); setView('list'); fetchTests(); }} variant="secondary" fullWidth>
          Back to Tests
        </Button>
      </div>
    );
  }

  // ── Taking test ────────────────────────────────────────────────────────────
  if (view === 'taking' && activeTest) {
    const sections = Object.keys(activeTest.sections).filter(s => activeTest.sections[s]?.length > 0);
    const questions = getSectionQuestions(activeSection);

    return (
      <div className="space-y-6 animate-fade-in">
        {/* Header bar */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-950 pb-4 pt-2 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{activeTest.title}</h2>
              <p className="text-sm text-gray-400">{answeredCount}/{totalQs} answered</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl">
                <Clock size={14} className="text-gray-400" />
                <span className="text-sm font-mono font-medium">{formatTime(elapsed)}</span>
              </div>
              <Button onClick={submitTest} loading={submitting} size="sm" variant="success">
                Submit Test
              </Button>
              <Button onClick={() => setActiveTest(null)} size="sm" variant="secondary">
                Exit
              </Button>
            </div>
          </div>
          <ProgressBar value={answeredCount} max={totalQs} showValue={false} size="sm" className="mt-3" />
        </div>

        {/* Section tabs */}
        <div className="flex gap-2 flex-wrap">
          {sections.map(s => (
            <button key={s} onClick={() => setActiveSection(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors
                ${activeSection === s ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
              {SECTION_LABELS[s] || s} ({activeTest.sections[s]?.length})
            </button>
          ))}
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {questions.map((q, idx) => (
            <Card key={q.questionId} className={testAnswers[q.questionId] ? 'border-brand-400 dark:border-brand-600' : ''}>
              <CardBody>
                <div className="flex items-start gap-3 mb-4">
                  <span className="w-7 h-7 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-xs font-bold text-brand-600 dark:text-brand-400 flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={
                        q.difficulty === 'hard' ? 'danger' : q.difficulty === 'medium' ? 'warning' : 'success'
                      } size="xs">{q.difficulty}</Badge>
                      {q.topic && <Badge variant="default" size="xs">{q.topic}</Badge>}
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{q.question}</p>
                  </div>
                </div>

                {q.options?.length > 0 ? (
                  <div className="space-y-2 ml-10">
                    {q.options.map((opt, i) => {
                      const letter = ['A', 'B', 'C', 'D'][i];
                      const selected = testAnswers[q.questionId] === letter;
                      return (
                        <button key={i} onClick={() => setAnswer(q.questionId, letter)}
                          className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border text-sm transition-all
                            ${selected
                              ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                              : 'border-gray-200 dark:border-gray-700 hover:border-brand-400 text-gray-700 dark:text-gray-300'
                            }`}>
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                            ${selected ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                            {letter}
                          </span>
                          {opt.replace(/^[A-D]\)\s*/, '')}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="ml-10">
                    <textarea
                      value={testAnswers[q.questionId] || ''}
                      onChange={e => setAnswer(q.questionId, e.target.value)}
                      placeholder="Write your answer or approach..."
                      rows={4}
                      className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none text-gray-800 dark:text-gray-200"
                    />
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mock Tests</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Company-specific tests grounded in your uploaded materials
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} icon={Zap}>
          Generate Test
        </Button>
      </div>

      {tests.length === 0 ? (
        <Card className="text-center py-16">
          <ClipboardList size={48} className="text-gray-300 dark:text-gray-700 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">No tests yet</h3>
          <p className="text-sm text-gray-400 mt-1 mb-6">Generate your first company-specific mock test</p>
          <Button onClick={() => setIsModalOpen(true)} icon={Zap} className="mx-auto">
            Generate Mock Test
          </Button>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {tests.map(test => (
            <Card key={test._id} hover>
              <CardBody>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">{test.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(test.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={test.status === 'taken' ? 'success' : 'brand'}>
                      {test.status}
                    </Badge>
                    <button
                      onClick={() => handleDeleteTest(test.testId)}
                      title="Delete Mock Test"
                      className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <Badge variant="info">{test.totalQuestions} questions</Badge>
                  <Badge variant="default">{test.generatedFrom?.replace(/_/g, ' ')}</Badge>
                </div>
                {test.status === 'taken' ? (
                  <div className="flex gap-2">
                    <Button onClick={() => handleViewResults(test.testId)} loading={loadingResults} variant="primary" size="sm" className="flex-1">
                      View Results
                    </Button>
                    <Button onClick={() => startTest(test.testId)} variant="secondary" size="sm" className="flex-1">
                      Retake Test
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => startTest(test.testId)} variant="primary" size="sm" fullWidth>
                    Start Test
                  </Button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Configuration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-850 rounded-3xl shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200 my-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Zap className="text-brand-500 fill-brand-500/20" size={20} />
              Customize Mock Test
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
              Configure your test length, difficulty, formats, and target topics.
            </p>

            <form onSubmit={generateTest} className="space-y-6">
              {/* Question Count & Difficulty */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    Number of Questions
                  </label>
                  <select
                    value={selectedNumQuestions}
                    onChange={e => setSelectedNumQuestions(Number(e.target.value))}
                    className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-800 dark:text-white"
                  >
                    {[5, 10, 15, 20, 25].map(n => (
                      <option key={n} value={n} className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">
                        {n} Questions
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    Difficulty Level
                  </label>
                  <select
                    value={selectedDifficulty}
                    onChange={e => setSelectedDifficulty(e.target.value)}
                    className="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-800 dark:text-white"
                  >
                    <option value="easy" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Easy</option>
                    <option value="medium" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Medium</option>
                    <option value="hard" className="text-gray-900 dark:text-white bg-white dark:bg-gray-800">Hard</option>
                  </select>
                </div>
              </div>

              {/* Question Formats */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                  Question Formats
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'mcq', label: 'Multiple Choice (MCQ)' },
                    { key: 'typing', label: 'Text Typing (Short Answer)' },
                    { key: 'coding', label: 'Coding Problems' }
                  ].map(fmt => {
                    const checked = selectedFormats.includes(fmt.key);
                    return (
                      <button
                        type="button"
                        key={fmt.key}
                        onClick={() => handleFormatChange(fmt.key)}
                        className={`p-3 rounded-2xl border text-xs font-medium text-center transition-all flex flex-col items-center justify-center gap-1 min-h-[72px]
                          ${checked 
                            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-semibold' 
                            : 'border-gray-200 dark:border-gray-800 bg-transparent text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700'}`}
                      >
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Topics Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Topics from Job Description
                  </label>
                  {jdTopics.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllTopics}
                        className="text-[10px] font-bold text-brand-500 hover:underline"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300 dark:text-gray-750">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllTopics}
                        className="text-[10px] font-bold text-brand-500 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                {jdTopics.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-100 dark:border-yellow-900/50 text-center text-xs text-yellow-700 dark:text-yellow-400">
                    No analyzed Job Description found. Please upload a JD first to customize topics.
                  </div>
                ) : (
                  <div className="max-h-36 overflow-y-auto border border-gray-150 dark:border-gray-800 rounded-2xl p-3 bg-gray-50/50 dark:bg-gray-950/30 grid grid-cols-2 gap-2">
                    {jdTopics.map(topic => {
                      const checked = selectedTopics.includes(topic);
                      return (
                        <label
                          key={topic}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-xs cursor-pointer transition-all select-none
                            ${checked
                              ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/40 text-gray-900 dark:text-white font-medium'
                              : 'border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-900/40'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleTopicChange(topic)}
                            className="w-3.5 h-3.5 accent-brand-500 rounded border-gray-300 focus:ring-brand-500"
                          />
                          <span className="truncate">{topic}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  variant="secondary"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={generating}
                  disabled={selectedFormats.length === 0}
                  className="flex-1"
                >
                  Generate Test
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!testToDelete}
        onClose={() => setTestToDelete(null)}
        onConfirm={handleConfirmDeleteTest}
        title="Delete Mock Test"
        message="Are you sure you want to delete this mock test? This will permanently delete the test questions and any associated scores/results."
        confirmText="Delete Test"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
