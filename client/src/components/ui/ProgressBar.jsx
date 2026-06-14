export default function ProgressBar({
  value = 0,
  max = 100,
  label,
  showValue = true,
  color = 'brand',
  size = 'md',
  animated = true,
  className = '',
}) {
  const pct = Math.min(100, Math.max(0, Math.round((value / max) * 100)));

  const colors = {
    brand:  'bg-brand-500',
    green:  'bg-green-500',
    yellow: 'bg-yellow-500',
    red:    'bg-red-500',
    purple: 'bg-purple-500',
    cyan:   'bg-cyan-500',
  };

  const barColor = pct >= 70 ? colors.green : pct >= 40 ? colors.yellow : colors.red;

  const sizes = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  return (
    <div className={`w-full ${className}`}>
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>}
          {showValue && <span className="text-sm font-bold text-gray-900 dark:text-white">{pct}%</span>}
        </div>
      )}
      <div className={`w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden ${sizes[size]}`}>
        <div
          className={`${sizes[size]} rounded-full ${barColor} transition-all duration-700 ease-out
            ${animated ? 'animate-pulse-slow' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
