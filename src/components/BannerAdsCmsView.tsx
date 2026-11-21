import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Megaphone,
  PauseCircle,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { BannerPlacement, BannerTheme, Hub, RunningBanner } from '../types/erp';
import { RunningBannerBar } from './RunningBannerBar';

interface BannerAdsCmsViewProps {
  banners: RunningBanner[];
  hubs: Hub[];
  onSaveBanner: (banner: RunningBanner) => void;
  onToggleBanner: (bannerId: string) => void;
  onDeleteBanner: (bannerId: string) => void;
}

export const BannerAdsCmsView: React.FC<BannerAdsCmsViewProps> = ({
  banners,
  hubs,
  onSaveBanner,
  onToggleBanner,
  onDeleteBanner,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [tickerText, setTickerText] = useState('');
  const [placement, setPlacement] = useState<BannerPlacement>('PUBLIC_WEBSITE');
  const [hubId, setHubId] = useState('GLOBAL');
  const [ctaLabel, setCtaLabel] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [theme, setTheme] = useState<BannerTheme>('OCEAN');
  const [speedSeconds, setSpeedSeconds] = useState(26);
  const [priority, setPriority] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [previewSurface, setPreviewSurface] = useState<'PUBLIC_WEBSITE' | 'FRANCHISE_PORTAL'>('PUBLIC_WEBSITE');
  const [previewHubId, setPreviewHubId] = useState('GLOBAL');
  const [feedback, setFeedback] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setTickerText('');
    setPlacement('PUBLIC_WEBSITE');
    setHubId('GLOBAL');
    setCtaLabel('');
    setPromoCode('');
    setTheme('OCEAN');
    setSpeedSeconds(26);
    setPriority(banners.length + 1);
    setIsActive(true);
  };

  const handleLoadForEdit = (b: RunningBanner) => {
    setEditingId(b.bannerId);
    setTitle(b.title);
    setTickerText(b.tickerText);
    setPlacement(b.placement);
    setHubId(b.hubId);
    setCtaLabel(b.ctaLabel);
    setPromoCode(b.promoCode);
    setTheme(b.theme);
    setSpeedSeconds(b.speedSeconds);
    setPriority(b.priority);
    setIsActive(b.isActive);
    setFeedback(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2 || tickerText.trim().length < 4) return;
    const now = new Date().toISOString();
    const existing = editingId ? banners.find((b) => b.bannerId === editingId) : null;
    const nextBanner: RunningBanner = {
      bannerId: editingId ?? `bnr_${Date.now()}`,
      title: title.trim(),
      tickerText: tickerText.trim(),
      placement,
      hubId,
      ctaLabel: ctaLabel.trim(),
      promoCode: promoCode.trim().toUpperCase(),
      theme,
      speedSeconds: Math.max(10, Math.min(90, Number(speedSeconds) || 26)),
      priority: Math.max(1, Math.min(99, Number(priority) || 1)),
      isActive,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    onSaveBanner(nextBanner);
    setFeedback(
      editingId
        ? `Updated running banner "${nextBanner.title}". Live immediately on selected placements.`
        : `Published new running banner "${nextBanner.title}" to ${nextBanner.placement}.`
    );
    resetForm();
  };

  return (
    <div className="space-y-6">
      {/* Live Preview Panel */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
              <Eye className="w-4 h-4 text-sky-700" aria-hidden="true" />
              Live Running Banner &amp; Ad Ticker Preview
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Hover over the marquee to pause. Changes published below go live immediately on the Public Website and Franchise Portals.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setPreviewSurface('PUBLIC_WEBSITE')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  previewSurface === 'PUBLIC_WEBSITE'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Public Website
              </button>
              <button
                type="button"
                onClick={() => setPreviewSurface('FRANCHISE_PORTAL')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  previewSurface === 'FRANCHISE_PORTAL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Franchise Portal
              </button>
            </div>
            <select
              aria-label="Preview location scope"
              value={previewHubId}
              onChange={(e) => setPreviewHubId(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg text-slate-700"
            >
              <option value="GLOBAL">Global Only</option>
              {hubs.map((h) => (
                <option key={h.hubId} value={h.hubId}>
                  {h.name} ({h.code})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="bg-slate-50 py-3">
          <RunningBannerBar
            banners={banners}
            surface={previewSurface}
            hubId={previewHubId}
            hubs={hubs}
          />
        </div>
      </section>

      {/* Main Split: Form + Active Banner Table */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <form
          onSubmit={handleSubmit}
          className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-sky-700" aria-hidden="true" />
              {editingId ? 'Edit Running Banner Ad' : 'Create New Running Banner Ad'}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
              >
                Cancel Edit
              </button>
            )}
          </div>

          {feedback && (
            <div
              role="status"
              className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800"
            >
              {feedback}
            </div>
          )}

          <div>
            <label htmlFor="bnr-title" className="block text-xs font-medium text-slate-700 mb-1">
              Campaign / Ad Headline
            </label>
            <input
              id="bnr-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Monsoon Express 10-Min Wash Offer"
              maxLength={100}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label htmlFor="bnr-ticker" className="block text-xs font-medium text-slate-700 mb-1">
              Running Ticker &amp; Ad Copy
            </label>
            <textarea
              id="bnr-ticker"
              rows={3}
              value={tickerText}
              onChange={(e) => setTickerText(e.target.value)}
              placeholder="Enter scrolling advertisement or franchise announcement text..."
              maxLength={400}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bnr-placement" className="block text-xs font-medium text-slate-700 mb-1">
                Target Placement
              </label>
              <select
                id="bnr-placement"
                value={placement}
                onChange={(e) => setPlacement(e.target.value as BannerPlacement)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="PUBLIC_WEBSITE">Public Website Ads Only</option>
                <option value="FRANCHISE_PORTAL">Franchise Portal Only</option>
                <option value="BOTH">Both Public Website &amp; Franchise</option>
              </select>
            </div>
            <div>
              <label htmlFor="bnr-hub" className="block text-xs font-medium text-slate-700 mb-1">
                Location / Hub Target
              </label>
              <select
                id="bnr-hub"
                value={hubId}
                onChange={(e) => setHubId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="GLOBAL">All Locations (GLOBAL)</option>
                {hubs.map((h) => (
                  <option key={h.hubId} value={h.hubId}>
                    {h.name} ({h.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="bnr-cta" className="block text-xs font-medium text-slate-700 mb-1">
                CTA Button Label (Optional)
              </label>
              <input
                id="bnr-cta"
                type="text"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="Apply INSTA10MIN"
                maxLength={60}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="bnr-promo" className="block text-xs font-medium text-slate-700 mb-1">
                Auto-Apply Promo Code
              </label>
              <input
                id="bnr-promo"
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="INSTA10MIN"
                maxLength={32}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="bnr-theme" className="block text-xs font-medium text-slate-700 mb-1">
                Color Theme
              </label>
              <select
                id="bnr-theme"
                value={theme}
                onChange={(e) => setTheme(e.target.value as BannerTheme)}
                className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="OCEAN">Ocean Blue</option>
                <option value="SLATE">Dark Slate</option>
                <option value="EMERALD">Emerald</option>
                <option value="AMBER">Amber Alert</option>
              </select>
            </div>
            <div>
              <label htmlFor="bnr-speed" className="block text-xs font-medium text-slate-700 mb-1">
                Speed (sec)
              </label>
              <input
                id="bnr-speed"
                type="number"
                min={10}
                max={90}
                value={speedSeconds}
                onChange={(e) => setSpeedSeconds(Number(e.target.value))}
                className="w-full px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="bnr-priority" className="block text-xs font-medium text-slate-700 mb-1">
                Order #
              </label>
              <input
                id="bnr-priority"
                type="number"
                min={1}
                max={99}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-300 text-sky-700 focus:ring-sky-600"
            />
            Publish immediately as active running banner
          </label>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {editingId ? 'Save Banner Changes' : 'Publish Running Banner'}
          </button>
        </form>

        {/* Active & Configured Banner Directory */}
        <section className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">
              Configured Website &amp; Franchise Running Banners ({banners.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Super Admin exclusive ad manager — franchises cannot edit global brand advertisements.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {banners.map((b) => {
              const hub = hubs.find((h) => h.hubId === b.hubId);
              return (
                <div key={b.bannerId} className="p-4 hover:bg-slate-50 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-slate-500">
                          #{b.priority}
                        </span>
                        <span className="text-sm font-bold text-slate-900">{b.title}</span>
                        <span
                          className={`text-[11px] font-mono font-semibold ${
                            b.isActive ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {b.isActive ? 'RUNNING' : 'PAUSED'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{b.tickerText}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleBanner(b.bannerId)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        {b.isActive ? (
                          <>
                            <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                            Pause
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                            Activate
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${b.title}`}
                        onClick={() => handleLoadForEdit(b)}
                        className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-sky-50 rounded-md"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${b.title}`}
                        onClick={() => onDeleteBanner(b.bannerId)}
                        className="p-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-md"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-slate-500">
                    <span>Placement: {b.placement}</span>
                    <span>Location: {hub ? `${hub.name} (${hub.code})` : 'All Locations'}</span>
                    <span>Theme: {b.theme}</span>
                    <span>Speed: {b.speedSeconds}s</span>
                    {b.promoCode && <span>Promo: {b.promoCode}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
