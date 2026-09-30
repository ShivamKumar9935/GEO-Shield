import React from 'react';
import { CloudRain, Radio, MapPin, AlertTriangle, RefreshCw } from 'lucide-react';

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
    <header className="h-14 bg-navy-900/90 backdrop-blur border-b border-slate-800 px-5 flex items-center justify-between z-20">
      {/* Title & Context */}
      <div className="flex items-center gap-4">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            Flood Exposure & Emergency Decision Support
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Simulation Mode
            </span>
          </h2>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-red-400" />
              <span>Location: <strong className="text-slate-200">{locationName}</strong></span>
            </span>
            <span className="text-slate-600">|</span>
            <span className="hidden md:inline text-slate-400 font-mono text-[10px]">
              GIS Ref: {studyArea?.crs || 'EPSG:4326'} ({latitude.toFixed(3)}°N, {longitude.toFixed(3)}°E)
            </span>
          </div>
        </div>
      </div>

      {/* Center pipeline reminder */}
      <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-navy-950 border border-slate-800 text-[10px] font-mono font-medium text-slate-300">
        <span className="text-amber-400">HAZARD</span>
        <span className="text-slate-600">→</span>
        <span className="text-orange-400">EXPOSURE</span>
        <span className="text-slate-600">→</span>
        <span className="text-blue-400">OPTIMIZE</span>
        <span className="text-slate-600">→</span>
        <span className="text-emerald-400">RESPOND</span>
      </div>

      {/* Right controls: Quick Scenario Presets */}
      <div className="flex items-center gap-2.5">
        <span className={`hidden xl:inline text-[10px] font-mono ${backendStatus === 'API unavailable' ? 'text-red-300' : 'text-slate-400'}`}>
          API: {backendStatus === 'backend' ? `connected · ${elevationStatus}` : backendStatus}
        </span>
        <div className="hidden sm:flex items-center gap-1 text-xs bg-slate-900 border border-slate-800 p-1 rounded-md">
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

        <div className="hidden md:flex flex-col rounded-md border border-slate-700 bg-slate-950 px-2 py-1 leading-tight" aria-live="polite">
          <span className="text-[8px] uppercase tracking-wide text-slate-500">Risk calculation uses</span>
          <span className={`text-[10px] font-mono font-bold ${activeRainfallSource === 'FORECAST' ? 'text-cyan-300' : activeRainfallSource === 'DEMO_FALLBACK' ? 'text-amber-300' : 'text-blue-300'}`}>
            {activeRainfallSource} · {activeRainfallMm ?? '—'} mm / {activeRainfallPeriodHours}h
          </span>
          {activeRainfallMode === 'scenario' && <span className="text-[8px] text-slate-500">hypothetical scenario</span>}
          {activeRainfallSource === 'DEMO_FALLBACK' && <span className="text-[8px] text-amber-300">forecast unavailable; using scenario</span>}
        </div>

        <div className="hidden lg:flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900 px-2 py-1" title={rainfallSource?.accumulation_period || 'No source forecast cached'}>
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
          className="p-1.5 rounded-md border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin text-blue-400' : ''}`} />
        </button>
      </div>
    </header>
  );
}
