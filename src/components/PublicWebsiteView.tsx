import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  LogIn,
  MapPin,
  Scale,
  ShieldCheck,
  Sparkles,
  Tag,
} from 'lucide-react';
import {
  DiscountSlab,
  FulfillmentType,
  Hub,
  Order,
  PaymentMethod,
  PricingRule,
  ProductFormula,
  PromoItem,
  RiderTelemetry,
  RunningBanner,
  WaitlistEntry,
} from '../types/erp';
import {
  formatInr,
  resolveActiveBannersForSurface,
  resolveDiscountSlabs,
  resolvePricingRule,
} from '../utils/erpEngine';
import { RunningBannerBar } from './RunningBannerBar';
import { CustomerBookingView } from './CustomerBookingView';
import { SCALE_PROOF_IMAGE } from '../data/seedData';

interface PublicWebsiteViewProps {
  hubs: Hub[];
  orders: Order[];
  riders: RiderTelemetry[];
  pricingRules: PricingRule[];
  discountSlabs: DiscountSlab[];
  products: ProductFormula[];
  promos: PromoItem[];
  banners: RunningBanner[];
  waitlist: WaitlistEntry[];
  onOpenLogin: () => void;
  onCreateBooking: (payload: {
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    latitude: number;
    longitude: number;
    hubId: string;
    fulfillmentType: FulfillmentType;
    paymentMethod: PaymentMethod;
    serviceName: string;
    promoCode?: string;
  }) => Order;
  onCancelOrder: (orderId: string) => { ok: boolean; error?: string };
  onJoinWaitlist: (entry: Omit<WaitlistEntry, 'waitlistId' | 'createdAt'>) => void;
}

