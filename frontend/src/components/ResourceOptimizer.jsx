import React from 'react';
import { 
  Crosshair, 
  Truck, 
  Ship, 
  Tent, 
  Package, 
  Cpu, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  MapPin
} from 'lucide-react';

export default function ResourceOptimizer({ 
  onRunOptimization, 
  optimizationResult, 
  isOptimizing,
  currentRainfall,
  rainfallMode = 'scenario',
  rainfallSource,
  ambulances,
  setAmbulances,
  boats,
  setBoats,
  shelters,
  setShelters,
  reliefKits,
  setReliefKits,
  onNavigateToMap
}) {
  const handleOptimize = () => {
    onRunOptimization({
      ambulances,
      boats,
      shelters,
      reliefKits,
      rainfall: currentRainfall,
      rainfallMode
    });
  };

  const assignments = optimizationResult?.assignments || [];
  const zonePriorities = optimizationResult?.zone_priorities || [];
  const coverage = optimizationResult?.resource_coverage_pct ?? 0;
  const deployedAmbulances = assignments.filter(item => item.resource_type === 'Ambulance').length;
  const deployedBoats = assignments.filter(item => item.resource_type === 'Rescue Boat').length;
  const deployedShelters = assignments.filter(item => item.resource_type === 'Active Shelter').length;

  return (
    <div className="h-full flex flex-col gap-4 p-5 overflow-y-auto bg-navy-950 text-slate-100">
      {/* Title & Core Differentiator Callout */}
      <div className="border-b border-slate-800 pb-3 flex items-start justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
            Core Differentiator • Operations Module 03
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            Emergency Resource Allocation Optimizer
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ranks priority zones, then identifies a physically valid deployment point for each selected resource.
          </p>
        </div>
        <div className="text-right">
          <span className="px-2.5 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30 text-[10px] font-mono font-medium">
            Priority = Risk × Demo Population Proxy × (1.6 − Access)
          </span>
        </div>
      </div>

      {/* Production Notice Disclaimer */}
      <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-[11px]">
            <strong className="text-amber-300">Explainable heuristic dispatch</strong> — this prototype ranks zones and applies simple resource assignment rules.
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          {rainfallMode === 'forecast' && rainfallSource?.is_real
            ? `Source forecast: ${optimizationResult?.rainfall_mm ?? rainfallSource.value_mm} mm / 24h · ${rainfallSource.accumulation_period}`
            : `Scenario rainfall: ${currentRainfall} mm`}
        </span>
      </div>

      {/* Grid: Left Controls Panel | Right Dispatch Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Input Constraints (5 Cols) */}
        <div className="lg:col-span-5 bg-navy-900 border border-slate-800 rounded-lg p-4 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-blue-400" />
                  Demo Asset Inventory · Explainable heuristic dispatch
            </h3>

            {/* 1. Ambulances */}
            <div className="space-y-1 mb-3.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                  <Truck className="w-3.5 h-3.5 text-amber-400" />
                  Ambulance allocation limit
                </span>
                <span className="font-mono font-bold text-amber-400 text-sm">
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
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>0 units</span>
                <span>8 units max</span>
              </div>
            </div>

            {/* 2. Rescue Boats */}
            <div className="space-y-1 mb-3.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                  <Ship className="w-3.5 h-3.5 text-cyan-400" />
                  Rescue boat allocation limit
                </span>
                <span className="font-mono font-bold text-cyan-400 text-sm">
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
                className="w-full accent-cyan-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>0</span>
                <span>5 vessels max</span>
              </div>
            </div>

            {/* 3. Emergency Shelters */}
            <div className="space-y-1 mb-3.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                  <Tent className="w-3.5 h-3.5 text-emerald-400" />
                  Shelter activation limit
                </span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
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
                className="w-full accent-emerald-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>0 shelters</span>
                <span>4 available</span>
              </div>
            </div>

            {/* 4. Relief Kits */}
            <div className="space-y-1 mb-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-1.5 font-medium">
                  <Package className="w-3.5 h-3.5 text-purple-400" />
                  Relief Kits (separate simulated stock metric)
                </span>
                <span className="font-mono font-bold text-purple-400 text-sm">
                  {reliefKits.toLocaleString()} pkgs
                </span>
              </div>
              <input
                type="range"
                min="1000"
                max="7500"
                step="500"
                value={reliefKits}
                onChange={(e) => setReliefKits(parseInt(e.target.value))}
                className="w-full accent-purple-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>1,000 pkgs</span>
                <span>7,500 in demo stock</span>
              </div>
            </div>
          </div>

          {/* Optimize Button */}
          <button
            onClick={handleOptimize}
            disabled={isOptimizing}
            className="w-full py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider transition-all duration-150 shadow-lg shadow-blue-900/50 flex items-center justify-center gap-2 border border-blue-400/40"
          >
            <Crosshair className={`w-4 h-4 ${isOptimizing ? 'animate-spin' : ''}`} />
            {isOptimizing ? 'Ranking Response Priorities...' : 'RUN DISPATCH HEURISTIC'}
          </button>
        </div>

        {/* Right: Allocation Results & Matrix (7 Cols) */}
        <div className="lg:col-span-7 bg-navy-900 border border-slate-800 rounded-lg p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Recommended Dispatch Schedule
                </h3>
                <p className="text-[11px] text-slate-400">
                  Recommended positioning based on modeled susceptibility, a demo population proxy, and access.
                </p>
                <p className="text-[10px] text-slate-300 mt-1 font-mono">
                  Deployed: {deployedAmbulances}/{ambulances} ambulances · {deployedBoats}/{boats} boats · {deployedShelters}/{shelters} shelters
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block uppercase">Calculated Coverage</span>
                <span className="text-base font-black font-mono text-emerald-400">
                  {coverage}%
                </span>
              </div>
            </div>

            {/* Assignments List */}
            <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
              {assignments.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-lg">
                  Click <strong className="text-white">OPTIMIZE RESPONSE</strong> to calculate asset positioning.
                </div>
              ) : (
                assignments.map((item, idx) => {
                  const isBoat = item.resource_type === 'Rescue Boat';
                  const isShelter = item.resource_type === 'Active Shelter';
                  const badgeColor = isBoat 
                    ? 'text-cyan-400 bg-cyan-950/80 border-cyan-800' 
                    : isShelter 
                      ? 'text-emerald-400 bg-emerald-950/80 border-emerald-800'
                      : 'text-amber-400 bg-amber-950/80 border-amber-800';

                  return (
                    <div 
                      key={idx}
                      className="p-2.5 rounded-lg bg-navy-950 border border-slate-800 flex items-start justify-between gap-3 text-xs hover:border-slate-700 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-semibold text-white">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${badgeColor}`}>
                            {item.resource_type}
                          </span>
                          <span className="text-slate-200">{item.resource_name || item.resource_id}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <strong className="text-cyan-300">{item.assigned_zone_name}</strong>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug">
                          {item.rationale}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          Risk {item.risk_score ?? '—'} · Priority input includes demo population proxy (not an observed exposure result)
                        </p>
                        {item.reason?.length > 0 && (
                          <ul className="text-[10px] text-slate-400 list-disc pl-4 space-y-0.5">
                            {item.reason.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                          </ul>
                        )}
                        {item.placement_method && <p className="text-[10px] text-slate-400">
                          Placement: {item.placement_method.replace(/_/g, ' ').toLowerCase()}
                          {item.nearest_road_distance_m != null ? ` · ${item.nearest_road_distance_m} m to mapped road` : item.road_status ? ` · ${item.road_status}` : ''}
                          {item.water_status ? ` · ${item.water_status}` : ''}
                        </p>}
                        {item.placement_failed && <p className="text-[10px] text-rose-300">No valid placement: {item.placement_failure_reason}</p>}
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 uppercase block">Priority</span>
                        <span className="font-mono font-bold text-amber-400 text-xs">
                          {item.priority_score}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Action to switch to map view */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">
              * Limits cap inventory for the heuristic; deployed counts can be lower when fewer zones qualify. The map shows assigned ambulances/boats and each fixed shelter once (active shelters are highlighted).
            </span>
            {onNavigateToMap && (
              <button
                onClick={onNavigateToMap}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-blue-300 flex items-center gap-1.5 border border-slate-700 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                View On GIS Map
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
