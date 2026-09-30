import React from 'react';
import { AlertOctagon, Building2, ShieldCheck, MapPin } from 'lucide-react';

export default function RiskSummary({ summaryData, exposureData }) {
  const {
    high_risk_zones = 0,
    critical_infrastructure = 0,
    infrastructure_counts = {},
    resource_coverage = 0,
    risk_score = 0,
    risk_category = 'LOW',
    rainfall_mm = 120
  } = summaryData || {};
  const rainfallDescription = !summaryData
    ? 'Selected scenario updating'
    : summaryData.rainfall_mode === 'forecast'
      ? `Source forecast · ${rainfall_mm} mm · ${summaryData?.rainfall_provenance?.accumulation_period || 'time window unavailable'}`
      : `Scenario rainfall · ${rainfall_mm} mm · user-defined simulation`;

  const kpis = [
    {
      title: 'OSM ROAD LENGTH EXPOSED',
      value: exposureData ? `${(exposureData.roads.exposed_length_m / 1000).toFixed(2)} km` : '—',
      subtext: exposureData ? `${exposureData.roads.exposure_percent.toFixed(2)}% of ${ (exposureData.roads.total_length_m / 1000).toFixed(2)} km · HIGH / CRITICAL mask` : 'Spatial exposure analysis loading',
      icon: MapPin,
      color: 'text-orange-400',
      border: 'border-orange-500/30',
      bg: 'bg-orange-950/20'
    },
    {
      title: 'HIGH / CRITICAL CELLS',
      value: summaryData ? `${high_risk_zones} / ${summaryData?.total_zones_count ?? 0}` : '—',
      subtext: summaryData ? `Regional composite: ${risk_category}` : 'Selected scenario updating',
      icon: AlertOctagon,
      color: high_risk_zones >= 5 ? 'text-red-400' : 'text-orange-400',
      border: high_risk_zones >= 5 ? 'border-red-500/30' : 'border-orange-500/30',
      bg: high_risk_zones >= 5 ? 'bg-red-950/20' : 'bg-orange-950/20'
    },
    {
      title: 'FACILITY INVENTORY',
      value: summaryData ? critical_infrastructure.toString() : '—',
      subtext: summaryData ? `Inventory only · ${infrastructure_counts.hospitals ?? 0} hospitals • ${infrastructure_counts.shelters ?? 0} shelters • ${infrastructure_counts.schools ?? 0} schools` : 'Scenario results updating',
      icon: Building2,
      color: 'text-blue-400',
      border: 'border-blue-500/30',
      bg: 'bg-blue-950/20'
    },
    {
      title: 'SCENARIO COVERAGE',
      value: summaryData ? `${resource_coverage}%` : '—',
      subtext: 'Simulated capacity vs rainfall stress',
      icon: ShieldCheck,
      color: resource_coverage >= 70 ? 'text-emerald-400' : 'text-yellow-400',
      border: resource_coverage >= 70 ? 'border-emerald-500/30' : 'border-yellow-500/30',
      bg: resource_coverage >= 70 ? 'bg-emerald-950/20' : 'bg-yellow-950/20'
    }
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
        <span className="font-semibold uppercase tracking-wider text-slate-300">
          Executive Disaster KPI Stream
        </span>
        <span className="font-mono text-[10px] text-slate-400 italic">
          * Scenario-based risk simulation · {rainfallDescription}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className={`p-3 rounded-lg border ${kpi.border} ${kpi.bg} bg-navy-900/80 backdrop-blur transition-all duration-200 hover:border-slate-600`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  {kpi.title}
                </span>
                <Icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-xl font-bold font-mono tracking-tight ${kpi.color}`}>
                  {kpi.value}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400 truncate">
                {kpi.subtext}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
