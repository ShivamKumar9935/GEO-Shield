import React from 'react';
import { 
  Sliders, 
  CloudRain, 
  Truck, 
  Ship, 
  Tent, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  ShieldCheck, 
  ArrowRight,
  Compass
} from 'lucide-react';

export default function ScenarioControls({
  rainfall,
  setRainfall,
  setRainfallMode = () => {},
  rainfallMode = 'scenario',
  activeRainfallMode: activeRainfallModeProp,
  rainfallSource,
  ambulances,
  setAmbulances,
  boats,
  setBoats,
  shelters,
  setShelters,
  summaryData,
  onNavigateToMap
}) {
  const selectScenarioRainfall = (value) => {
    setRainfall(value);
    setRainfallMode('scenario');
  };
  const {
    risk_score = 0,
    risk_category = 'LOW',
    high_risk_zones = 0,
    critical_infrastructure = 0,
    resource_coverage = 0
  } = summaryData || {};
  const riskColor = risk_category === 'CRITICAL' ? 'text-red-400' : risk_category === 'HIGH' ? 'text-orange-400' : risk_category === 'MODERATE' ? 'text-amber-400' : 'text-emerald-400';
  const riskBadge = risk_category === 'CRITICAL' ? 'bg-red-950 text-red-300 border border-red-800' : risk_category === 'HIGH' ? 'bg-orange-950 text-orange-300 border border-orange-800' : risk_category === 'MODERATE' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800';
  const activeMode = summaryData?.rainfall_mode || activeRainfallModeProp || rainfallMode;
  const activeSource = summaryData?.rainfall_source || (activeMode === 'forecast' ? 'FORECAST' : 'SCENARIO');
  const activeRainfallMm = summaryData?.rainfall_mm ?? (activeMode === 'forecast' ? rainfallSource?.value_mm : rainfall);

  const presets = [
    { label: 'Baseline (40 mm)', val: 40, desc: 'User-defined 24-hour rainfall input' },
    { label: 'Advisory (80 mm)', val: 80, desc: 'Higher hypothetical rainfall input' },
    { label: 'Warning (120 mm)', val: 120, desc: 'High hypothetical stress-test input' },
    { label: 'Emergency (160 mm)', val: 160, desc: 'Very high hypothetical stress-test input' },
  ];

  return (
    <div className="h-full flex flex-col gap-4 p-5 overflow-y-auto bg-navy-950 text-slate-100">
      {/* Title & Subtitle */}
      <div className="border-b border-slate-800 pb-3 flex items-start justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
            Interactive Stress Lab • Module 05
          </div>
          <h2 className="text-xl font-black text-white tracking-tight uppercase">
            WHAT IF RAINFALL INCREASES?
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Explore how hypothetical rainfall scenarios change modeled susceptibility and resource recommendations.
          </p>
        </div>
        <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-medium">
          Prototype Scenario Modeling
        </span>
      </div>

      <div className={`rounded border px-3 py-2 text-xs ${activeSource === 'FORECAST' ? 'border-cyan-800/70 bg-cyan-950/30 text-cyan-100' : activeSource === 'DEMO_FALLBACK' ? 'border-amber-800/70 bg-amber-950/30 text-amber-100' : 'border-blue-800/70 bg-blue-950/30 text-blue-100'}`}>
        <div className="text-[9px] uppercase tracking-wider opacity-70">Rainfall input used by the current model result</div>
        <strong>{activeSource}</strong> · <strong>{activeRainfallMm ?? '—'} mm / 24h</strong>
        {activeMode === 'forecast' && rainfallSource?.accumulation_period && <> · {rainfallSource.accumulation_period}</>}
        {activeSource === 'SCENARIO' && <> · hypothetical 24-hour scenario total</>}
        {activeSource === 'DEMO_FALLBACK' && <> · forecast unavailable; submitted scenario used</>}
        <div className="mt-0.5 text-[10px] opacity-75">Scenario presets below remain available; choosing one switches the next calculation to scenario mode.</div>
      </div>

      {/* Quick Scenario Selector Chips */}
      <div className="bg-navy-900 border border-slate-800 p-3 rounded-lg">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
          Disaster Intensity Presets
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {presets.map((p) => {
            const isSelected = rainfallMode === 'scenario' && rainfall === p.val;
            return (
              <button
                key={p.val}
                onClick={() => selectScenarioRainfall(p.val)}
                className={`p-2.5 rounded text-left transition-all border ${
                  isSelected
                    ? 'bg-blue-600/30 border-blue-400 text-white shadow-md shadow-blue-950'
                    : 'bg-navy-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">{p.label}</span>
                  {isSelected && <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
                </div>
                <div className="text-[10px] text-slate-400 mt-1 leading-snug truncate">
                  {p.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid: Left Sliders | Right Real-Time Impact Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Interactive Stress Sliders (6 cols) */}
        <div className="lg:col-span-6 bg-navy-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5 pb-2 border-b border-slate-800">
            <Sliders className="w-4 h-4 text-blue-400" />
            Environmental Hazard & Supply Variables
          </h3>

          {/* 1. Rainfall Slider: 40mm -> 180mm */}
          <div className="p-3 bg-navy-950 rounded-lg border border-slate-800 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-200 font-bold flex items-center gap-1.5">
                <CloudRain className="w-4 h-4 text-cyan-400" />
                Scenario Rainfall (mm)
              </span>
              <span className="text-lg font-black font-mono text-cyan-300">
                {rainfall} mm
              </span>
            </div>
            <input
              type="range"
              min="40"
              max="180"
              step="5"
              value={rainfall}
              onChange={(e) => selectScenarioRainfall(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="text-[10px] text-slate-500">User-defined scenario input, not an observed or forecast rainfall value.</div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>40 mm (Low)</span>
              <span>120 mm (High)</span>
              <span>180 mm (Critical)</span>
            </div>
          </div>

          {/* 2. Available Ambulances: 1 -> 8 */}
          <div className="p-3 bg-navy-950 rounded-lg border border-slate-800 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-200 font-bold flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-amber-400" />
                Available Ambulances
              </span>
              <span className="text-base font-bold font-mono text-amber-400">
                {ambulances} units
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="8"
              step="1"
              value={ambulances}
              onChange={(e) => setAmbulances(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>1 unit</span>
              <span>8 units</span>
            </div>
          </div>

          {/* 3. Rescue Boats: 0 -> 5 */}
          <div className="p-3 bg-navy-950 rounded-lg border border-slate-800 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-200 font-bold flex items-center gap-1.5">
                <Ship className="w-4 h-4 text-cyan-400" />
                Rescue Boats (NDRF / SDRF)
              </span>
              <span className="text-base font-bold font-mono text-cyan-400">
                {boats} vessels
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="1"
              value={boats}
              onChange={(e) => setBoats(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0 boats</span>
              <span>5 boats</span>
            </div>
          </div>

          {/* 4. Shelters: limited to the four facilities in demo inventory */}
          <div className="p-3 bg-navy-950 rounded-lg border border-slate-800 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-200 font-bold flex items-center gap-1.5">
                <Tent className="w-4 h-4 text-emerald-400" />
                Active Shelters
              </span>
              <span className="text-base font-bold font-mono text-emerald-400">
                {shelters} facilities
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="4"
              step="1"
              value={shelters}
              onChange={(e) => setShelters(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0 shelters</span>
              <span>4 available</span>
            </div>
          </div>
        </div>

        {/* Right: Dynamic Simulated Impact Display (6 cols) */}
        <div className="lg:col-span-6 bg-navy-900 border border-slate-800 rounded-lg p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Modeled Scenario Impact
              </h3>
              <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
                Backend Risk Model
              </span>
            </div>

            {/* Big Headline Metric: Risk Score */}
            <div className="mt-4 p-4 rounded-lg bg-navy-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Regional Modeled Susceptibility Score
                </span>
                <div className="text-3xl font-black font-mono text-white mt-0.5 flex items-baseline gap-2">
                  <span className={riskColor}>
                    {risk_score}
                  </span>
                  <span className="text-sm font-normal text-slate-500">/ 100</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Tier</span>
                <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded inline-block mt-1 ${
                  riskBadge
                }`}>
                  {risk_category}
                </span>
              </div>
            </div>

            {/* Impact Cards */}
            <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
              <div className="p-3 bg-navy-950 rounded border border-slate-800">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] uppercase font-semibold">Population Exposure</span>
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-lg font-bold font-mono text-amber-300 mt-1">
                  Not reported
                </div>
                <div className="text-[10px] text-slate-500">No defensible spatial population layer</div>
              </div>

              <div className="p-3 bg-navy-950 rounded border border-slate-800">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] uppercase font-semibold">High / Critical Susceptibility</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div className="text-lg font-bold font-mono text-red-400 mt-1">
                  {high_risk_zones} of {summaryData?.total_zones_count ?? 0} Zones
                </div>
                <div className="text-[10px] text-slate-500">Exceeding 50/100 threshold</div>
              </div>

              <div className="p-3 bg-navy-950 rounded border border-slate-800">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] uppercase font-semibold">Mapped & Demo Assets</span>
                  <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="text-lg font-bold font-mono text-blue-300 mt-1">
                  {critical_infrastructure} Facilities
                </div>
                <div className="text-[10px] text-slate-500">Hospitals, power, transport</div>
              </div>

              <div className="p-3 bg-navy-950 rounded border border-slate-800">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10px] uppercase font-semibold">Scenario Coverage</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                  {resource_coverage}%
                </div>
                <div className="text-[10px] text-slate-500">Simulated resource and rainfall index</div>
              </div>
            </div>
          </div>

          {/* Action button to immediately jump to the map to inspect visual polygon shifts */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">
              Modeled susceptibility scores and cell classes update for each hypothetical rainfall input; these are not flood observations.
            </span>
            {onNavigateToMap && (
              <button
                onClick={onNavigateToMap}
                className="px-3.5 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md"
              >
                <Compass className="w-4 h-4" />
                Inspect Map Changes
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
