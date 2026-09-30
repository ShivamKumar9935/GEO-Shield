import React from 'react';
import { 
  ShieldAlert, 
  Users, 
  Crosshair, 
  Compass, 
  Sliders, 
  MapPin, 
  Activity,
  Layers,
  Info,
  ClipboardList
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'incident_summary', label: '1. Incident Decision Summary', icon: ClipboardList, desc: 'Risk, deployment, gaps & response status' },
  { id: 'risk_overview', label: '2. Risk Overview', icon: ShieldAlert, desc: 'GIS hazard map & multi-risk layers' },
  { id: 'exposure_analysis', label: '3. Flood Exposure', icon: Users, desc: 'Spatial overlap with available datasets' },
  { id: 'resource_optimizer', label: '4. Resource Optimizer', icon: Crosshair, desc: 'Explainable heuristic dispatch' },
  { id: 'safe_routes', label: '5. Safe Routes', icon: Compass, desc: 'Modeled evacuation route scenarios' },
  { id: 'scenario_simulator', label: '6. Scenario Simulator', icon: Sliders, desc: 'What-if disaster stress modeling' },
];

export default function NavigationSidebar({ activeTab, setActiveTab, simulationRainfall, onOpenMethodology, studyArea }) {
  const locationName = studyArea?.name || 'Potheri / SRM KTR';
  const latitude = studyArea?.latitude ?? 12.8235;
  return (
    <aside className="w-64 bg-navy-900 border-r border-slate-800 flex flex-col justify-between select-none">
      <div>
        {/* Brand / Logo */}
        <div className="p-4 border-b border-slate-800/80 bg-navy-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <ShieldAlert className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                GEO-SHIELD
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/50">
                  v1.0
                </span>
              </h1>
              <p className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">
                Flood Exposure & Decision Support
              </p>
            </div>
          </div>

          {/* Core Pipeline Step Indicator */}
          <div className="mt-3.5 pt-2.5 border-t border-slate-800/70">
            <div className="text-[9px] font-semibold tracking-wider uppercase text-slate-400 mb-1 flex items-center gap-1">
              <Activity className="w-3 h-3 text-cyan-400" />
              Decision Pipeline
            </div>
            <div className="text-[9.5px] font-mono font-medium text-cyan-300/90 tracking-tight bg-slate-900/80 py-1 px-1.5 rounded border border-slate-800">
              HAZARD → EXPOSURE → OPTIMIZE → RESPOND
            </div>
          </div>
        </div>

        {/* Study Area Badge */}
        <div className="px-4 py-2.5 bg-slate-900/40 border-b border-slate-800/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-300 font-medium">
            <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="truncate">{locationName}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">{latitude.toFixed(2)}°N</span>
        </div>

        {/* Navigation Items */}
        <nav className="p-2.5 space-y-1">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Operations & Analytics
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-md text-xs font-medium transition-all duration-150 flex items-center gap-3 ${
                  isActive
                    ? 'bg-blue-600/20 text-white border border-blue-500/50 shadow-sm shadow-blue-900/40'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                <div className="flex-1 truncate">
                  <div className="font-semibold">{item.label}</div>
                  <div className="text-[10px] text-slate-400 font-normal truncate">{item.desc}</div>
                </div>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer / Context Notice */}
      <div className="p-3 border-t border-slate-800 bg-navy-950/70 text-[10px] space-y-2">
        <button onClick={onOpenMethodology} className="w-full flex items-center gap-2 rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-left text-xs font-semibold text-cyan-300 hover:bg-slate-800">
          <Info className="w-3.5 h-3.5" /> Methodology & Data Sources
        </button>
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="text-amber-300 font-medium">● Simulation Active</span>
          </span>
          <span className="font-mono text-cyan-400 font-semibold">{simulationRainfall} mm</span>
        </div>
        <p className="text-slate-400 leading-tight">
          GEOIMATHON Problem 4.4 · demonstrative spatial exposure analysis.
        </p>
      </div>
    </aside>
  );
}
