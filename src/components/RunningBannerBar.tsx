import React from 'react';
import { Megaphone, Sparkles } from 'lucide-react';
import { BannerTheme, Hub, RunningBanner } from '../types/erp';
import { resolveActiveBannersForSurface } from '../utils/erpEngine';

interface RunningBannerBarProps {
  banners: RunningBanner[];
  surface: 'PUBLIC_WEBSITE' | 'FRANCHISE_PORTAL';
  hubId: string;
  hubs: Hub[];
  onBannerAction?: (banner: RunningBanner) => void;
}

const THEME_STYLES: Record<BannerTheme, { bar: string; cta: string; label: string }> = {
  OCEAN: {
    bar: 'bg-[#0284C7] text-white border-sky-700',
    cta: 'bg-white text-sky-900 hover:bg-sky-50',
    label: 'text-sky-100',
  },
  SLATE: {
    bar: 'bg-[#0F172A] text-white border-slate-800',
    cta: 'bg-sky-500 text-white hover:bg-sky-400',
    label: 'text-slate-300',
  },
  EMERALD: {
    bar: 'bg-[#047857] text-white border-emerald-800',
    cta: 'bg-white text-emerald-900 hover:bg-emerald-50',
    label: 'text-emerald-100',
  },
  AMBER: {
    bar: 'bg-[#B45309] text-white border-amber-800',
    cta: 'bg-white text-amber-950 hover:bg-amber-50',
    label: 'text-amber-100',
  },
};

export const RunningBannerBar: React.FC<RunningBannerBarProps> = ({
  banners,
  surface,
  hubId,
  hubs,
  onBannerAction,
}) => {
  const activeBanners = resolveActiveBannersForSurface(banners, surface, hubId);
  if (activeBanners.length === 0) return null;

  const lead = activeBanners[0];
  const style = THEME_STYLES[lead.theme] ?? THEME_STYLES.OCEAN;
  const durationSec = Math.max(12, Math.min(90, lead.speedSeconds || 28));

  const renderTickerSet = (keyPrefix: string) => (
    <div className="flex items-center shrink-0 gap-8 pr-8">
      {activeBanners.map((banner) => {
        const hub = hubs.find((h) => h.hubId === banner.hubId);
        return (
          <div key={`${keyPrefix}-${banner.bannerId}`} className="flex items-center gap-3 shrink-0">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider font-semibold ${style.label}`}>
              {surface === 'PUBLIC_WEBSITE' ? (
                <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Megaphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              {hub ? hub.code : 'ALL HUBS'}
            </span>
            <span className="text-xs sm:text-[13px] font-medium whitespace-nowrap">
              {banner.tickerText}
            </span>
            {banner.ctaLabel && onBannerAction && (
              <button
                type="button"
                onClick={() => onBannerAction(banner)}
                className={`px-2.5 py-0.5 text-[11px] font-semibold rounded transition-colors whitespace-nowrap ${style.cta}`}
              >
                {banner.ctaLabel}
              </button>
            )}
            <span className="opacity-40 select-none" aria-hidden="true">
              /
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      role="region"
      aria-label={
        surface === 'PUBLIC_WEBSITE'
          ? 'Live promotional announcements'
          : 'Franchise portal announcements'
      }
      className={`w-full overflow-hidden border-b py-2 ${style.bar}`}
    >
      <div
        className="banner-marquee-track"
        style={{ ['--marquee-duration' as string]: `${durationSec}s` }}
      >
        {renderTickerSet('a')}
        {renderTickerSet('b')}
      </div>
    </div>
  );
};
