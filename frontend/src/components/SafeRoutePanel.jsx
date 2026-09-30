import React from 'react';
import { Compass, MapPin, ArrowRight, Info, Navigation, ShieldCheck, AlertTriangle } from 'lucide-react';

function RouteCard({ route, colorClass, lineLabel, routeKey, onInspect }) {
  const hasPath = Array.isArray(route?.path) && route.path.length > 1;
  return (
    <section className="bg-navy-900 border border-slate-800 rounded-lg p-4 flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 shrink-0 rounded-full ${colorClass}`} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">{route?.name || lineLabel}</h3>
          </div>
          <span className="text-[9px] font-mono px-2 py-1 rounded bg-slate-950 text-slate-300 border border-slate-700">{hasPath ? lineLabel : 'Unavailable'}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="p-3 bg-navy-950 rounded border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Mapped geometry length</span>
            <span className="text-xl font-bold font-mono text-cyan-200">{route?.distance_m == null ? '—' : `${Number(route.distance_m).toLocaleString()} m`}</span>
          </div>
          <div className="p-3 bg-navy-950 rounded border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Travel time / risk score</span>
            <span className="text-xs font-semibold text-slate-300">Not modeled for computed path</span>
          </div>
        </div>
        <div className="mt-4 rounded bg-slate-950/70 border border-slate-800 p-3 text-[11px] leading-relaxed text-slate-300">
          {route?.description || (hasPath ? 'Geometry returned by the route API.' : 'No route geometry is available for this option.')}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-slate-400 font-mono">{hasPath ? 'Exact API-returned route geometry.' : 'No line is drawn for this unavailable alternative.'}</div>
        {hasPath && <button onClick={() => onInspect?.(routeKey)} className="shrink-0 rounded border border-cyan-700 px-2 py-1 text-[9px] font-semibold text-cyan-200 hover:bg-cyan-950/60">Inspect this route</button>}
      </div>
    </section>
  );
}

export default function SafeRoutePanel({ routes, routeScenarioId = 'EVAC-01', routeScenarios = [], onScenarioChange, onNavigateToMap }) {
  const selectedOrigin = routeScenarioId === 'EVAC-02' ? 'ZONE-E' : 'ZONE-C';
  const selectedDest = routeScenarioId === 'EVAC-02' ? 'ZONE-G' : 'ZONE-B';
  const roadNetworkUsed = routes?.road_network_used === true;
  const hasAnyPath = [routes?.shortest, routes?.risk_aware].some((route) => route?.path?.length > 1);

  return (
    <div className="h-full flex flex-col gap-4 p-5 overflow-y-auto bg-navy-950 text-slate-100">
      <div className="border-b border-slate-800 pb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">Routing Module 04</div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2"><Navigation className="h-4 w-4 text-cyan-300" />Evacuation Route Options</h2>
          <p className="text-xs text-slate-400 mt-0.5">Modeled routes from the available road snapshot. No live navigation or traffic data.</p>
        </div>
        <span className={`px-2 py-1 rounded border text-[10px] font-mono ${roadNetworkUsed ? 'bg-cyan-950/50 text-cyan-200 border-cyan-700/50' : 'bg-amber-950/30 text-amber-200 border-amber-700/50'}`}>
          {roadNetworkUsed ? 'ROAD-CONSTRAINED MODELED ROUTE' : 'MODELED FALLBACK ROUTE'}
        </span>
      </div>

      <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-300">
        <div className="font-semibold text-white">{routes?.origin?.name || selectedOrigin} <ArrowRight className="inline h-3 w-3 mx-1" /> {routes?.destination?.name || selectedDest}</div>
        <div className="mt-1 text-[10px] text-slate-400">
          Source: {roadNetworkUsed ? 'OpenStreetMap road snapshot' : 'stored modeled demo geometry'} · {routes?.water_checked ? 'Available water polygons checked' : 'Water polygon check unavailable'}
          {routes?.water_route_clear === false && ' · one or more fallback lines were withheld because they intersect mapped water'}
        </div>
      </div>

      {routes?.fallback_reason && <div className="rounded border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200"><AlertTriangle className="inline h-3.5 w-3.5 mr-1" />{routes.fallback_reason}</div>}

      <div className="bg-navy-900 border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2 text-slate-300"><MapPin className="h-3.5 w-3.5 text-amber-400" />Scenario:
            <select value={routeScenarioId} onChange={(e) => onScenarioChange?.(e.target.value)} className="bg-navy-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200 text-xs">
              {routeScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.id} · {scenario.name}</option>)}
            </select>
          </label>
          <span className="text-[10px] text-slate-500">{selectedOrigin} <ArrowRight className="inline h-3 w-3 mx-1" /> {selectedDest}</span>
        </div>
        {onNavigateToMap && <button onClick={() => onNavigateToMap(routes?.shortest?.path?.length > 1 ? 'shortest' : 'risk_aware')} disabled={!hasAnyPath} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center gap-1.5"><Compass className="w-3.5 h-3.5" />Inspect Path on Map</button>}
      </div>

      {!routes ? <div className="rounded border border-slate-800 bg-navy-900 p-5 text-sm text-slate-400">Loading modeled route data…</div> : !hasAnyPath ? <div className="rounded border border-slate-800 bg-navy-900 p-5 text-sm text-slate-400">No water-clear route geometry is available for this scenario.</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RouteCard route={routes.shortest} routeKey="shortest" onInspect={onNavigateToMap} colorClass="bg-slate-400" lineLabel={roadNetworkUsed ? 'OSM ROAD NETWORK' : 'MODELED FALLBACK'} />
          <RouteCard route={routes.risk_aware} routeKey="risk_aware" onInspect={onNavigateToMap} colorClass="bg-cyan-400" lineLabel={roadNetworkUsed ? 'WATER-CLEARANCE ALTERNATIVE' : 'MODELED FALLBACK'} />
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-lg flex items-start gap-3">
        <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 space-y-1">
          <div className="font-bold text-white flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />Operational limitations</div>
          <p className="text-slate-400 leading-relaxed text-[11px]">Road paths follow the available OSM snapshot and screen candidate segments against mapped water polygons. Coverage is partial and not real-time. Connector segments join each configured endpoint to its nearest mapped road. No live navigation, traffic, travel-time estimate, road-closure data, or validated flood-risk score is provided.</p>
          {routes?.road_network_used && <p className="text-[10px] text-cyan-300">The alternative path preference is geometric distance from mapped water only; it is not a flood-safety guarantee.</p>}
        </div>
      </div>
    </div>
  );
}
