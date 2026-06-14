import { useEffect, useState } from 'react';
import { FileText, Code, Briefcase, GraduationCap, Award, User } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import FileUpload from '../components/upload/FileUpload';
import Badge from '../components/ui/Badge';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import useAppStore from '../store/appStore';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Resume() {
  const { setHasResume, resumeData, setAnalysisComplete } = useAppStore();
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [resume, setResume] = useState(resumeData);
  const getResumeSkills = () => {
    if (!resume) return [];
    if (Array.isArray(resume.allSkills)) return resume.allSkills;
    if (Array.isArray(resume.skills)) return resume.skills;
    if (resume.skills && typeof resume.skills === 'object') {
      return Object.values(resume.skills).flat().filter(Boolean);
    }
    return [];
  };

  useEffect(() => {
    api.get('/analysis/results').then(r => {
      if (r.data.data?.resume) {
        setResume(r.data.data.resume);
        setHasResume(true);
      }
    }).catch(() => {});
  }, []);

  const handleUpload = async (files) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', files[0]);
    try {
      await api.post('/upload/resume', formData);
      setHasResume(true);
      toast.success('Resume uploaded successfully!');
      
      // Trigger AI parsing in background (non-blocking for upload)
      setExtracting(true);
      api.post('/analysis/refresh', { agents: ['resume'] })
        .then(r => {
          if (r.data.results?.resume) {
            setResume(r.data.results.resume.structured);
            toast.success('AI Resume analysis complete!');
          }
        })
        .catch((err) => {
          toast.error('AI Resume analysis failed: ' + err.message);
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

  const SkillPill = ({ skill }) => (
    <Badge variant="brand" size="sm">{skill}</Badge>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Resume</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Upload your resume to extract skills, projects, and experience
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upload */}
        <Card>
          <CardHeader title="Upload Resume" icon={FileText} subtitle="PDF or DOCX format" />
          <CardBody>
            <FileUpload
               onUpload={handleUpload}
               accept="pdf_docx"
               multiple={false}
               label="Upload your Resume"
               hint="PDF or DOCX, max 10MB"
               maxMB={10}
               loading={uploading}
             />
             <p className="text-xs text-gray-400 mt-4">
               Your resume is parsed, embedded, and indexed for AI analysis. Only you have access via your session.
             </p>
           </CardBody>
         </Card>
 
         {/* Summary or Loading */}
         {extracting ? (
           <Card className="flex flex-col items-center justify-center min-h-64">
             <LoadingSpinner size={32} className="mb-3" />
             <p className="text-sm font-medium text-gray-750 dark:text-gray-200 animate-pulse">
               AI Agent analyzing resume...
             </p>
             <p className="text-xs text-gray-400 mt-1.5">
               Extracting skills, projects, and credentials
             </p>
           </Card>
         ) : resume ? (
           <Card>
             <CardHeader title={resume.personalInfo?.name || resume.name || 'Candidate'} icon={User} subtitle={resume.personalInfo?.email || resume.email} />
             <CardBody className="space-y-4">
               {resume.summary && (
                 <p className="text-sm text-gray-600 dark:text-gray-400 italic">"{resume.summary}"</p>
               )}
               <div>
                 <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Education</p>
                 {(resume.education || []).map((e, i) => (
                   <div key={i} className="text-sm text-gray-700 dark:text-gray-300">
                     {e.degree} — {e.institution} {e.year && `(${e.year})`} {e.cgpa && `· ${e.cgpa}`}
                   </div>
                 ))}
               </div>
             </CardBody>
           </Card>
         ) : (
           <Card className="flex items-center justify-center min-h-48">
             <div className="text-center p-6">
               <FileText size={36} className="text-gray-300 dark:text-gray-700 mx-auto mb-2" />
               <p className="text-sm text-gray-400">Upload your resume to see extracted data</p>
             </div>
           </Card>
         )}
       </div>
 
       {!extracting && resume && (
         <>
           {/* Skills */}
           <Card>
             <CardHeader title="Extracted Skills" icon={Code} subtitle={`${getResumeSkills().length} skills found`} />
             <CardBody>
               <div className="flex flex-wrap gap-2">
                 {getResumeSkills().map(s => <SkillPill key={s} skill={s} />)}
               </div>
              {(resume.technologiesUsed || []).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Technologies</p>
                  <div className="flex flex-wrap gap-2">
                    {resume.technologiesUsed.map(t => <SkillPill key={t} skill={t} />)}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Projects */}
          {(resume.projects || []).length > 0 && (
            <Card>
              <CardHeader title="Projects" icon={Briefcase} subtitle={`${resume.projects.length} projects found`} />
              <CardBody className="space-y-4">
                {resume.projects.map((p, i) => (
                  <div key={i} className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{p.name}</h4>
                      {p.duration && <span className="text-xs text-gray-400 flex-shrink-0">{p.duration}</span>}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{p.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {(p.technologies || []).map(t => <Badge key={t} variant="info" size="xs">{t}</Badge>)}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {/* Experience */}
          {(resume.experience || []).length > 0 && (
            <Card>
              <CardHeader title="Experience" icon={Briefcase} />
              <CardBody className="space-y-4">
                {resume.experience.map((e, i) => (
                  <div key={i} className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{e.role || e.title}</p>
                        <p className="text-sm text-brand-500">{e.company}</p>
                      </div>
                      <span className="text-xs text-gray-400">{e.duration}</span>
                    </div>
                    {e.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{e.description}</p>}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {/* Certifications */}
          {(resume.certifications || []).length > 0 && (
            <Card>
              <CardHeader title="Certifications & Achievements" icon={Award} />
              <CardBody>
                <div className="flex flex-wrap gap-2">
                  {[...resume.certifications, ...(resume.achievements || [])].map((c, i) => {
                    const text = typeof c === 'object' ? (c.name || c.title) : c;
                    return <Badge key={i} variant="success">{text}</Badge>;
                  })}
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
