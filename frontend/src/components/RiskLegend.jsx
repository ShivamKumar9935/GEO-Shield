import React from 'react';
import { Layers } from 'lucide-react';

export default function RiskLegend({ activeLayers, toggleLayer, classification, dataSources = {} }) {
  const hasClassification = classification && Number.isFinite(classification.low) && Number.isFinite(classification.moderate) && Number.isFinite(classification.high);
  const riskTiers = [
    { label: 'Low Risk', range: hasClassification ? `0–${classification.low}` : 'Threshold unavailable', color: '#10b981', desc: 'Lowest modeled tier' },
    { label: 'Moderate', range: hasClassification ? `${classification.low + 1}–${classification.moderate}` : 'Threshold unavailable', color: '#f59e0b', desc: 'Moderate modeled tier' },
    { label: 'High', range: hasClassification ? `${classification.moderate + 1}–${classification.high}` : 'Threshold unavailable', color: '#f97316', desc: 'High modeled tier' },
    { label: 'Critical', range: hasClassification ? `${classification.high + 1}–100` : 'Threshold unavailable', color: '#ef4444', desc: 'Highest modeled tier' },
  ];

  const sourceBadge = (source, fallback = 'DEMO FALLBACK') => {
    if (source?.status === 'PARTIAL_REAL_SOURCE') return 'REAL OSM · PARTIAL COVERAGE';
    if (source?.status === 'MIXED_REAL_AND_DEMO') return 'REAL OSM + DEMO FALLBACK';
    if (source?.status === 'FORECAST_SOURCE_DATA') return 'SOURCE FORECAST · MODEL-DERIVED';
    if (source?.status === 'NOT_YET_CONNECTED') return 'DEMO FALLBACK · SOURCE NOT CONNECTED';
    if (source?.status === 'DEMO_FALLBACK') return 'DEMO FALLBACK';
    if (source?.status === 'SCENARIO_INPUT') return 'SCENARIO INPUT';
    if (source?.is_real) return 'REAL SOURCE';
    return fallback;
  };
  const layerItems = [
    { id: 'floodRisk', label: 'Modeled Flood Susceptibility', badge: 'BACKEND RISK MODEL · NOT OBSERVED FLOOD EXTENT' },
    { id: 'waterBodies', label: 'Water Bodies', badge: sourceBadge(dataSources.water_bodies), title: dataSources.water_bodies?.description },
    { id: 'roads', label: 'Road Network', badge: sourceBadge(dataSources.roads), title: dataSources.roads?.description },
    { id: 'hospitals', label: 'Hospitals & Emergency Facilities', badge: sourceBadge(dataSources.infrastructure), title: dataSources.infrastructure?.description },
    { id: 'schools', label: 'Schools & Universities', badge: sourceBadge(dataSources.infrastructure), title: dataSources.infrastructure?.description },
    { id: 'emergencyFacilities', label: 'Police & Fire Stations', badge: sourceBadge(dataSources.infrastructure), title: dataSources.infrastructure?.description },
    { id: 'shelters', label: 'Emergency Shelters', badge: sourceBadge(dataSources.infrastructure), title: dataSources.infrastructure?.description },
    { id: 'resources', label: 'Deployed Ambulances & Boats', badge: 'OPTIMIZER ASSIGNMENTS · INVENTORY-LIMITED' },
    { id: 'safeRoute', label: 'Evacuation Routes', badge: 'MODELED · OSM ROAD GRAPH WHEN AVAILABLE' },
  ];

  return (
    <div className="bg-navy-900/90 backdrop-blur border border-slate-800 rounded-lg p-3 text-xs space-y-3 shadow-xl">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <span className="font-bold uppercase tracking-wider text-slate-300 text-[10px] flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-blue-400" />Risk Classification & Layers</span>
      </div>
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Modeled Susceptibility Tiers</div>
        <div className="grid grid-cols-2 gap-1.5">
          {riskTiers.map(tier => <div key={tier.label} className="flex items-center gap-2 bg-slate-950/60 p-1.5 rounded border border-slate-800/80"><span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: tier.color }} /><div className="truncate"><div className="font-medium text-[11px] text-slate-200">{tier.label}</div><div className="text-[9px] text-slate-400 font-mono">{tier.range}</div></div></div>)}
        </div>
      </div>
      <div className="space-y-1.5 pt-1 border-t border-slate-800">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">GIS Overlay Toggles</div>
        <p className="text-[9px] leading-snug text-slate-500">Exposure is measured against HIGH / CRITICAL modeled susceptibility cells. It is not an observed or predicted flood extent.</p>
        <div className="space-y-1 text-[11px]">
          {layerItems.map(layer => <label key={layer.id} title={layer.title} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 cursor-pointer rounded px-1 py-1 text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors"><input type="checkbox" checked={!!activeLayers[layer.id]} onChange={() => toggleLayer(layer.id)} className="row-span-2 mt-0.5 rounded bg-slate-950 border-slate-700 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer w-3.5 h-3.5" /><span className="font-medium leading-tight">{layer.label}</span><span className={`text-[9px] font-mono leading-tight ${layer.badge.includes('REAL') || layer.badge.includes('FORECAST') ? 'text-emerald-300' : layer.badge.includes('NOT CONNECTED') || layer.badge.includes('FALLBACK') ? 'text-amber-300' : 'text-slate-500'}`}>{layer.badge}</span></label>)}
        </div>
      </div>
      <div className="space-y-1.5 pt-1 border-t border-slate-800">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Road Exposure</div>
        <div className="space-y-1 text-[10px] text-slate-300"><div className="flex items-center gap-2"><span className="h-1 w-5 bg-orange-400" /> Intersects susceptibility mask</div><div className="flex items-center gap-2"><span className="h-1 w-5 bg-sky-400" /> No intersection in modeled mask</div><div className="flex items-center gap-2"><span className="h-1 w-5 border-t border-dashed border-slate-500" /> Demo road · not analyzed</div></div>
      </div>
      <div className="space-y-1.5 pt-1 border-t border-slate-800">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Resource Marker Key</div>
        <div className="space-y-1 text-[10px] text-slate-300">
          <div className="flex items-center gap-2"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500">🚑</span> Deployed ambulance · optimizer allocation</div>
          <div className="flex items-center gap-2"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500">🚤</span> Deployed rescue boat · optimizer allocation</div>
          <div className="flex items-center gap-2"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600">⛺</span> Fixed shelter · active in this scenario</div>
          <div className="flex items-center gap-2"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-600">⛺</span> Fixed shelter · standby</div>
          <div className="flex items-center gap-2"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500">🏥</span> Fixed hospital / medical facility</div>
          <div className="flex items-center gap-2"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-500">🏫</span> Fixed school / university</div>
          <div className="flex items-center gap-2"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-600">✚</span> Fixed police / fire / emergency facility</div>
          <div className="text-[9px] text-slate-400 pt-1">Fixed locations are facility data; only ambulance and boat markers represent deployed inventory.</div>
        </div>
      </div>
    </div>
  );
}
