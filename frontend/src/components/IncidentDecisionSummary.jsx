import React, { useMemo } from 'react';
import {
  Activity, AlertTriangle, Ambulance, ArrowUpRight, CheckCircle2,
  ChevronRight, CloudRain, Database, Info, MapPin, Package, Ship, Tent,
  Waypoints
} from 'lucide-react';

const FACTOR_LABELS = {
  rainfall: 'Rainfall',
  elevation: 'Elevation',
  drainage: 'Drainage',
  landcover: 'Land cover',
  water_proximity: 'Water proximity'
};

const formatNumber = (value) => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString();

function sourceStatus(source) {
  if (!source) return 'STATUS UNAVAILABLE';
  if (source.status === 'PARTIAL_REAL_SOURCE') return 'REAL SOURCE · PARTIAL COVERAGE';
  if (source.status === 'MIXED_REAL_AND_DEMO') return 'REAL + DEMO FALLBACK';
  if (source.status === 'FORECAST_SOURCE_DATA') return 'SOURCE FORECAST';
  if (source.status === 'REAL_SOURCE_DATA' || source.is_real) return 'REAL SOURCE';
  return 'DEMO FALLBACK';
}

function inventoryState(remaining, available) {
  if (available == null) return 'Inventory unavailable';
  if (available === 0) return 'No inventory listed';
  if (remaining === 0) return 'Inventory fully allocated';
  return 'Resource available';
}

