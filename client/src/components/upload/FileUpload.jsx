import { useRef, useState } from 'react';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import Button from '../ui/Button';

const ACCEPT_MAP = {
  all: '.pdf,.docx,.doc,.txt,.pptx',
  document: '.pdf,.docx,.doc,.txt',
  pdf_docx: '.pdf,.docx,.doc',
};

export default function FileUpload({
  onUpload,
  accept = 'all',
  multiple = false,
  label = 'Upload Files',
  hint = 'Drag & drop or click to browse',
  maxMB = 50,
  loading = false,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [errors, setErrors] = useState([]);

  const validateFiles = (files) => {
    const valid = [];
    const errs = [];
    for (const f of files) {
      if (f.size > maxMB * 1024 * 1024) {
        errs.push(`${f.name}: exceeds ${maxMB}MB limit`);
      } else {
        valid.push(f);
      }
    }
    return { valid, errs };
  };

  const handleFiles = (files) => {
    const arr = Array.from(files);
    const { valid, errs } = validateFiles(arr);
    setErrors(errs);
    setSelectedFiles(multiple ? [...selectedFiles, ...valid] : valid.slice(0, 1));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (idx) =>
    setSelectedFiles((f) => f.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) return;
    try {
      await onUpload(selectedFiles);
      setSelectedFiles([]);
    } catch (err) {
      // Keep files selected on error so user can retry
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200
          ${dragging
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
            : 'border-gray-300 dark:border-gray-700 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_MAP[accept] || accept}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center
            ${dragging ? 'bg-brand-100 dark:bg-brand-900/40' : 'bg-gray-100 dark:bg-gray-800'}`}>
            <Upload size={24} className={dragging ? 'text-brand-500' : 'text-gray-400'} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>
            <p className="text-xs text-gray-400 mt-1">Max {maxMB}MB · {ACCEPT_MAP[accept] || accept}</p>
          </div>
        </div>
      </div>

      {/* Errors */}
      {errors.map((err, i) => (
        <div key={i} className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
          <AlertCircle size={14} />
          {err}
        </div>
      ))}

      {/* Selected files */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          {selectedFiles.map((file, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="w-8 h-8 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                <File size={14} className="text-brand-600 dark:text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <X size={14} className="text-gray-400" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {selectedFiles.length > 0 && (
        <Button
          onClick={handleSubmit}
          loading={loading}
          fullWidth
          icon={CheckCircle}
        >
          {loading ? 'Uploading...' : `Upload ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`}
        </Button>
      )}
    </div>
  );
}
