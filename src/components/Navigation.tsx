import React from 'react';
import { LayoutDashboard, Key, Copy, FlaskConical } from 'lucide-react';
import { WhaleIcon } from './WhaleIcon';

export type TabId =
  | 'Dashboard'
  | 'Copy Trading'
  | 'Whales'
  | 'Simulation'
  | 'API'
  | 'KuCoinAPI'
  | 'BinanceAPI'
  | 'Settings';

interface NavigationProps {
  currentTab: TabId;
  onSelectTab: (tab: TabId) => void;
}

export const NAV_ITEMS: { id: TabId; labelAr: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'Dashboard', labelAr: 'الرئيسية', icon: LayoutDashboard },
  { id: 'Copy Trading', labelAr: 'Copy Trading', icon: Copy },
  { id: 'Whales', labelAr: 'Whales', icon: WhaleIcon },
  { id: 'Simulation', labelAr: 'التداول', icon: FlaskConical },
  { id: 'API', labelAr: 'ربط المنصات', icon: Key },
];

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onSelectTab }) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#12171D]/95 backdrop-blur-md border-t border-[#232E3A] z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.45)] nav-safe pl-safe pr-safe">
      <div className="max-w-4xl mx-auto flex items-center justify-around px-2 py-1 sm:py-1.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isSelected =
            currentTab === item.id ||
            (item.id === 'API' && (currentTab === 'KuCoinAPI' || currentTab === 'BinanceAPI'));

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              data-testid={`nav_${item.id}`}
              className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer select-none active:scale-95 touch-manipulation ${
                isSelected
                  ? 'text-[#01BC8D] font-bold'
                  : 'text-[#8A99AD] hover:text-white font-medium'
              }`}
            >
              {isSelected && (
                <span className="absolute top-0 inset-x-6 h-0.5 bg-[#01BC8D] rounded-full shadow-[0_0_8px_#01BC8D]" />
              )}
              <div
                className={`p-1.5 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-[#01BC8D]/15 text-[#01BC8D] ring-1 ring-[#01BC8D]/40 shadow-[0_0_12px_rgba(1,188,141,0.25)]'
                    : 'text-[#8A99AD]'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] sm:text-xs mt-0.5 truncate max-w-full">
                {item.labelAr}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
