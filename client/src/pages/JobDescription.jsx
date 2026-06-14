import { useEffect, useState } from 'react';
import { Briefcase, Star, List, CheckSquare } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import FileUpload from '../components/upload/FileUpload';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import useAppStore from '../store/appStore';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function JobDescription() {
  const { setHasJD, jdData } = useAppStore();
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [jd, setJD] = useState(jdData);
  const [textInput, setTextInput] = useState('');
  const [mode, setMode] = useState('file'); // 'file' | 'text'
  const [prepTime, setPrepTime] = useState(8);
  const [prepTimeUnit, setPrepTimeUnit] = useState('weeks'); // 'weeks' | 'days'

  useEffect(() => {
    api.get('/analysis/results').then(r => {
      if (r.data.data?.jd) {
        setJD(r.data.data.jd);
        setHasJD(true);
      }
      if (r.data.data?.preparationTime) {
        setPrepTime(r.data.data.preparationTime);
      }
      if (r.data.data?.preparationTimeUnit) {
        setPrepTimeUnit(r.data.data.preparationTimeUnit);
      }
    }).catch(() => {});
  }, []);

  const saveTimeframe = async (time, unit) => {
    try {
      await api.post('/upload/jd/timeframe', { preparationTime: time, preparationTimeUnit: unit });
      useAppStore.getState().setRoadmapData(null);
    } catch (err) {
      console.error('Failed to auto-save timeframe:', err.message);
    }
  };

  const handleFileUpload = async (files) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('preparationTime', prepTime);
    formData.append('preparationTimeUnit', prepTimeUnit);
    try {
      await api.post('/upload/jd', formData);
      setHasJD(true);
      toast.success('Job description uploaded!');
      useAppStore.getState().setRoadmapData(null);
      
      // Trigger AI parsing in background (non-blocking for upload)
      setExtracting(true);
      api.post('/analysis/refresh', { agents: ['jd'] })
        .then(r => {
          if (r.data.results?.jobDescription) {
            setJD(r.data.results.jobDescription.structured);
            toast.success('AI JD analysis complete!');
          }
        })
        .catch((err) => {
          toast.error('AI JD analysis failed: ' + err.message);
        })
        .finally(() => {
          setExtracting(false);
        });
    } catch (err) {
      toast.error(err.message);
      throw err; // propagates to FileUpload to preserve files on error
    } finally {
      setUploading(false);
    }
  };

  const handleTextUpload = async () => {
    if (!textInput.trim()) { toast.error('Enter a job description'); return; }
    setUploading(true);
    try {
      await api.post('/upload/jd', { text: textInput, preparationTime: prepTime, preparationTimeUnit: prepTimeUnit });
      setHasJD(true);
      toast.success('JD saved!');
      useAppStore.getState().setRoadmapData(null);
      
      // Trigger AI parsing in background (non-blocking)
      setExtracting(true);
      api.post('/analysis/refresh', { agents: ['jd'] })
        .then(r => {
          if (r.data.results?.jobDescription) {
            setJD(r.data.results.jobDescription.structured);
            toast.success('AI JD analysis complete!');
          }
        })
        .catch((err) => {
          toast.error('AI JD analysis failed: ' + err.message);
        })
        .finally(() => {
          setExtracting(false);
        });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Job Description</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Upload the JD to extract required skills, qualifications, and responsibilities
        </p>
      </div>

      {/* Upload mode tabs */}
      <div className="flex gap-2">
        {['file', 'text'].map(m => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors
              ${mode === m ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {m === 'file' ? 'Upload File' : 'Paste Text'}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Upload JD" icon={Briefcase} subtitle="PDF, DOCX, or paste text" />
          <CardBody className="space-y-4">
            <div className="bg-gray-50/50 dark:bg-gray-950/30 p-4 rounded-2xl border border-gray-150 dark:border-gray-800/60 space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Available Preparation Time
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max={prepTimeUnit === 'days' ? 120 : 16}
                  value={prepTime}
                  onChange={e => {
                    const val = Math.max(1, Number(e.target.value));
                    setPrepTime(val);
                  }}
                  onBlur={() => {
                    saveTimeframe(prepTime, prepTimeUnit);
                  }}
                  className="w-24 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2.5 text-center focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-700 dark:text-white"
                />
                
                <div className="flex rounded-xl bg-gray-150 dark:bg-gray-800 p-1 border border-gray-255 dark:border-gray-700/60">
                  <button
                    type="button"
                    onClick={() => {
                      setPrepTimeUnit('days');
                      if (prepTimeUnit === 'weeks') {
                        const newTime = Math.min(120, prepTime * 7);
                        setPrepTime(newTime);
                        saveTimeframe(newTime, 'days');
                      }
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      prepTimeUnit === 'days'
                        ? 'bg-white dark:bg-gray-900 text-brand-600 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrepTimeUnit('weeks');
                      if (prepTimeUnit === 'days') {
                        const newTime = Math.max(1, Math.round(prepTime / 7));
                        setPrepTime(newTime);
                        saveTimeframe(newTime, 'weeks');
                      }
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      prepTimeUnit === 'weeks'
                        ? 'bg-white dark:bg-gray-900 text-brand-600 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Weeks
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {prepTimeUnit === 'days' 
                  ? `Roadmap will be generated for approximately ${Math.max(1, Math.round(prepTime / 7))} weeks.`
                  : `Roadmap will be generated for exactly ${prepTime} weeks.`
                }
              </p>
            </div>

            {mode === 'file' ? (
              <FileUpload
                onUpload={handleFileUpload}
                accept="pdf_docx"
                multiple={false}
                label="Upload Job Description"
                hint="PDF, DOCX, or TXT"
                loading={uploading}
              />
            ) : (
              <div className="space-y-3">
                <textarea
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  rows={10}
                  placeholder="Paste the job description text here..."
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800
                    text-sm text-gray-800 dark:text-gray-200 p-3 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
                <Button onClick={handleTextUpload} loading={uploading} fullWidth>
                  Save Job Description
                </Button>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Preview or Loading */}
        {extracting ? (
          <Card className="flex flex-col items-center justify-center min-h-64">
            <LoadingSpinner size={32} className="mb-3" />
            <p className="text-sm font-medium text-gray-755 dark:text-gray-200 animate-pulse">
              AI Agent analyzing Job Description...
            </p>
            <p className="text-xs text-gray-400 mt-1.5">
              Extracting role requirements, skills, and qualifications
            </p>
          </Card>
        ) : jd ? (
          <Card>
            <CardHeader title={jd.role || 'Position'} subtitle={jd.companyName} icon={Briefcase} />
            <CardBody className="space-y-3">
              {jd.experience && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">Experience:</span>
                  <Badge variant="info">{jd.experience}</Badge>
                </div>
              )}
              {jd.location && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">Location:</span>
                  <span className="text-gray-700 dark:text-gray-300">{jd.location}</span>
                </div>
              )}
              {jd.summary && (
                <p className="text-sm text-gray-600 dark:text-gray-400 italic">{jd.summary}</p>
              )}
            </CardBody>
          </Card>
        ) : (
          <Card className="flex items-center justify-center min-h-48">
            <div className="text-center p-6">
              <Briefcase size={36} className="text-gray-300 dark:text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Upload a JD to see extracted requirements</p>
            </div>
          </Card>
        )}
      </div>

      {!extracting && jd && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Required skills */}
          <Card>
            <CardHeader title="Required Skills" icon={Star} subtitle="Must-have skills" />
            <CardBody>
              <div className="flex flex-wrap gap-2">
                {(jd.requiredSkills || []).map(s => <Badge key={s} variant="danger">{s}</Badge>)}
              </div>
              {(jd.preferredSkills || []).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Preferred (Nice-to-have)</p>
                  <div className="flex flex-wrap gap-2">
                    {jd.preferredSkills.map(s => <Badge key={s} variant="warning">{s}</Badge>)}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Responsibilities */}
          <Card>
            <CardHeader title="Responsibilities" icon={List} />
            <CardBody>
              <ul className="space-y-2">
                {(jd.responsibilities || []).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <CheckSquare size={14} className="text-brand-500 mt-0.5 flex-shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {/* Qualifications */}
          {(jd.qualifications || []).length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader title="Qualifications" icon={CheckSquare} />
              <CardBody>
                <div className="grid sm:grid-cols-2 gap-2">
                  {jd.qualifications.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 p-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">{q}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
