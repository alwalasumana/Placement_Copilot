export function Card({ children, className = '', hover = false, gradient = false }) {
  return (
    <div
      className={`
        rounded-2xl border
        bg-white dark:bg-gray-900
        border-gray-200 dark:border-gray-800
        ${hover ? 'hover:border-brand-400 dark:hover:border-brand-600 hover:shadow-lg hover:shadow-brand-500/10 transition-all duration-200 cursor-pointer' : ''}
        ${gradient ? 'bg-gradient-to-br from-white to-brand-50/30 dark:from-gray-900 dark:to-brand-950/20' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, action, className = '' }) {
  return (
    <div className={`flex items-start justify-between p-6 pb-0 ${className}`}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
            <Icon size={20} className="text-brand-600 dark:text-brand-400" />
          </div>
        )}
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

export function StatCard({ label, value, icon: Icon, color = 'brand', trend, className = '' }) {
  const colors = {
    brand:  'from-brand-500   to-brand-600',
    green:  'from-green-500   to-green-600',
    yellow: 'from-yellow-500  to-orange-500',
    red:    'from-red-500     to-red-600',
    purple: 'from-purple-500  to-purple-600',
    cyan:   'from-cyan-500    to-cyan-600',
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{label}</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
            {trend && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{trend}</p>
            )}
          </div>
          {Icon && (
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors[color]} flex items-center justify-center shadow-lg`}>
              <Icon size={22} className="text-white" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
