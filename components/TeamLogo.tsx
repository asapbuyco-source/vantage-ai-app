
import React, { useState } from 'react';

interface TeamLogoProps {
  src?: string;
  teamName: string;
  className?: string;
}

export const TeamLogo: React.FC<TeamLogoProps> = ({ src, teamName, className = "w-8 h-8" }) => {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className={`${className} bg-slate-200 dark:bg-white/10 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 dark:text-gray-400 border border-slate-300 dark:border-white/10 shrink-0 select-none`}>
        {teamName.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img 
      src={src} 
      alt={teamName} 
      className={`${className} object-contain shrink-0`} 
      onError={() => setError(true)} 
      loading="lazy"
    />
  );
};
