import React, { useEffect, useState } from 'react';
import { X, Info } from 'lucide-react';
import { API_BASE } from '../services/api';

const fallbackSources = [];

export default function MethodologyPanel({ onClose }) {
  const [model, setModel] = useState(null);
  const [sources, setSources] = useState(fallbackSources);

  useEffect(() => {
    Promise.all([fetch(`${API_BASE}/methodology`), fetch(`${API_BASE}/data-sources`)]).then(async ([methodologyResponse, sourcesResponse]) => {
      if (methodologyResponse.ok) setModel(await methodologyResponse.json());
      if (sourcesResponse.ok) {
        const result = await sourcesResponse.json();
        setSources(result.sources || []);
      }
    }).catch(() => {});
  }, []);

  const weights = model?.risk_model?.weights;
  const thresholds = model?.risk_model?.classification;
  const factorLabels = { elevation: 'elevation risk', rainfall: 'rainfall risk', drainage: 'adjusted drainage risk', landcover: 'land-cover risk', water_proximity: 'water proximity risk' };
  const statusLabel = (status) => ({
    REAL_SOURCE_DATA: 'REAL',
    PARTIAL_REAL_SOURCE: 'REAL · PARTIAL EXTENT',
    MIXED_REAL_AND_DEMO: 'REAL + DEMO FALLBACK',
    FORECAST_SOURCE_DATA: 'SOURCE FORECAST',
    STALE_SOURCE_DATA: 'STALE SOURCE · DEMO FALLBACK',
    NOT_YET_CONNECTED: 'NOT YET CONNECTED',
    DEMO_FALLBACK: 'DEMO FALLBACK',
    SCENARIO_INPUT: 'SCENARIO INPUT',
    DEMO: 'DEMO'
  }[status] || status || 'UNKNOWN');
  const statusStyle = (status) => ['REAL_SOURCE_DATA', 'PARTIAL_REAL_SOURCE', 'FORECAST_SOURCE_DATA'].includes(status)
    ? 'text-emerald-300 bg-emerald-950/50 border-emerald-800'
    : status === 'NOT_YET_CONNECTED' || status === 'DEMO_FALLBACK' || status === 'MIXED_REAL_AND_DEMO' || status === 'STALE_SOURCE_DATA'
      ? 'text-amber-300 bg-amber-950/50 border-amber-800'
      : 'text-slate-300 bg-slate-900 border-slate-700';

  return (
    <div className="fixed inset-0 z-[2000] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="methodology-title">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-navy-900 p-5 shadow-2xl text-slate-100">
        <div className="flex justify-between items-start border-b border-slate-700 pb-3">
          <div><div className="text-[10px] uppercase tracking-wider text-cyan-400">Prototype transparency</div><h2 id="methodology-title" className="text-lg font-bold">Methodology & Data Sources</h2></div>
          <button onClick={onClose} aria-label="Close methodology" className="p-1 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
          {['DATA', 'HAZARD', 'EXPOSURE', 'RISK', 'OPTIMIZE', 'RESPOND'].map((step, index) => <React.Fragment key={step}><span className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5">{step}</span>{index < 5 && <span className="text-cyan-400 self-center">→</span>}</React.Fragment>)}
        </div>
        <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-300">Weighted risk score</h3>
        <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-2">
          {weights ? Object.entries(weights).map(([name, weight]) => <div key={name} className="rounded border border-slate-700 bg-slate-950 p-2"><div className="text-[10px] text-slate-400 capitalize">{name.replace('_', ' ')}</div><div className="font-mono font-bold text-cyan-300">{Math.round(weight * 100)}%</div></div>) : <div className="col-span-full text-xs text-slate-400">Risk model configuration is unavailable until the backend connects.</div>}
        </div>
        {weights && <p className="mt-3 text-xs text-slate-300">Risk score = {Object.entries(weights).map(([name, weight]) => `${Number(weight).toFixed(2)} × ${factorLabels[name] || name.replaceAll('_', ' ')}`).join(' + ')}. Rainfall also raises adjusted drainage as rainfall increases.</p>}
        {model?.exposure_definition && <p className="mt-2 text-xs text-slate-400">{model.exposure_definition}</p>}
        {model?.study_area && <div className="mt-3 rounded border border-slate-800 bg-slate-950/60 p-3 text-xs"><strong className="text-slate-200">Pilot study area:</strong> {model.study_area.name}, {model.study_area.state}, {model.study_area.country}. Configured bbox: {model.study_area.bbox.west}, {model.study_area.bbox.south} to {model.study_area.bbox.east}, {model.study_area.bbox.north}. This rectangular extent follows the retained demo-zone bounds; it is not an official administrative boundary. <span className="text-slate-500">{model.zone_generation}</span></div>}
        {thresholds && <div className="mt-3 text-xs text-slate-300">Classification: 0–{thresholds.low} LOW · {thresholds.low + 1}–{thresholds.moderate} MODERATE · {thresholds.moderate + 1}–{thresholds.high} HIGH · {thresholds.high + 1}–100 CRITICAL</div>}
        <div className="mt-3 flex gap-2 rounded border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200"><Info className="w-4 h-4 shrink-0" /><span>These weights are configurable prototype assumptions and have not yet been calibrated against historical flood observations.</span></div>
        <h3 className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-300">Data sources</h3>
        <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-slate-400"><tr><th className="p-2">Dataset</th><th className="p-2">Status</th><th className="p-2">Source and provenance</th></tr></thead><tbody>{sources.map(item => <tr key={item.category} className="border-t border-slate-800 align-top"><td className="p-2 font-medium capitalize">{item.category}</td><td className="p-2"><span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold ${statusStyle(item.status)}`}>{statusLabel(item.status)}</span></td><td className="p-2 text-slate-300"><div>{item.source}</div><div className="mt-0.5 text-[10px] text-slate-400">{item.description}</div><div className="mt-1 text-[9px] text-slate-500">{item.spatial_resolution}{item.retrieved_at ? ` · retrieved ${item.retrieved_at}` : ''}{item.license ? ` · ${item.license}` : ''}</div>{item.attribution && <div className="mt-1 text-[9px] text-slate-500">{item.attribution}</div>}</td></tr>)}</tbody></table></div>
        <p className="mt-3 text-[11px] text-slate-400">Copernicus elevation and the retrieved partial OpenStreetMap snapshot are real source data. OSM mapping is incomplete and uncovered areas/categories retain labeled demo fallbacks. Open-Meteo rainfall is a model forecast for its displayed time window, not a rain-gauge observation; scenario inputs remain separate. The legacy demo population proxy is used only inside optimizer scoring and is not reported as a spatial exposure result.</p>
      </div>
    </div>
  );
}
