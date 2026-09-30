import React from 'react';
import { AlertTriangle, Building2, HelpCircle, Map, MapPin, Waves } from 'lucide-react';

const km = (meters) => (Number(meters || 0) / 1000).toFixed(2);

function Metric({ label, value, detail, tone = 'cyan' }) {
  const tones = {
    cyan: 'border-cyan-500/30 text-cyan-300',
    orange: 'border-orange-500/30 text-orange-300',
    slate: 'border-slate-700 text-slate-200',
  };
  return <div className={`rounded-lg border bg-navy-950 p-3 ${tones[tone]}`}>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
    <div className={`mt-1 text-xl font-bold font-mono ${tones[tone].split(' ').at(-1)}`}>{value}</div>
    <div className="mt-1 text-[10px] text-slate-500">{detail}</div>
  </div>;
}

function Unavailable({ label }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
    <div className="text-xs font-semibold text-slate-200">{label}</div>
    <div className="mt-1 text-[11px] text-slate-500">Not available in current study-area dataset</div>
  </div>;
}

export default function ExposurePanel({ exposure, isLoading = false, hasError = false }) {
  if (isLoading) return <div className="h-full bg-navy-950 p-6 text-sm text-slate-400">Loading spatial exposure analysis…</div>;
  if (!exposure) return <div className="h-full bg-navy-950 p-6 text-sm text-amber-200">{hasError ? 'Spatial exposure results are unavailable because the backend API did not return data.' : 'Spatial exposure results are not available.'}</div>;
  const roads = exposure.roads || {};
  const facilities = exposure.facilities || {};
  const hazard = exposure.hazard || {};
  const categories = Object.entries(facilities.by_category || {});

  return <div className="h-full overflow-y-auto bg-navy-950 p-5 text-slate-100">
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="border-b border-slate-800 pb-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">Problem 4.4 · Spatial overlay</div>
        <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-white"><Map className="h-5 w-5 text-cyan-400" />Flood Exposure</h2>
        <p className="mt-1 text-xs text-slate-400">Hazard geometry is the existing modeled susceptibility grid. Exposure values below come from spatial geometry tests.</p>
        <p className="mt-1 text-[10px] text-slate-500">Selected rainfall input: {exposure.rainfall_source === 'FORECAST' ? 'Open-Meteo forecast' : exposure.rainfall_source === 'DEMO_FALLBACK' ? 'scenario fallback' : 'user-defined scenario'} · {exposure.rainfall_mm} mm / 24h</p>
      </header>

      <section className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3">
        <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div>
          <div className="text-xs font-bold tracking-wide text-amber-200">HAZARD · {hazard.label || 'MODELED FLOOD SUSCEPTIBILITY'}</div>
          <p className="mt-1 text-[11px] text-slate-300">{hazard.source || 'GEO-SHIELD backend risk model'} · {hazard.exposure_definition || 'HIGH / CRITICAL susceptibility cells'}</p>
          <p className="mt-1 text-[10px] text-slate-500">This is not an observed satellite flood extent, actual flooded area, or flood prediction.</p>
        </div></div>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200"><MapPin className="h-4 w-4 text-cyan-300" />Road exposure · {roads.source || 'OpenStreetMap snapshot'}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric label="Total OSM road length" value={`${km(roads.total_length_m)} km`} detail={`${roads.feature_count ?? 0} features inside the partial snapshot extent`} />
          <Metric label="Length in susceptibility mask" value={`${km(roads.exposed_length_m)} km`} detail="Spatial line intersection with HIGH / CRITICAL cells" tone="orange" />
          <Metric label="Road length exposed" value={`${Number(roads.exposure_percent || 0).toFixed(2)}%`} detail="Exposed length ÷ total analyzed OSM road length" tone="orange" />
        </div>
        <p className="text-[10px] text-slate-500">Lengths are clipped to the recorded partial OSM query extent before overlay. Only real-source OSM road centerlines are included; demo road records remain map context and are excluded.</p>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200"><Building2 className="h-4 w-4 text-blue-300" />Facility exposure</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric label="Total facility inventory" value={facilities.total_inventory ?? 0} detail="Mixed real-source and demo facility records" tone="slate" />
          <Metric label="Locations spatially tested" value={facilities.spatially_tested ?? 0} detail="Facility points with usable coordinates" tone="slate" />
          <Metric label="Intersects susceptibility mask" value={facilities.hazard_exposed ?? 0} detail="Point-in-polygon test against HIGH / CRITICAL cells" tone="orange" />
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 bg-slate-900 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-400"><span>Facility type</span><span>Total</span><span>Tested</span><span>Intersects</span></div>
          {categories.map(([key, item]) => <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 border-t border-slate-800 px-3 py-2 text-xs"><span className="text-slate-300">{item.label}</span><span>{item.total_inventory}</span><span>{item.spatially_tested}</span><span className="font-semibold text-orange-300">{item.hazard_exposed}</span></div>)}
        </div>
        <p className="text-[10px] text-slate-500">Inventory totals are not impact counts. A facility is marked exposed only when its source location intersects a susceptibility cell. OSM coverage is partial; other facilities are demo records.</p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Unavailable label="Buildings" />
        <Unavailable label="Settlements" />
        <Unavailable label="Land use" />
        <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3"><div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200"><HelpCircle className="h-3.5 w-3.5" />Population</div><div className="mt-1 text-[11px] text-slate-500">{exposure.population?.label || 'Not reported as observed exposure.'}</div></div>
      </section>

      <section className="flex items-start gap-2 rounded-lg border border-sky-900/60 bg-sky-950/20 p-3 text-[10px] text-slate-400">
        <Waves className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
        <span>Mapped water bodies are shown as geographic context only; they are not counted as affected assets. Hazard and road source provenance is available in Methodology & Data Sources.</span>
      </section>
    </div>
  </div>;
}
