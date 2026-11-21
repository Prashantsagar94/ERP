import React, { useMemo, useState } from 'react';
import {
  Building2,
  Percent,
  Plus,
  Save,
  Sliders,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  DiscountSlab,
  FranchiseTier,
  Hub,
  PricingRule,
  PromoItem,
  WorkflowStageConfig,
} from '../types/erp';

interface DynamicConfigViewProps {
  hubs: Hub[];
  pricingRules: PricingRule[];
  discountSlabs: DiscountSlab[];
  workflowStages: WorkflowStageConfig[];
  promos: PromoItem[];
  onSavePricingRule: (rule: PricingRule) => void;
  onSaveDiscountSlabs: (slabs: DiscountSlab[]) => void;
  onSaveHub: (hub: Hub) => void;
  onSaveWorkflowStages: (stages: WorkflowStageConfig[]) => void;
  onSavePromos: (promos: PromoItem[]) => void;
}

export const DynamicConfigView: React.FC<DynamicConfigViewProps> = ({
  hubs,
  pricingRules,
  discountSlabs,
  workflowStages,
  promos,
  onSavePricingRule,
  onSaveDiscountSlabs,
  onSaveHub,
  onSaveWorkflowStages,
  onSavePromos,
}) => {
  const [scopeHubId, setScopeHubId] = useState<string>('GLOBAL');
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const baseRule = useMemo(() => {
    const exact = pricingRules.find((r) => r.hubId === scopeHubId);
    if (exact) return exact;
    const global = pricingRules.find((r) => r.hubId === 'GLOBAL') ?? pricingRules[0];
    return {
      ...global,
      ruleId: `rule_${scopeHubId}`,
      hubId: scopeHubId,
    };
  }, [pricingRules, scopeHubId]);

  const [draftRule, setDraftRule] = useState<PricingRule>(baseRule);

  // Sync draft when scope changes
  React.useEffect(() => {
    setDraftRule(baseRule);
  }, [baseRule]);

  const [draftSlabs, setDraftSlabs] = useState<DiscountSlab[]>(discountSlabs);
  React.useEffect(() => {
    setDraftSlabs(discountSlabs);
  }, [discountSlabs]);

  const [draftStages, setDraftStages] = useState<WorkflowStageConfig[]>(workflowStages);
  const [draftPromos, setDraftPromos] = useState<PromoItem[]>(promos);

  // Add new Hub form state
  const [newHubName, setNewHubName] = useState('');
  const [newHubCity, setNewHubCity] = useState('');
  const [newHubCode, setNewHubCode] = useState('');
  const [newHubRadius, setNewHubRadius] = useState('2.5');
  const [newHubTier, setNewHubTier] = useState<FranchiseTier>(FranchiseTier.STANDARD_HUB);
  const [newHubPartnerPct, setNewHubPartnerPct] = useState('80');

  // Add new Promo state
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoTitle, setNewPromoTitle] = useState('');
  const [newPromoPct, setNewPromoPct] = useState('5');

  const notifySaved = (msg: string) => {
    setSaveToast(msg);
    window.setTimeout(() => setSaveToast(null), 4000);
  };

  const handlePricingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSavePricingRule({
      ...draftRule,
      updatedAt: new Date().toISOString(),
    });
    notifySaved(`Published dynamic pricing & payment rules for ${scopeHubId === 'GLOBAL' ? 'Global Default' : scopeHubId}.`);
  };

  const handleAddSlab = () => {
    setDraftSlabs((prev) => [
      ...prev,
      {
        slabId: `slab_${Date.now()}`,
        hubId: scopeHubId,
        label: 'Custom Tier',
        minAmount: 1500,
        maxAmount: 999999,
        discountPercent: 35,
        isActive: true,
        sortOrder: prev.length + 1,
      },
    ]);
  };

  const handleCommitSlabs = () => {
    onSaveDiscountSlabs(draftSlabs);
    notifySaved('Updated Discount Tier Matrix. Customer & Rider billing engines recalculated immediately.');
  };

  const handleCreateHub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHubName.trim() || !newHubCity.trim() || !newHubCode.trim()) return;
    const partnerPct = Math.max(0, Math.min(100, parseFloat(newHubPartnerPct) || 80));
    const created: Hub = {
      hubId: `hub_${newHubCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      code: newHubCode.trim().toUpperCase(),
      name: newHubName.trim(),
      city: newHubCity.trim(),
      latitude: 26.85 + Math.random() * 0.12,
      longitude: 81.0 + Math.random() * 0.25,
      geofenceRadiusKm: Math.max(0.5, parseFloat(newHubRadius) || 2.5),
      franchiseTier: newHubTier,
      partnerSharePercent: partnerPct,
      royaltyPercent: Number((100 - partnerPct).toFixed(2)),
      openHours: '07:00 – 22:00',
      isActive: true,
    };
    onSaveHub(created);
    setNewHubName('');
    setNewHubCity('');
    setNewHubCode('');
    notifySaved(`Provisioned new franchise hub ${created.name} (${created.code}).`);
  };

  const handleAddPromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromoCode.trim() || !newPromoTitle.trim()) return;
    const updated: PromoItem[] = [
      {
        promoId: `prm_${Date.now()}`,
        code: newPromoCode.trim().toUpperCase(),
        title: newPromoTitle.trim(),
        description: `Extra ${newPromoPct}% off on eligible orders.`,
        hubId: 'GLOBAL',
        extraDiscountPercent: Math.max(1, Math.min(50, parseFloat(newPromoPct) || 5)),
        status: 'ACTIVE',
        validUntil: '2027-03-31',
      },
      ...draftPromos,
    ];
    setDraftPromos(updated);
    onSavePromos(updated);
    setNewPromoCode('');
    setNewPromoTitle('');
    notifySaved(`Published promotional coupon ${newPromoCode.trim().toUpperCase()}.`);
  };

  return (
    <div className="space-y-6">
      {/* Header Scope Switcher */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Dynamic Configuration Engine (100% Admin-Editable Business Rules)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Zero hardcoded rates or limits. Every edit updates billing, geofencing, dispatch SLA alerts, and franchise settlements instantaneously.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="config-scope" className="text-xs font-semibold text-slate-700 whitespace-nowrap">
            Rule Scope
          </label>
          <select
            id="config-scope"
            value={scopeHubId}
            onChange={(e) => setScopeHubId(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-600"
          >
            <option value="GLOBAL">Global Launch Defaults</option>
            {hubs.map((h) => (
              <option key={h.hubId} value={h.hubId}>
                Hub Override: {h.name} ({h.code})
              </option>
            ))}
          </select>
        </div>
      </section>

      {saveToast && (
        <div role="status" className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800">
          {saveToast}
        </div>
      )}

      {/* 1. Core Pricing, Fees, Min Order & Payment Switches */}
      <form onSubmit={handlePricingSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
            <Sliders className="w-4 h-4 text-slate-600" aria-hidden="true" />
            Pricing, Fulfillment Fees, Minimum Thresholds &amp; Payment Controls
          </h3>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            Publish Pricing Rules
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="cfg-rate-kg" className="block text-xs font-medium text-slate-700 mb-1">
              Base Price per Kg (₹)
            </label>
            <input
              id="cfg-rate-kg"
              type="number"
              step="1"
              value={draftRule.ratePerKg}
              onChange={(e) => setDraftRule({ ...draftRule, ratePerKg: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="cfg-home-fee" className="block text-xs font-medium text-slate-700 mb-1">
              Home Delivery Fee (₹)
            </label>
            <input
              id="cfg-home-fee"
              type="number"
              step="1"
              value={draftRule.homeDeliveryFee}
              onChange={(e) => setDraftRule({ ...draftRule, homeDeliveryFee: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="cfg-office-fee" className="block text-xs font-medium text-slate-700 mb-1">
              Office / Store Self-Pickup Fee (₹)
            </label>
            <input
              id="cfg-office-fee"
              type="number"
              step="1"
              value={draftRule.officePickupFee}
              onChange={(e) => setDraftRule({ ...draftRule, officePickupFee: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="cfg-free-del" className="block text-xs font-medium text-slate-700 mb-1">
              Free Delivery Threshold (₹, 0=Off)
            </label>
            <input
              id="cfg-free-del"
              type="number"
              step="50"
              value={draftRule.freeDeliveryThreshold}
              onChange={(e) => setDraftRule({ ...draftRule, freeDeliveryThreshold: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 pt-5">
            <input
              id="cfg-min-toggle"
              type="checkbox"
              checked={draftRule.minOrderEnabled}
              onChange={(e) => setDraftRule({ ...draftRule, minOrderEnabled: e.target.checked })}
              className="rounded border-slate-300 text-sky-700"
            />
            <label htmlFor="cfg-min-toggle" className="text-xs font-semibold text-slate-800">
              Enforce Minimum Billing Floor
            </label>
          </div>
          <div>
            <label htmlFor="cfg-min-kg" className="block text-xs font-medium text-slate-700 mb-1">
              Minimum Order Weight (Kg)
            </label>
            <input
              id="cfg-min-kg"
              type="number"
              step="0.5"
              disabled={!draftRule.minOrderEnabled}
              value={draftRule.minOrderKg}
              onChange={(e) => setDraftRule({ ...draftRule, minOrderKg: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg disabled:bg-slate-100"
            />
          </div>
          <div>
            <label htmlFor="cfg-max-cod" className="block text-xs font-medium text-slate-700 mb-1">
              Max Rider COD Liability (₹)
            </label>
            <input
              id="cfg-max-cod"
              type="number"
              step="500"
              value={draftRule.maxRiderCodLimit}
              onChange={(e) => setDraftRule({ ...draftRule, maxRiderCodLimit: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="cfg-sla-min" className="block text-xs font-medium text-slate-700 mb-1">
              Pickup SLA Breach Alert (mins)
            </label>
            <input
              id="cfg-sla-min"
              type="number"
              min="3"
              max="30"
              value={draftRule.slaPickupAlertMinutes}
              onChange={(e) => setDraftRule({ ...draftRule, slaPickupAlertMinutes: parseInt(e.target.value, 10) || 8 })}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        {/* Payment Mode Switches */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-6 text-xs font-medium text-slate-800">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={draftRule.codEnabled}
              onChange={(e) => setDraftRule({ ...draftRule, codEnabled: e.target.checked })}
              className="rounded border-slate-300 text-sky-700"
            />
            Pay When Received (POD/COD)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={draftRule.upiEnabled}
              onChange={(e) => setDraftRule({ ...draftRule, upiEnabled: e.target.checked })}
              className="rounded border-slate-300 text-sky-700"
            />
            UPI Intent (GPay / PhonePe / Paytm)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={draftRule.cardsEnabled}
              onChange={(e) => setDraftRule({ ...draftRule, cardsEnabled: e.target.checked })}
              className="rounded border-slate-300 text-sky-700"
            />
            Credit / Debit Cards (Prepaid)
          </label>
        </div>
      </form>

      {/* 2. Visual Discount Tier Matrix Builder */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
              <Percent className="w-4 h-4 text-slate-600" aria-hidden="true" />
              Visual Discount Tier Matrix Builder
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Add, edit, toggle, or delete monetary brackets (default &lt; ₹300: 0%, ₹300–₹999: 10%, &ge; ₹1,000: 30%).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddSlab}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add Bracket
            </button>
            <button
              type="button"
              onClick={handleCommitSlabs}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              Save Discount Matrix
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="py-2.5 px-3 font-medium">Scope</th>
                <th className="py-2.5 px-3 font-medium">Tier Label</th>
                <th className="py-2.5 px-3 font-medium">Min (₹)</th>
                <th className="py-2.5 px-3 font-medium">Max (₹)</th>
                <th className="py-2.5 px-3 font-medium">Discount (%)</th>
                <th className="py-2.5 px-3 font-medium">Active</th>
                <th className="py-2.5 px-3 font-medium text-right">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draftSlabs.map((slab, idx) => (
                <tr key={slab.slabId}>
                  <td className="py-2 px-3 font-mono text-slate-500">{slab.hubId}</td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      aria-label={`Discount tier ${idx + 1} label`}
                      value={slab.label}
                      onChange={(e) =>
                        setDraftSlabs((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, label: e.target.value } : s))
                        )
                      }
                      className="w-48 px-2.5 py-1.5 border border-slate-300 rounded-md"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      aria-label={`Discount tier ${idx + 1} min amount`}
                      value={slab.minAmount}
                      onChange={(e) =>
                        setDraftSlabs((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, minAmount: parseFloat(e.target.value) || 0 } : s))
                        )
                      }
                      className="w-24 px-2 py-1.5 font-mono tabular-nums border border-slate-300 rounded-md"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      aria-label={`Discount tier ${idx + 1} max amount`}
                      value={slab.maxAmount}
                      onChange={(e) =>
                        setDraftSlabs((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, maxAmount: parseFloat(e.target.value) || 0 } : s))
                        )
                      }
                      className="w-28 px-2 py-1.5 font-mono tabular-nums border border-slate-300 rounded-md"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      aria-label={`Discount tier ${idx + 1} percent`}
                      value={slab.discountPercent}
                      onChange={(e) =>
                        setDraftSlabs((prev) =>
                          prev.map((s, i) =>
                            i === idx ? { ...s, discountPercent: parseFloat(e.target.value) || 0 } : s
                          )
                        )
                      }
                      className="w-20 px-2 py-1.5 font-mono tabular-nums border border-slate-300 rounded-md"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      aria-label={`Toggle tier ${idx + 1} active`}
                      checked={slab.isActive}
                      onChange={(e) =>
                        setDraftSlabs((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, isActive: e.target.checked } : s))
                        )
                      }
                      className="rounded border-slate-300 text-sky-700"
                    />
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      aria-label={`Delete discount tier ${slab.label}`}
                      onClick={() => setDraftSlabs((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1 text-slate-400 hover:text-rose-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Hub Geofence Radius & Franchise Revenue Split Configuration */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="pb-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-600" aria-hidden="true" />
            Multi-Branch Hubs, Geofence Radii &amp; Franchise Revenue Splits
          </h3>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="py-2.5 px-3 font-medium">Hub</th>
                <th className="py-2.5 px-3 font-medium">Tier</th>
                <th className="py-2.5 px-3 font-medium">Geofence (km)</th>
                <th className="py-2.5 px-3 font-medium">Partner %</th>
                <th className="py-2.5 px-3 font-medium">Royalty %</th>
                <th className="py-2.5 px-3 font-medium text-right">Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hubs.map((h) => (
                <tr key={h.hubId}>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900">{h.name}</div>
                    <div className="text-slate-500 font-mono">{h.code} · {h.city}</div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-700">{h.franchiseTier}</td>
                  <td className="py-2.5 px-3">
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="25"
                      aria-label={`${h.name} geofence radius km`}
                      defaultValue={h.geofenceRadiusKm}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (Number.isFinite(val) && val > 0 && val !== h.geofenceRadiusKm) {
                          onSaveHub({ ...h, geofenceRadiusKm: val });
                          notifySaved(`Updated geofence radius for ${h.name} to ${val} km.`);
                        }
                      }}
                      className="w-20 px-2 py-1 font-mono tabular-nums border border-slate-300 rounded"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="number"
                      step="1"
                      min="50"
                      max="95"
                      aria-label={`${h.name} partner share percent`}
                      defaultValue={h.partnerSharePercent}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (Number.isFinite(val) && val >= 50 && val <= 95 && val !== h.partnerSharePercent) {
                          onSaveHub({ ...h, partnerSharePercent: val, royaltyPercent: 100 - val });
                          notifySaved(`Updated ${h.name} revenue split to ${val}% Partner / ${100 - val}% Royalty.`);
                        }
                      }}
                      className="w-20 px-2 py-1 font-mono tabular-nums border border-slate-300 rounded"
                    />
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700">
                    {h.royaltyPercent}%
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        onSaveHub({ ...h, isActive: !h.isActive });
                        notifySaved(`${h.name} marked ${h.isActive ? 'Inactive' : 'Active'}.`);
                      }}
                      className="text-xs font-medium text-sky-700 hover:text-sky-900"
                    >
                      {h.isActive ? 'Disable Hub' : 'Activate Hub'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Provision New Franchise Hub */}
        <form onSubmit={handleCreateHub} className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end pt-2">
          <input
            type="text"
            aria-label="New hub code"
            value={newHubCode}
            onChange={(e) => setNewHubCode(e.target.value)}
            placeholder="Code (e.g. KNP-01)"
            className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            required
          />
          <input
            type="text"
            aria-label="New hub name"
            value={newHubName}
            onChange={(e) => setNewHubName(e.target.value)}
            placeholder="Hub Name"
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
            required
          />
          <input
            type="text"
            aria-label="New hub city"
            value={newHubCity}
            onChange={(e) => setNewHubCity(e.target.value)}
            placeholder="City"
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
            required
          />
          <select
            aria-label="New hub franchise tier"
            value={newHubTier}
            onChange={(e) => setNewHubTier(e.target.value as FranchiseTier)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
          >
            <option value={FranchiseTier.EXPRESS_MICRO}>Express Micro</option>
            <option value={FranchiseTier.STANDARD_HUB}>Standard Hub</option>
            <option value={FranchiseTier.MASTER_DISTRICT}>Master District</option>
          </select>
          <input
            type="number"
            aria-label="New hub partner percentage"
            value={newHubPartnerPct}
            onChange={(e) => setNewHubPartnerPct(e.target.value)}
            placeholder="Partner %"
            className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
          />
          <button
            type="submit"
            className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap"
          >
            + Add Hub
          </button>
        </form>
      </section>

      {/* 4. Promo Banner & Coupon CMS + Workflow Stage Templates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
            <Tag className="w-4 h-4 text-slate-600" aria-hidden="true" />
            Promotional Banner &amp; Coupon CMS
          </h3>
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {draftPromos.map((p) => (
              <div key={p.promoId} className="p-3 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-mono font-bold text-slate-900">
                    {p.code} · +{p.extraDiscountPercent}% OFF
                  </div>
                  <div className="text-slate-500">{p.title} · {p.status}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = draftPromos.map((item) =>
                      item.promoId === p.promoId
                        ? { ...item, status: item.status === 'ACTIVE' ? ('PAUSED' as const) : ('ACTIVE' as const) }
                        : item
                    );
                    setDraftPromos(next);
                    onSavePromos(next);
                  }}
                  className="text-xs font-medium text-sky-700 hover:text-sky-900 whitespace-nowrap"
                >
                  {p.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddPromo} className="grid grid-cols-12 gap-2">
            <input
              type="text"
              aria-label="New promo code"
              value={newPromoCode}
              onChange={(e) => setNewPromoCode(e.target.value)}
              placeholder="Code (FAST15)"
              className="col-span-4 px-2.5 py-1.5 text-xs font-mono uppercase border border-slate-300 rounded-lg"
              required
            />
            <input
              type="text"
              aria-label="New promo title"
              value={newPromoTitle}
              onChange={(e) => setNewPromoTitle(e.target.value)}
              placeholder="Campaign title"
              className="col-span-4 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              required
            />
            <input
              type="number"
              aria-label="New promo discount percent"
              value={newPromoPct}
              onChange={(e) => setNewPromoPct(e.target.value)}
              placeholder="%"
              className="col-span-2 px-2 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
              required
            />
            <button
              type="submit"
              className="col-span-2 py-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg"
            >
              Add
            </button>
          </form>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Canonical Workflow Stage Labels &amp; SLA Timers
            </h3>
            <button
              type="button"
              onClick={() => {
                onSaveWorkflowStages(draftStages);
                notifySaved('Updated workflow stage templates and SLA breach timers.');
              }}
              className="text-xs font-semibold text-sky-700 hover:text-sky-900"
            >
              Save Stages
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {draftStages.slice(0, 7).map((st, idx) => (
              <div key={st.status} className="grid grid-cols-12 gap-2 items-center text-xs">
                <span className="col-span-1 font-mono text-slate-400">0{idx + 1}</span>
                <input
                  type="text"
                  aria-label={`Stage ${idx + 1} label`}
                  value={st.label}
                  onChange={(e) =>
                    setDraftStages((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                    )
                  }
                  className="col-span-8 px-2.5 py-1.5 border border-slate-300 rounded-md"
                />
                <input
                  type="number"
                  aria-label={`Stage ${idx + 1} SLA minutes`}
                  value={st.slaMinutes}
                  onChange={(e) =>
                    setDraftStages((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, slaMinutes: parseInt(e.target.value, 10) || 0 } : item
                      )
                    )
                  }
                  className="col-span-3 px-2 py-1.5 font-mono tabular-nums border border-slate-300 rounded-md"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
