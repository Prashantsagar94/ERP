import React, { useState } from 'react';
import { Database, History, ShieldAlert } from 'lucide-react';
import { AuditEvent, WeightAuditLog } from '../types/erp';
import { formatInr } from '../utils/erpEngine';

interface AuditBlueprintViewProps {
  weightAuditLogs: WeightAuditLog[];
  auditEvents: AuditEvent[];
}

const REFERENCE_SQL_SCHEMA = `-- InstaWash Core Relational Blueprint (PostgreSQL + PostGIS Reference)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE hubs (
  hub_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  geofence_polygon GEOMETRY(Polygon, 4326),
  geofence_radius_km NUMERIC(4, 2) DEFAULT 2.50,
  franchise_tier VARCHAR(50) DEFAULT 'STANDARD_HUB',
  royalty_percent NUMERIC(5, 2) DEFAULT 20.00
);

CREATE TABLE pricing_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(hub_id) ON DELETE CASCADE,
  rate_per_kg NUMERIC(8, 2) NOT NULL DEFAULT 149.00,
  home_delivery_fee NUMERIC(8, 2) NOT NULL DEFAULT 30.00,
  office_pickup_fee NUMERIC(8, 2) NOT NULL DEFAULT 0.00
);

CREATE TABLE discount_slabs (
  slab_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hub_id UUID REFERENCES hubs(hub_id) ON DELETE CASCADE,
  min_amount NUMERIC(8, 2) NOT NULL,
  max_amount NUMERIC(8, 2) NOT NULL,
  discount_percent NUMERIC(5, 2) NOT NULL
);`;

export const AuditBlueprintView: React.FC<AuditBlueprintViewProps> = ({
  weightAuditLogs,
  auditEvents,
}) => {
  const [subTab, setSubTab] = useState<'AUDIT' | 'WEIGHT_LOGS' | 'SCHEMA'>('AUDIT');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Compliance Audit Trail &amp; Architecture Blueprint
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable operational ledger for weight overrides, pricing edits, Excel imports, and EOD financial settlements
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('AUDIT')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'AUDIT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            System Audit ({auditEvents.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('WEIGHT_LOGS')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'WEIGHT_LOGS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Weight Disputes ({weightAuditLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('SCHEMA')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'SCHEMA' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            SQL / Firestore Blueprint
          </button>
        </div>
      </div>

      {subTab === 'AUDIT' && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-600" aria-hidden="true" />
            <h3 className="text-sm font-bold text-slate-900">Immutable CRUD Event Stream</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-4 font-medium">Timestamp</th>
                  <th className="py-3 px-4 font-medium">Actor &amp; Role</th>
                  <th className="py-3 px-4 font-medium">Action</th>
                  <th className="py-3 px-4 font-medium">Entity</th>
                  <th className="py-3 px-4 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditEvents.map((evt) => (
                  <tr key={evt.eventId} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {new Date(evt.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-900">{evt.actorName}</span>
                      <span className="text-slate-400"> · </span>
                      <span className="font-mono text-slate-600">{evt.actorRole}</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {evt.action}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {evt.entityType}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{evt.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {subTab === 'WEIGHT_LOGS' && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-700" aria-hidden="true" />
            <h3 className="text-sm font-bold text-slate-900">Weight Tamper Prevention &amp; Override Ledger</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-4 font-medium">Order</th>
                  <th className="py-3 px-4 font-medium text-right">Old Weight</th>
                  <th className="py-3 px-4 font-medium text-right">Revised Weight</th>
                  <th className="py-3 px-4 font-medium text-right">Revised Total</th>
                  <th className="py-3 px-4 font-medium">Authorized By</th>
                  <th className="py-3 px-4 font-medium">Audit Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {weightAuditLogs.map((log) => (
                  <tr key={log.logId} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {log.orderNumber}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                      {log.oldWeight.toFixed(2)} Kg
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-amber-800">
                      {log.newWeight.toFixed(2)} Kg
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatInr(log.newPayable)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{log.changedByName}</span>
                      <span className="text-slate-400"> · </span>
                      <span className="font-mono text-slate-600">{log.changedByRole}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-700">{log.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {subTab === 'SCHEMA' && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-600" aria-hidden="true" />
            <h3 className="text-sm font-bold text-slate-900">
              Relational Schema Blueprint &amp; Firestore Collections Mapping
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            This live deployment uses hardened Firebase Firestore collections (<span className="font-mono">hubs</span>, <span className="font-mono">pricing_rules</span>, <span className="font-mono">discount_slabs</span>, <span className="font-mono">orders</span>, <span className="font-mono">weight_audit_logs</span>, <span className="font-mono">rider_pod_ledger</span>, <span className="font-mono">staff_accounts</span>, <span className="font-mono">products</span>, <span className="font-mono">production_batches</span>, <span className="font-mono">audit_events</span>) synchronized to the reference PostgreSQL PostGIS data model below:
          </p>
          <pre className="p-4 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto leading-relaxed">
            {REFERENCE_SQL_SCHEMA}
          </pre>
        </section>
      )}
    </div>
  );
};
