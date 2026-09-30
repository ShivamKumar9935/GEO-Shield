import React from 'react';
import { X, AlertCircle, Building, Users, Info, ShieldAlert } from 'lucide-react';

export default function ZoneDetailModal({ zone, onClose }) {
  if (!zone) return null;

  const {
    id,
    name,
    description,
    risk_score = 50,
    risk_category = 'MODERATE',
    population = 5000,
    infrastructure = [],
    factors = {},
    factor_contributions = {},
    data_provenance = {}
  } = zone;

  const categoryColors = {
    LOW: { text: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40' },
    MODERATE: { text: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/40' },
    HIGH: { text: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/40' },
    CRITICAL: { text: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/40' },
  };

  const style = categoryColors[risk_category] || categoryColors.MODERATE;
  const accessibilityLabel = zone.accessibility_factor >= 0.8 ? 'Good access' : zone.accessibility_factor >= 0.6 ? 'Limited access' : 'Difficult access';

  const contributingFactors = [
    { key: 'elevation', label: 'Elevation', value: factors.elevation_risk, color: 'bg-red-400' },
    { key: 'rainfall', label: 'Rainfall', value: factors.rainfall_risk, color: 'bg-blue-400' },
    { key: 'drainage', label: 'Drainage', value: factors.drainage_risk, color: 'bg-amber-400' },
    { key: 'landcover', label: 'Land cover', value: factors.landcover_risk, color: 'bg-purple-400' },
    { key: 'water_proximity', label: 'Water proximity', value: factors.water_proximity_risk, color: 'bg-cyan-400' },
  ];
  const statusName = (status, key) => {
    if (key === 'water_proximity' && ['REAL_SOURCE_DERIVED', 'PARTIAL_REAL_SOURCE'].includes(status)) return 'REAL OSM · PARTIAL COVERAGE';
    if (key === 'water_proximity' && status === 'DEMO_FALLBACK') return 'DEMO FALLBACK · OSM COVERAGE INCOMPLETE';
    return ({
    REAL_SOURCE_DATA: 'REAL SOURCE',
    REAL_SOURCE_DERIVED: 'REAL SOURCE DERIVED',
    FORECAST_SOURCE_DATA: 'SOURCE FORECAST',
    PARTIAL_REAL_SOURCE: 'PARTIAL OSM SOURCE',
    MIXED_REAL_AND_DEMO: 'REAL + DEMO FALLBACK',
    STALE_SOURCE_DATA: 'STALE SOURCE · DEMO FALLBACK',
    SCENARIO_INPUT: 'SCENARIO INPUT',
    DEMO_FALLBACK: 'DEMO FALLBACK',
    DEMO: 'DEMO'
    }[status] || 'DEMO');
  };

  return (
    <div className="absolute right-4 top-4 bottom-4 w-96 bg-navy-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-5 shadow-2xl z-[1000] flex flex-col justify-between overflow-y-auto">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
              Zone Inspection Inspector
            </span>
            <h3 className="text-base font-bold text-white mt-0.5">{name}</h3>
            <p className="text-xs text-slate-400 mt-0.5 leading-snug">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Score & Category Callout */}
        <div className="mt-4 p-3.5 rounded-lg bg-navy-950 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Composite Susceptibility Score
            </div>
            <div className="text-3xl font-black font-mono tracking-tight text-white mt-0.5">
              {risk_score}
              <span className="text-sm font-normal text-slate-500"> / 100</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Classification
            </div>
            <span className={`inline-block mt-1 px-3 py-1 rounded text-xs font-bold uppercase tracking-wider border ${style.bg} ${style.text} ${style.border}`}>
              {risk_category}
            </span>
          </div>
        </div>
        <div className="mt-2 text-[10px] text-slate-400">
          Active rainfall input: <strong className="text-cyan-200">{data_provenance.rainfall?.rainfall_source || (data_provenance.rainfall?.type === 'forecast' ? 'FORECAST' : 'SCENARIO')}</strong>
          {' · '}{data_provenance.rainfall?.value_mm ?? '—'} {data_provenance.rainfall?.unit || 'mm'} / {data_provenance.rainfall?.period_hours || 24}h
          {data_provenance.rainfall?.accumulation_period ? ` · ${data_provenance.rainfall.accumulation_period}` : ''}
        </div>

        {/* Demographics */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold uppercase">
              <Users className="w-3 h-3 text-cyan-400" />
              Modeled Population Input
            </span>
            <div className="text-base font-bold font-mono text-amber-300 mt-1">
              {population.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500">
              Not a spatially measured exposure count
            </div>
            {data_provenance.population && <div className="mt-1 text-[9px] text-slate-500">{statusName(data_provenance.population.status)} · {data_provenance.population.source}</div>}
          </div>
          <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold uppercase">
              <Building className="w-3 h-3 text-blue-400" />
              Infrastructure Assets
            </span>
            <div className="text-base font-bold font-mono text-blue-300 mt-1">
              {infrastructure.length} Units
            </div>
            <div className="text-[10px] text-slate-500">Assets listed for this zone</div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">
          Accessibility: <strong className="text-slate-200">{accessibilityLabel}</strong>
        </div>

        {/* Contributing Factors Breakdown */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
            <span>Hazard Factors</span>
            <span className="text-[10px] text-slate-500 font-mono">Weighted points in composite score</span>
          </div>
          <div className="space-y-2">
            {contributingFactors.map((item) => {
              const provenance = data_provenance[item.key];
              const detail = factor_contributions[item.key] || {};
              const contribution = Number(detail.contribution ?? 0);
              const source = detail.source || provenance?.source || 'Source not specified';
              const sourceStatus = detail.status || provenance?.status;
              const maxContribution = Number(detail.weight ?? 0) * 100;
              const sourceLabel = statusName(sourceStatus, item.key);
              return <div key={item.key} className="bg-slate-950/60 p-2 rounded border border-slate-800/80">
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="font-mono font-bold text-slate-200">{Number(item.value ?? 0).toFixed(1)} risk · {(Number(detail.weight ?? 0) * 100).toFixed(0)}% weight · {contribution.toFixed(2)} pts</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color}`}
                    title={`${contribution.toFixed(2)} weighted points out of 100 composite points`}
                    style={{ width: `${Math.max(0, Math.min(100, contribution))}%` }}
                  />
                </div>
                <div className="mt-1.5 text-[9px] text-slate-500 leading-snug">
                  <strong className={sourceStatus?.startsWith('REAL') || sourceStatus === 'FORECAST_SOURCE_DATA' ? 'text-emerald-300' : 'text-amber-300'}>{sourceLabel}</strong>
                  {' · '}{source}
                  {detail.value_m != null && ` · ${detail.value_m} m`}
                  {detail.value_mm != null && ` · ${detail.value_mm} mm / ${detail.period_hours || 24}h`}
                  {detail.distance_m != null && ` · nearest mapped feature ${detail.distance_m} m`}
                  {provenance?.method && <><br />{provenance.method}</>}
                </div>
              </div>;
            })}
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-blue-950/30 border border-blue-800/40">
          <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Primary Risk Drivers</div>
          <div className="mt-1 text-xs text-slate-200">{(zone.primary_risk_drivers || contributingFactors.slice().sort((a, b) => (b.pct || 0) - (a.pct || 0)).slice(0, 3).map(item => item.label)).join(' · ')}</div>
        </div>

        {/* Critical Infrastructure list */}
        {infrastructure.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
              Identified Key Assets
            </div>
            <div className="flex flex-wrap gap-1.5">
              {infrastructure.map((inf, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded text-[11px] bg-blue-950/40 text-blue-300 border border-blue-800/40"
                >
                  {inf}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Disclaimer */}
      <div className="mt-5 pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center gap-1.5 bg-slate-950/40 p-2 rounded">
        <Info className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          <strong>Prototype model output:</strong> Real DEM elevation where available; other factors retain their labeled demo/scenario sources. Susceptibility heuristic, not a validated flood prediction.
        </span>
      </div>
    </div>
  );
}