export const PublicWebsiteView: React.FC<PublicWebsiteViewProps> = ({
  hubs,
  orders,
  riders,
  pricingRules,
  discountSlabs,
  products,
  promos,
  banners,
  waitlist,
  onOpenLogin,
  onCreateBooking,
  onCancelOrder,
  onJoinWaitlist,
}) => {
  const globalRule = resolvePricingRule('GLOBAL', pricingRules);
  const globalSlabs = resolveDiscountSlabs('GLOBAL', discountSlabs);
  const publicAds = resolveActiveBannersForSurface(banners, 'PUBLIC_WEBSITE', 'ALL');
  const publishedServices = products.filter((p) => p.isPublished);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-900 flex flex-col">
      {/* Top Public Website Navbar — ONLY 1 Highlighted Primary Login Button */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <span className="font-display text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
              InstaWash
            </span>
            <nav aria-label="Public website navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <button
                type="button"
                onClick={() => scrollToSection('public-ads')}
                className="hover:text-slate-900 transition-colors"
              >
                Brand Offers
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('public-pricing')}
                className="hover:text-slate-900 transition-colors"
              >
                Services &amp; Rates
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('public-booking')}
                className="hover:text-slate-900 transition-colors"
              >
                10-Min Pickup
              </button>
            </nav>
          </div>

          {/* Single Highlighted Login Button for ALL Roles & Customers */}
          <button
            type="button"
            onClick={onOpenLogin}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0284C7] hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
            Login
          </button>
        </div>

        {/* Live Running Banner Ad Marquee controlled by Super Admin */}
        <RunningBannerBar
          banners={banners}
          surface="PUBLIC_WEBSITE"
          hubId="ALL"
          hubs={hubs}
          onBannerAction={() => scrollToSection('public-booking')}
        />
      </header>

      <main className="flex-1">
        {/* Brand Hero & Live Digital Weighing Proof */}
        <section className="bg-[#0F172A] text-white border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="text-xs font-mono uppercase tracking-wider text-sky-400 font-semibold">
                {hubs.filter((h) => h.isActive).map((h) => h.city).join(' · ')}
              </div>
              <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] text-white">
                10-Min Pickup. Premium Care. All Things Online.
              </h1>
              <p className="text-base text-slate-300 max-w-2xl leading-relaxed">
                Hyper-local doorstep garment pickup inside 2.5 km hub geofences, certified digital weighing with cryptographic bill locking, automatic up to 30% bulk discounts, and flexible Pay-on-Delivery or UPI settlement.
              </p>

              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-800 max-w-xl">
                <div>
                  <div className="font-mono text-2xl font-bold text-white tabular-nums">
                    {formatInr(globalRule.ratePerKg).replace('.00', '')}
                  </div>
                  <div className="text-xs text-slate-400">Base Rate / Kg</div>
                </div>
                <div>
                  <div className="font-mono text-2xl font-bold text-sky-400 tabular-nums">
                    ~10 min
                  </div>
                  <div className="text-xs text-slate-400">Doorstep Pickup</div>
                </div>
                <div>
                  <div className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                    Up to 30%
                  </div>
                  <div className="text-xs text-slate-400">Auto Slab Savings</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => scrollToSection('public-booking')}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Check 10-Min Coverage &amp; Book
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
                <span className="text-xs text-slate-400">
                  Customer, Franchise Partner, Staff, or Admin? Click <strong className="text-white">Login</strong> above.
                </span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <img
                  src={SCALE_PROOF_IMAGE}
                  alt="Certified digital weighing scale showing 3.50 kg laundry bag at doorstep"
                  className="w-full aspect-[4/3] object-cover"
                />
                <div className="p-4 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-200 font-medium">
                    <Scale className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
                    Certified Doorstep Weighing &amp; SHA-256 Bill Lock
                  </div>
                  <span className="font-mono text-emerald-400 font-semibold whitespace-nowrap">
                    100% Transparent
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Brand Advertisement & Running Offers Showcase */}
        {publicAds.length > 0 && (
          <section id="public-ads" className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Featured Brand Promotions &amp; Active Campaigns
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Live advertisements published from InstaWash HQ Banner Management
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {publicAds.length} active ad(s)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {publicAds.map((ad) => {
                const hub = hubs.find((h) => h.hubId === ad.hubId);
                return (
                  <article
                    key={ad.bannerId}
                    className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs font-mono text-sky-700 font-semibold">
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                          {hub ? `${hub.city} (${hub.code})` : 'All Cities'}
                        </span>
                        {ad.promoCode && (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Tag className="w-3 h-3" aria-hidden="true" />
                            {ad.promoCode}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-slate-900">{ad.title}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed">{ad.tickerText}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => scrollToSection('public-booking')}
                      className="text-xs font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 w-fit"
                    >
                      {ad.ctaLabel || 'Book with this Offer'}
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Services, Dynamic Pricing & Discount Tiers */}
        <section id="public-pricing" className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Garment Care Services &amp; Retail Products
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Synced directly with InstaWash Central Catalog &amp; Product Making Studio
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {publishedServices.map((svc) => (
                  <div key={svc.productId} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{svc.name}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {svc.sku} · Turnaround ~{svc.turnaroundHours}h
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="text-sm font-bold text-slate-900">
                        {formatInr(svc.sellingPrice)}
                      </div>
                      <div className="text-[11px] text-slate-500">per {svc.unitType}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Automatic Volume Discount Slabs
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Applied automatically after doorstep weighing — zero coupons needed
                </p>
              </div>
              <div className="space-y-2.5">
                {globalSlabs.map((slab) => (
                  <div
                    key={slab.slabId}
                    className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{slab.label}</div>
                      <div className="text-xs font-mono text-slate-500 tabular-nums">
                        ₹{slab.minAmount.toLocaleString('en-IN')} –{' '}
                        {slab.maxAmount >= 99999 ? '∞' : `₹${slab.maxAmount.toLocaleString('en-IN')}`}
                      </div>
                    </div>
                    <span className="font-mono text-base font-bold text-emerald-700 tabular-nums">
                      {slab.discountPercent}% OFF
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-slate-200 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  Office / Store Self-Pickup: <strong className="font-mono text-slate-900">{formatInr(globalRule.officePickupFee)}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-sky-600 shrink-0" aria-hidden="true" />
                  Home Drop-off: <strong className="font-mono text-slate-900">{formatInr(globalRule.homeDeliveryFee)}</strong> (Free above ₹{globalRule.freeDeliveryThreshold})
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
                  4-Digit Security OTP + Cash / UPI Pay on Delivery
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live 10-Min Pickup Booking & Coverage Validator */}
        <section id="public-booking" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900 inline-flex items-center gap-2">
                <MapPin className="w-5 h-5 text-sky-700" aria-hidden="true" />
                Live 10-Min Pickup Geofence &amp; Quick Booking
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Book directly below, or click <strong className="text-slate-800">Login</strong> at the top right to register your dedicated Customer Panel.
              </p>
            </div>
          </div>
          <CustomerBookingView
            hubs={hubs}
            orders={orders}
            riders={riders}
            pricingRules={pricingRules}
            discountSlabs={discountSlabs}
            products={products}
            promos={promos}
            waitlist={waitlist}
            onCreateBooking={onCreateBooking}
            onCancelOrder={onCancelOrder}
            onJoinWaitlist={onJoinWaitlist}
          />
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <strong className="text-slate-800">InstaWash</strong> · Multi-Branch &amp; Franchise Laundry Care Network ({hubs.map((h) => h.city).join(', ')})
          </div>
          <div>
            Active Hubs: <span className="font-mono text-slate-700">{hubs.map((h) => h.code).join(' · ')}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
