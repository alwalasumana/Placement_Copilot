import { useEffect, useState } from 'react';
import { BookOpen, Trash2, RefreshCw, File, Database, CheckCircle } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../components/ui/Card';
import FileUpload from '../components/upload/FileUpload';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import api from '../utils/api';
import toast from 'react-hot-toast';
import ConfirmationModal from '../components/ui/ConfirmationModal';

export default function KnowledgeBase() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [stats, setStats] = useState(null);
  const [fileToDelete, setFileToDelete] = useState(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/upload');
      setFiles((res.data.files || []).filter(f => f.fileType === 'knowledge'));
      setStats(res.data.knowledgeStats);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFiles(); }, []);

  const handleUpload = async (selectedFiles) => {
    setUploading(true);
    const formData = new FormData();
    selectedFiles.forEach(f => formData.append('files', f));
    try {
      const res = await api.post('/upload/knowledge', formData);
      toast.success(res.data.message);
      fetchFiles();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (fileId) => {
    setFileToDelete(fileId);
  };

  const handleConfirmDelete = async () => {
    if (!fileToDelete) return;
    try {
      await api.delete(`/upload/${fileToDelete}`);
      toast.success('File deleted');
      fetchFiles();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setFileToDelete(null);
    }
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const res = await api.post('/upload/reindex');
      toast.success(res.data.message);
      fetchFiles();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReindexing(false);
    }
  };

  const SUPPORTED = ['PDF', 'DOCX', 'TXT', 'PPT', 'DOC'];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Knowledge Base</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Upload company-specific materials: previous questions, OA papers, notes, PDFs
          </p>
        </div>
        {files.length > 0 && (
          <Button onClick={handleReindex} loading={reindexing} variant="secondary" icon={RefreshCw} size="sm">
            Re-index
          </Button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Files Uploaded', value: files.length },
            { label: 'Indexed Chunks', value: stats.count || 0 },
            { label: 'Indexed Files', value: files.filter(f => f.indexed).length },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardBody className="py-4 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upload */}
        <Card>
          <CardHeader title="Upload Materials" icon={BookOpen} subtitle="Drag & drop up to 10 files at once" />
          <CardBody>
            <div className="mb-4 flex flex-wrap gap-2">
              {SUPPORTED.map(t => <Badge key={t} variant="brand">{t}</Badge>)}
            </div>
            <FileUpload
              onUpload={handleUpload}
              accept="all"
              multiple
              label="Upload Knowledge Base Files"
              hint="Previous questions, OA papers, notes, PDFs, PPTs"
              loading={uploading}
            />
          </CardBody>
        </Card>

        {/* Supported content */}
        <Card>
          <CardHeader title="What to Upload" icon={Database} subtitle="For best results, upload these" />
          <CardBody>
            <div className="space-y-3">
              {[
                { type: 'Interview Questions', desc: 'Previous year company-specific questions' },
                { type: 'OA Papers', desc: 'Online assessment question papers' },
                { type: 'Placement PDFs', desc: 'Placement preparation guides' },
                { type: 'Technical Notes', desc: 'Subject-wise technical notes' },
                { type: 'Interview Experiences', desc: 'Candidate experiences from platforms' },
                { type: 'PPTs & DOCX', desc: 'Presentation slides and documents' },
              ].map(({ type, desc }) => (
                <div key={type} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                  <File size={14} className="text-brand-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{type}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Files list */}
      {files.length > 0 && (
        <Card>
          <CardHeader title={`Uploaded Files (${files.length})`} icon={File} />
          <CardBody>
            <div className="space-y-2">
              {files.map((file) => (
                <div key={file._id} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="w-9 h-9 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                    <File size={16} className="text-brand-600 dark:text-brand-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.originalName}</p>
                    <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB · {new Date(file.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {file.indexed
                      ? <Badge variant="success"><CheckCircle size={10} className="mr-1" />Indexed</Badge>
                      : <Badge variant="warning">Pending</Badge>
                    }
                    <button onClick={() => handleDelete(file._id)}
                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-400 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <ConfirmationModal
        isOpen={!!fileToDelete}
        onClose={() => setFileToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete File"
        message="Are you sure you want to delete this file from the knowledge base? This action cannot be undone."
        confirmText="Delete File"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}