function Panel({ title, icon: Icon, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-navy-900/80 p-4 shadow-lg ${className}`}>
      <div className="mb-3 flex items-center gap-2 border-b border-slate-800 pb-2">
        {Icon && <Icon className="h-4 w-4 text-cyan-400" />}
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ResourceCount({ icon: Icon, label, deployed, available }) {
  const deployedCount = deployed == null || !Number.isFinite(Number(deployed)) ? null : Number(deployed);
  const remaining = available == null || deployedCount == null ? null : Math.max(0, available - deployedCount);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-800/70 py-2 last:border-0">
      <div className="flex min-w-0 items-center gap-2 text-xs text-slate-300">
        <Icon className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
        <span>{label}</span>
      </div>
      <div className="text-right">
        <div className="font-mono text-xs font-bold text-white">{deployedCount == null ? '—' : deployedCount} / {available ?? '—'}</div>
        <div className="text-[9px] text-slate-500">deployed / available</div>
      </div>
      <div className="col-span-2 text-[10px] text-slate-400">
        Remaining capacity: {remaining == null ? '—' : formatNumber(remaining)} · {inventoryState(remaining, available)}
      </div>
    </div>
  );
}

function CapacityRow({ label, used, total }) {
  const remaining = total == null || used == null ? null : Math.max(0, total - used);
  return <div className="flex items-center justify-between border-b border-slate-800/70 py-2 last:border-0">
    <span className="text-xs text-slate-300">{label}</span>
    <span className="text-right"><b className="font-mono text-xs text-white">Remaining capacity: {remaining == null ? '—' : formatNumber(remaining)}</b><small className="block text-[9px] text-slate-500">{inventoryState(remaining, total)}</small></span>
  </div>;
}

export default function IncidentDecisionSummary({
  simulationData,
  optimizationResult,
  resourceInventory,
  routes,
  routeScenarios = [],
  dataSources = {},
  rainfallMode,
  rainfall,
  rainfallSource,
  reliefKitsSelected,
  isSimulating,
  isOptimizing,
  onSelectZone,
  onSelectResource,
  onShowRoutes
}) {
  const assignments = optimizationResult?.assignments || [];
  // Preserve the exact order supplied by the optimizer, including its stable tie order.
  const priorityZones = (optimizationResult?.zone_priorities || []).slice(0, 5);
  const zoneLookup = new Map((simulationData?.zones || []).map((zone) => [zone.id, zone]));
  const deployed = {
    ambulances: assignments.filter((item) => item.resource_type === 'Ambulance'),
    boats: assignments.filter((item) => item.resource_type === 'Rescue Boat'),
    shelters: assignments.filter((item) => item.resource_type === 'Active Shelter')
  };
  const available = {
    ambulances: resourceInventory?.ambulances?.length,
    boats: resourceInventory?.boats?.length,
    shelters: resourceInventory?.shelters?.length
  };
  const reliefStock = resourceInventory?.relief_kits_stock_simulated;
  const selectedReliefKits = optimizationResult?.relief_kits_available_simulated ?? reliefKitsSelected;

  const drivers = useMemo(() => {
    const totals = new Map();
    priorityZones.forEach((priority) => {
      const zone = zoneLookup.get(priority.zone_id);
      Object.entries(zone?.factor_contributions || {}).forEach(([key, contribution]) => {
        const points = Number(contribution?.contribution);
        if (!Number.isFinite(points) || !FACTOR_LABELS[key]) return;
        totals.set(key, (totals.get(key) || 0) + points);
      });
    });
    return [...totals.entries()]
      .map(([key, points]) => ({ key, label: FACTOR_LABELS[key], points }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 4);
  }, [priorityZones, zoneLookup]);

  const effectiveMode = simulationData?.rainfall_mode;
  const rainfallValue = simulationData?.rainfall_mm;
  const isActiveForecast = effectiveMode === 'forecast' && simulationData?.rainfall_source === 'FORECAST';
  const requestedForecastPending = !simulationData && rainfallMode === 'forecast';
  const rainfallDisplay = simulationData
    ? isActiveForecast
      ? `Forecast · ${formatNumber(rainfallValue)} ${simulationData.rainfall_unit || 'mm'} / ${simulationData.rainfall_period_hours || 24}h`
      : simulationData.rainfall_source === 'DEMO_FALLBACK'
        ? `Forecast unavailable · scenario fallback ${formatNumber(rainfallValue)} ${simulationData.rainfall_unit || 'mm'} / 24h`
        : `Scenario · ${formatNumber(rainfallValue)} ${simulationData.rainfall_unit || 'mm'} / ${simulationData.rainfall_period_hours || 24}h · hypothetical simulation`
    : requestedForecastPending
      ? `Forecast selected · ${formatNumber(rainfallSource?.forecast?.value_mm)} mm / 24h · updating`
      : `Scenario · ${formatNumber(rainfall)} mm / 24h · hypothetical simulation`;

  const routeAlternatives = ['shortest', 'risk_aware'].filter((key) => (routes?.[key]?.path?.length || 0) > 1);
  const routesAvailable = routeAlternatives.length > 0;
  const waterCheckedEndpoints = routes?.water_checked_endpoints ?? 0;
  const realSources = [
    ['elevation', 'Copernicus DEM'],
    ['water_bodies', 'OpenStreetMap water'],
    ['roads', 'OpenStreetMap roads']
  ].filter(([key]) => dataSources[key]?.is_real);
  const forecastSourceActive = isActiveForecast && dataSources.rainfall?.is_real;

  return (
    <div className="h-full overflow-y-auto bg-navy-950 p-4 text-slate-100 lg:p-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-cyan-400">
              <Activity className="h-3.5 w-3.5" /> Incident command · decision support
            </div>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-white">Incident Decision Summary</h1>
            <p className="mt-1 text-xs text-slate-400">Current modeled situation, optimizer deployments, coverage, and response options.</p>
          </div>
          <div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${isActiveForecast ? 'border-cyan-700 bg-cyan-950/40 text-cyan-200' : 'border-amber-700 bg-amber-950/30 text-amber-200'}`}>
            <span className="text-[9px] uppercase tracking-wider opacity-75">Current mode</span>
            <div className="mt-0.5 flex items-center gap-1.5"><CloudRain className="h-3.5 w-3.5" />{rainfallDisplay}</div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Panel title="Risk status" icon={AlertTriangle}>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-orange-900/70 bg-orange-950/20 p-2.5">
                <div className="text-[9px] uppercase text-slate-400">High + critical susceptibility cells</div>
                <div className="mt-1 font-mono text-xl font-bold text-orange-300">
                  {simulationData ? `${formatNumber(simulationData.high_risk_zones)} / ${formatNumber(simulationData.total_zones_count)}` : '—'}
                </div>
              </div>
              <div className="rounded-lg border border-blue-900/70 bg-blue-950/20 p-2.5">
                <div className="text-[9px] uppercase text-slate-400">Facility inventory*</div>
                <div className="mt-1 font-mono text-xl font-bold text-blue-300">{formatNumber(simulationData?.critical_infrastructure_count)}</div>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">* Inventory total, not a hazard-exposed count. Open Flood Exposure for spatially tested results.</p>
          </Panel>

          <Panel title="Resource status" icon={Ambulance}>
            {isOptimizing && <p className="mb-1 text-[10px] text-cyan-300">Updating from the optimizer…</p>}
            <ResourceCount icon={Ambulance} label="Ambulances" deployed={optimizationResult ? deployed.ambulances.length : '—'} available={available.ambulances} />
            <ResourceCount icon={Ship} label="Rescue boats" deployed={optimizationResult ? deployed.boats.length : '—'} available={available.boats} />
            <ResourceCount icon={Tent} label="Shelters activated" deployed={optimizationResult ? deployed.shelters.length : '—'} available={available.shelters} />
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-2"><Package className="h-3.5 w-3.5 text-purple-300" />Relief kits</span>
                <span className="font-mono text-white">Not allocated / {formatNumber(reliefStock)}</span>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">Selected for this scenario: {formatNumber(selectedReliefKits)} · zone-level kit allocation is not modeled.</p>
            </div>
          </Panel>

          <Panel title="Resource coverage" icon={CheckCircle2}>
            <div className="flex items-end gap-2">
              <span className="font-mono text-4xl font-black text-emerald-300">{optimizationResult ? `${formatNumber(optimizationResult.resource_coverage_pct)}%` : '—'}</span>
              <span className="pb-1 text-[10px] uppercase tracking-wider text-slate-400">Optimizer estimate</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">Calculated optimizer coverage under the selected scenario and available resource inventory.</p>
            <p className="mt-2 rounded border border-slate-800 bg-slate-950/70 p-2 text-[10px] text-slate-500">This is the existing optimizer coverage metric. It does not mean this share of the city is protected.</p>
          </Panel>
        </div>

        <Panel title="Priority zones · optimizer ordering" icon={MapPin}>
          {isOptimizing && <p className="mb-2 text-[10px] text-cyan-300">Waiting for the current optimizer response…</p>}
          {!priorityZones.length ? (
            <div className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-xs text-slate-400">{isOptimizing ? 'Priority list updating.' : 'No current optimizer priority list is available.'}</div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
              {priorityZones.map((priority, index) => {
                const assigned = assignments.filter((item) => item.assigned_zone_id === priority.zone_id);
                const explanation = assigned.find((item) => item.rationale)?.rationale;
                return (
                  <button key={priority.zone_id} onClick={() => onSelectZone?.(priority.zone_id)} className="group rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-left transition hover:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[9px] font-mono uppercase tracking-wider text-cyan-400">#{index + 1} · {priority.zone_id}</div>
                        <div className="mt-1 line-clamp-2 text-xs font-semibold text-white">{priority.zone_name}</div>
                      </div>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-cyan-300" />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-400">
                      <span>Risk <b className="font-mono text-slate-200">{formatNumber(priority.risk_score)}</b></span>
                      <span>Priority <b className="font-mono text-amber-300">{formatNumber(priority.priority_score)}</b></span>
                      <span>Infrastructure <b className="font-mono text-slate-200">{formatNumber(priority.infrastructure_asset_count)}</b></span>
                    </div>
                    <p className="mt-2 border-t border-slate-800 pt-2 text-[10px] leading-snug text-slate-400">
                      {explanation || (assigned.length ? assigned[0].reason?.slice(0, 2).join(' · ') || 'No optimizer explanation supplied.' : 'No resource assignment for this zone under the selected inventory.')}
                    </p>
                    <span className="mt-2 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-cyan-400">Open zone inspector <ChevronRight className="h-3 w-3" /></span>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Panel title="Key risk drivers · weighted contributions" icon={Activity}>
            <p className="mb-2 text-[10px] text-slate-500">Sum of existing weighted contribution points across the current top priority zones.</p>
            {!drivers.length ? <p className="text-xs text-slate-400">No current factor contribution data.</p> : (
              <div className="space-y-2">
                {drivers.map((driver) => {
                  const max = drivers[0]?.points || 1;
                  return <div key={driver.key}>
                    <div className="mb-1 flex justify-between text-xs"><span className="text-slate-300">{driver.label}</span><span className="font-mono text-slate-200">{driver.points.toFixed(2)} points</span></div>
                    <div className="h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full rounded bg-cyan-500" style={{ width: `${Math.max(2, Math.min(100, (driver.points / max) * 100))}%` }} /></div>
                  </div>;
                })}
              </div>
            )}
          </Panel>

          <Panel title="Remaining resource capacity" icon={Package}>
            <CapacityRow label="Ambulances" used={optimizationResult ? deployed.ambulances.length : null} total={available.ambulances} />
            <CapacityRow label="Rescue boats" used={optimizationResult ? deployed.boats.length : null} total={available.boats} />
            <CapacityRow label="Shelters" used={optimizationResult ? deployed.shelters.length : null} total={available.shelters} />
            <div className="flex items-center justify-between border-t border-slate-700 py-2">
              <span className="text-xs text-slate-300">Relief kits</span>
              <span className="text-right"><b className="font-mono text-xs text-white">Listed stock: {formatNumber(reliefStock)}</b><small className="block text-[9px] text-slate-500">{reliefStock == null ? 'Inventory unavailable' : reliefStock === 0 ? 'No inventory listed' : 'Unallocated · optimizer has no kit assignments'}</small></span>
            </div>
            <div className="mt-1 rounded border border-slate-800 bg-slate-950/60 p-2 text-[10px] text-slate-500">Vehicle and shelter capacity subtracts actual optimizer assignments. Relief kits are listed separately because the optimizer does not allocate them. No unmodeled shortage is inferred.</div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Panel title="Evacuation status" icon={Waypoints}>
            {routesAvailable ? <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-950/70 p-3"><div className="text-[9px] uppercase text-slate-500">Available modeled routes</div><div className="mt-1 font-mono text-lg font-bold text-white">{routeAlternatives.length}</div><div className="text-[10px] text-slate-400">alternatives · {routes.scenario_id}</div></div>
                <div className="rounded-lg bg-slate-950/70 p-3"><div className="text-[9px] uppercase text-slate-500">Water-checked endpoints</div><div className="mt-1 font-mono text-lg font-bold text-cyan-200">{waterCheckedEndpoints} / 2</div><div className="text-[10px] text-slate-400">current modeled scenario</div></div>
              </div>
              {routeScenarios.length > 0 && <p className="mt-2 text-[10px] text-slate-400">Scenario library: {routeScenarios.length} stored route scenarios.</p>}
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{routes.recommendation || routes.note || 'Modeled demo routes; not live traffic/navigation.'}</p>
            </> : <p className="text-xs text-slate-400">No modeled evacuation route available.</p>}
            {onShowRoutes && <button onClick={onShowRoutes} className="mt-3 inline-flex items-center gap-1 rounded border border-slate-700 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-300 hover:bg-slate-800">Open route scenarios <ChevronRight className="h-3 w-3" /></button>}
          </Panel>

          <Panel title="Data status & provenance" icon={Database}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <h3 className="mb-1.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300"><CheckCircle2 className="h-3 w-3" />Real source data</h3>
                <ul className="space-y-1 text-[10px] text-slate-300">
                  {realSources.map(([key, label]) => <li key={key} className="flex items-start justify-between gap-2"><span>✓ {label}</span><span className="text-right text-[8px] text-emerald-400">{sourceStatus(dataSources[key])}</span></li>)}
                  {forecastSourceActive && <li>✓ Open-Meteo forecast · active input</li>}
                  {!realSources.length && !forecastSourceActive && <li className="text-slate-500">No active real-source layers reported.</li>}
                </ul>
              </div>
              <div>
                <h3 className="mb-1.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-amber-300"><Info className="h-3 w-3" />Modeled / demo data</h3>
                <ul className="space-y-1 text-[10px] text-slate-300">
                  <li>• Demo population proxy is used only by the optimizer; it is not reported as an exposure result</li>
                  <li>• Drainage and land-cover factors</li>
                  <li>• Resource inventory and relief-kit stock</li>
                  <li>• Saved evacuation route geometry</li>
                  <li>• Facilities: {sourceStatus(dataSources.infrastructure).toLowerCase()}</li>
                  {simulationData?.rainfall_source === 'SCENARIO' && <li>• Scenario rainfall is hypothetical</li>}
                </ul>
              </div>
            </div>
          </Panel>
        </div>

        {assignments.some((item) => item.resource_type === 'Ambulance' || item.resource_type === 'Rescue Boat') && (
          <Panel title="Deployed resources · open existing map marker" icon={MapPin}>
            <div className="flex flex-wrap gap-2">
              {assignments.filter((item) => item.resource_type === 'Ambulance' || item.resource_type === 'Rescue Boat').map((resource) => (
                <button key={resource.resource_id} onClick={() => onSelectResource?.(resource)} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-left text-[10px] text-slate-200 hover:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-600">
                  {resource.resource_type === 'Ambulance' ? <Ambulance className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : <Ship className="h-3.5 w-3.5 shrink-0 text-cyan-300" />}
                  <span className="truncate">{resource.resource_name || resource.resource_id}</span>
                  <span className="shrink-0 text-slate-500">{resource.assigned_zone_id}</span>
                  <ArrowUpRight className="h-3 w-3 shrink-0 text-cyan-400" />
                </button>
              ))}
            </div>
          </Panel>
        )}

        <details className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-[10px] text-slate-400">
          <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-slate-300"><AlertTriangle className="h-3.5 w-3.5 text-amber-300" />Operator notes and limitations</summary>
          <ul className="mt-2 grid gap-1 pl-5 leading-relaxed md:grid-cols-2">
            <li>Prototype decision-support output.</li>
            <li>OSM coverage is partial.</li>
            <li>Population, drainage and land-cover factors remain modeled where real datasets are unavailable.</li>
            <li>Scenario rainfall is hypothetical when selected; forecast rainfall is model-based source data.</li>
            <li>Evacuation routes are modeled demo routes, not live traffic/navigation.</li>
            <li>Not a validated hydraulic flood model or official flood forecast.</li>
          </ul>
        </details>

        {isSimulating && <div className="sr-only" aria-live="polite">Updating risk summary from the selected rainfall input.</div>}
      </div>
    </div>
  );
}
