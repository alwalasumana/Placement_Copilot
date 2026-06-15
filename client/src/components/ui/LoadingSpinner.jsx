import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ size = 24, className = '' }) {
  return (
    <Loader2
      size={size}
      className={`animate-spin text-brand-500 ${className}`}
    />
  );
}

export function LoadingScreen({ message = 'Processing...' }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-4 animate-fade-in">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-gray-200 dark:border-gray-700" />
        <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">{message}</p>
    </div>
  );
}

export function AgentProgress({ agents = [], currentAgent, currentAgents = [], completed = false }) {
  const agentList = [
    { id: 'knowledge',  label: 'Knowledge Extraction' },
    { id: 'resume',     label: 'Resume Analysis' },
    { id: 'jd',         label: 'JD Analysis' },
    { id: 'mocktest',   label: 'Mock Test Generation' },
    { id: 'skillgap',   label: 'Skill Gap Analysis' },
    { id: 'roadmap',    label: 'Roadmap Generation' },
    { id: 'readiness',  label: 'Readiness Calculation' },
  ];

  // Support both single currentAgent (legacy) and currentAgents array (parallel)
  const activeSet = new Set([
    ...(Array.isArray(currentAgents) ? currentAgents : []),
    ...(currentAgent ? [currentAgent] : []),
  ]);

  return (
    <div className="space-y-3">
      {agentList.map((agent, i) => {
        const isDone = completed || agents.includes(agent.id);
        const isActive = !isDone && activeSet.has(agent.id);

        return (
          <div key={agent.id} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-300
              ${isDone ? 'bg-green-500 text-white' : isActive ? 'bg-brand-500 text-white animate-pulse' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>
              {isDone ? '✓' : i + 1}
            </div>
            <span className={`text-sm ${isActive ? 'text-brand-500 font-medium' : isDone ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>
              {agent.label}
            </span>
            {isActive && <Loader2 size={14} className="animate-spin text-brand-500 ml-auto" />}
          </div>
        );
      })}
    </div>
  );
}
