export default function Badge({ children, variant = 'default', size = 'sm' }) {
  const variants = {
    default:  'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    brand:    'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400',
    success:  'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
    warning:  'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400',
    danger:   'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
    info:     'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400',
    purple:   'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400',
  };

  const sizes = {
    xs: 'text-xs px-1.5 py-0.5',
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-2.5 py-1',
  };

  return (
    <span className={`inline-flex items-center font-medium rounded-lg ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
}
