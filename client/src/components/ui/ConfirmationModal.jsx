import { AlertTriangle, X } from 'lucide-react';
import Button from './Button';

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger' // 'danger' | 'warning' | 'info'
}) {
  if (!isOpen) return null;

  const typeColorMap = {
    danger: {
      iconBg: 'bg-red-50 dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
      confirmVariant: 'danger',
    },
    warning: {
      iconBg: 'bg-yellow-50 dark:bg-yellow-900/20',
      iconColor: 'text-yellow-600 dark:text-yellow-400',
      confirmVariant: 'primary',
    },
    info: {
      iconBg: 'bg-brand-50 dark:bg-brand-900/20',
      iconColor: 'text-brand-600 dark:text-brand-400',
      confirmVariant: 'primary',
    }
  };

  const currentType = typeColorMap[type] || typeColorMap.info;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-gray-950/60 dark:bg-gray-950/80 backdrop-blur-sm transition-opacity animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800/80 rounded-2xl w-full max-w-md shadow-2xl relative z-10 overflow-hidden animate-scale-in">
        {/* Header decoration banner */}
        <div className="h-1.5 bg-gradient-to-r from-brand-500 via-pink-500 to-red-500" />
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-850 transition-colors"
        >
          <X size={16} />
        </button>
        
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl flex-shrink-0 ${currentType.iconBg}`}>
              <AlertTriangle size={24} className={currentType.iconColor} />
            </div>
            
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {message}
              </p>
            </div>
          </div>
          
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button 
              variant="secondary" 
              onClick={onClose}
              className="px-5"
            >
              {cancelText}
            </Button>
            <Button 
              variant={currentType.confirmVariant} 
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="px-5 font-semibold"
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
