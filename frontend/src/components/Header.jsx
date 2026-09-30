import React from 'react';
import { CloudRain, Radio, MapPin, RefreshCw } from 'lucide-react';

export default function Header({ 
  rainfall, 
  setRainfall, 
  rainfallMode = 'scenario',
  activeRainfallMode = rainfallMode,
  activeRainfallMm = rainfall,
  activeRainfallSource = rainfallMode === 'forecast' ? 'FORECAST' : 'SCENARIO',
  activeRainfallPeriodHours = 24,
  setRainfallMode = () => {},
  rainfallSource,
  onUseSourceForecast,
  backendStatus, 
  onRefresh, 
  isSimulating,
  studyArea,
  dataSources = {}
}) {
  const locationName = studyArea?.name || 'Potheri / SRM KTR';
  const latitude = studyArea?.latitude ?? 12.8235;
  const longitude = studyArea?.longitude ?? 80.0440;
  const elevationStatus = dataSources.elevation?.is_real ? 'real DEM + demo fallbacks' : 'demo model';
  const hasActiveForecast = rainfallSource?.is_real === true && rainfallSource?.status === 'REAL_SOURCE_DATA';
  return (
    <header className="z-20 shrink-0 border-b border-slate-800 bg-navy-900/90 px-4 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        {/* Title and location keep a predictable footprint; metadata can wrap. */}
        <div className="flex min-w-0 flex-1 basis-[27rem] flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="min-w-0 text-sm font-bold leading-5 tracking-tight text-white">
              Flood Exposure & Emergency Decision Support
            </h2>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Simulation Mode
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0 text-red-400" />
              <span>Location: <strong className="font-semibold text-slate-200">{locationName}</strong></span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              GIS Ref: {studyArea?.crs || 'EPSG:4326'} ({latitude.toFixed(3)}°N, {longitude.toFixed(3)}°E)
            </span>
          </div>
        </div>

        {/* The pipeline has its own flexible area between title and API state. */}
        <div className="hidden min-w-[15rem] flex-1 items-center justify-center lg:flex">
          <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-full border border-slate-800 bg-navy-950 px-3 py-1 font-mono text-[10px] font-medium text-slate-300">
            <span className="text-amber-400">HAZARD</span>
            <span className="text-slate-600">→</span>
            <span className="text-orange-400">EXPOSURE</span>
            <span className="text-slate-600">→</span>
            <span className="text-blue-400">OPTIMIZE</span>
            <span className="text-slate-600">→</span>
            <span className="text-emerald-400">RESPOND</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-md border border-slate-800 bg-slate-950/70 px-2.5 py-1.5" aria-live="polite">
          <Radio className={`h-3.5 w-3.5 shrink-0 ${backendStatus === 'API unavailable' ? 'text-red-300' : 'text-emerald-400'}`} />
          <span className={`text-[10px] font-mono ${backendStatus === 'API unavailable' ? 'text-red-300' : 'text-slate-300'}`}>
            API: {backendStatus === 'backend' ? `connected · ${elevationStatus}` : backendStatus}
          </span>
        </div>
      </div>

      {/* Scenario, calculation, source status, and refresh remain distinct controls. */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-800 bg-slate-900 p-1 text-xs">
          <span className="px-2 text-[10px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
            <CloudRain className="w-3 h-3 text-cyan-400" />
            Scenario presets:
          </span>
          {[
            { label: '40mm', val: 40, tip: 'Hypothetical 24-hour scenario' },
            { label: '120mm', val: 120, tip: 'Hypothetical stress-test input' },
            { label: '160mm', val: 160, tip: 'Very high hypothetical input' },
          ].map(p => (
            <button
              key={p.val}
              onClick={() => { setRainfall(p.val); setRainfallMode('scenario'); }}
              aria-pressed={rainfallMode === 'scenario' && rainfall === p.val}
              title={p.tip}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-colors ${
                  rainfallMode === 'scenario' && rainfall === p.val
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
          </div>

          <div className="flex min-w-[12.5rem] flex-col rounded-md border border-slate-700 bg-slate-950 px-2 py-1 leading-tight" aria-live="polite">
          <span className="text-[8px] uppercase tracking-wide text-slate-500">Risk calculation uses</span>
          <span className={`text-[10px] font-mono font-bold ${activeRainfallSource === 'FORECAST' ? 'text-cyan-300' : activeRainfallSource === 'DEMO_FALLBACK' ? 'text-amber-300' : 'text-blue-300'}`}>
            {activeRainfallSource} · {activeRainfallMm ?? '—'} mm / {activeRainfallPeriodHours}h
          </span>
          {activeRainfallMode === 'scenario' && <span className="text-[8px] text-slate-500">hypothetical scenario</span>}
          {activeRainfallSource === 'DEMO_FALLBACK' && <span className="text-[8px] text-amber-300">forecast unavailable; using scenario</span>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex min-h-8 flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-1" title={rainfallSource?.accumulation_period || 'No source forecast cached'}>
            <span className="text-[9px] uppercase tracking-wide text-slate-400">Source forecast</span>
            {hasActiveForecast ? (
              <>
                <span className="text-[10px] font-mono font-semibold text-cyan-300">{rainfallSource.value_mm} mm / next 24h</span>
                <button onClick={onUseSourceForecast} className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${rainfallMode === 'forecast' ? 'bg-cyan-700 text-white' : 'bg-slate-800 text-cyan-200 hover:bg-cyan-900'}`}>
                  {rainfallMode === 'forecast' ? 'Using' : 'Use'}
                </button>
              </>
            ) : (
              <span className="text-[9px] font-mono text-amber-300">
                {rainfallSource?.status === 'STALE_SOURCE_DATA' ? 'STALE · DEMO FALLBACK' : rainfallSource?.status === 'DEMO_FALLBACK' ? 'DISABLED · DEMO FALLBACK' : 'NOT CACHED · SCENARIO ACTIVE'}
              </span>
            )}
          </div>

          <button
            onClick={onRefresh}
            disabled={isSimulating}
            title="Recalculate model"
            className="shrink-0 rounded-md border border-slate-800 bg-slate-900 p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSimulating ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
