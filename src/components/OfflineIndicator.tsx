import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-lg bg-[#1A1C22] border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-300 shadow-xl">
      <WifiOff className="w-3.5 h-3.5" />
      <span>Offline-Modus — Alle Werkzeuge & lokale Projekte verfügbar</span>
    </div>
  );
};
