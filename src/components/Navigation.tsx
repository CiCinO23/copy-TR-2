import React from 'react';
import { LayoutDashboard, Key, Copy, CandlestickChart } from 'lucide-react';
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
  { id: 'Copy Trading', labelAr: 'المتداولون', icon: Copy },
  { id: 'Whales', labelAr: 'الحيتان', icon: WhaleIcon },
  { id: 'Simulation', labelAr: 'التداول', icon: CandlestickChart },
  { id: 'API', labelAr: 'المنصات', icon: Key },
];

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onSelectTab }) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#12171D]/95 backdrop-blur-md border-t border-[#1E2733] z-40 nav-safe pl-safe pr-safe">
      <div className="max-w-4xl mx-auto flex items-center justify-around px-1.5 py-1 sm:py-1.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isSelected =
            currentTab === item.id ||
            (item.id === 'API' && (currentTab === 'KuCoinAPI' || currentTab === 'BinanceAPI'));

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              data-testid={`nav_${item.id}`}
              className={`relative flex flex-col items-center justify-center flex-1 min-h-[46px] py-1 px-1 rounded-xl transition-colors cursor-pointer select-none touch-manipulation ${
                isSelected
                  ? 'text-[#01BC8D] font-bold'
                  : 'text-[#8A99AD] hover:text-[#F0F4F8] font-medium'
              }`}
            >
              {isSelected && (
                <span className="absolute top-0 inset-x-5 sm:inset-x-8 h-0.5 bg-[#01BC8D] rounded-full" />
              )}
              <div
                className={`p-1.5 rounded-xl transition-colors ${
                  isSelected
                    ? 'bg-[#01BC8D]/12 text-[#01BC8D]'
                    : 'text-[#8A99AD]'
                }`}
              >
                <Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
              </div>
              <span className="text-[10px] sm:text-xs mt-0.5 whitespace-nowrap shrink-0">
                {item.labelAr}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
