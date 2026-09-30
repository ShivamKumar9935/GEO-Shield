"""
FastAPI application for GEO-SHIELD:
Geospatial Disaster Risk Intelligence & Emergency Resource Optimization
"""

import os
from copy import deepcopy
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List, Literal
from rainfall_data import (
    load_rainfall_record,
    load_active_rainfall_forecast,
    resolve_rainfall_input,
    scenario_rainfall_input,
)

from models import (
    SimulationRequest,
    OptimizationRequest,
    SimulationResponse,
    InfrastructureResponse,
    ResourceInventoryResponse,
    RouteResponse
)
from risk_engine import RiskEngine
from exposure_analysis import build_exposure_summary
from optimizer import ResourceOptimizer
from routing import EvacuationRouter
from data_loader import (
    load_risk_zones_geojson,
    load_infrastructure_data,
    load_resources_data,
    load_routes_data,
    load_normalized_infrastructure,
    load_normalized_resources,
    load_active_study_area,
    load_data_provenance,
    using_real_risk_grid,
    real_data_enabled
)
from risk_engine import load_risk_config
RISK_CONFIG = load_risk_config()
RAINFALL_MIN = RISK_CONFIG["rainfall"]["min_mm"]
RAINFALL_MAX = RISK_CONFIG["rainfall"]["max_mm"]

EXPOSURE_DEFINITION = (
    "A legacy tier-based population proxy is retained for optimizer priority/coverage calculations only. "
    "It is not a spatial exposure measurement and is not reported as an exposure result in the dashboard."
)

def effective_data_sources() -> Dict[str, Any]:
    """Describe the layers this process can actually serve, including forced fallback mode."""
    datasets = deepcopy(load_data_provenance().get("datasets", {}))
    area = load_active_study_area()
    for key, entry in datasets.items():
        if key == "rainfall":
            rainfall_record = load_rainfall_record()
            active_forecast = load_active_rainfall_forecast()
            if active_forecast:
                entry.update({field: active_forecast[field] for field in (
                    "name", "source", "license", "attribution", "retrieved_at",
                    "spatial_resolution", "geographic_extent", "accumulation_period",
                    "unit", "period_hours"
                ) if field in active_forecast})
                entry["is_real"] = True
                entry["status"] = "FORECAST_SOURCE_DATA"
                entry["description"] = f"Forecast precipitation: {active_forecast['value_mm']} mm for {active_forecast['accumulation_period']}. Model-derived, not an observed rain-gauge value."
            else:
                entry["is_real"] = False
                entry["status"] = (rainfall_record or {}).get("effective_status", "SCENARIO_INPUT")
                if entry["status"] == "SCENARIO_INPUT":
                    entry["description"] = "Source forecast is not cached; user-defined scenario rainfall remains available."
                elif entry["status"] == "STALE_SOURCE_DATA":
                    entry["description"] = "Cached source forecast has expired; user-defined scenario rainfall remains available."
                else:
                    entry["description"] = "Real-data mode is disabled; scenario rainfall remains available."
            continue
        is_active = real_data_enabled()
        relative_file = None
        if key == "elevation":
            relative_file = area["risk_grid_file"]
        elif key in {"roads", "water_bodies", "infrastructure"}:
            relative_file = area["osm_layers_file"]
        if relative_file and not (os.path.exists(os.path.join(os.path.dirname(__file__), "data", relative_file)) and is_active):
            is_active = False
        if entry.get("is_real") is True and not is_active:
            entry["is_real"] = False
            entry["status"] = "DEMO_FALLBACK"
            entry["description"] = f"Real source layer is not active in this process; the retained demo fallback is being served. {entry.get('description', '')}"
    return datasets

def rainfall_provenance_for_scenario(value_mm: float) -> Dict[str, Any]:
    return scenario_rainfall_input(value_mm)["provenance"]

def resolve_rainfall(value_mm: float, mode: str):
    selected = resolve_rainfall_input(value_mm, mode)
    return selected["value_mm"], selected["active_mode"], selected["provenance"]

def calculate_resource_coverage(rainfall: float, ambulances: int, boats: int, shelters: int) -> int:
    inventory = load_resources_data()
    shelter_inventory = load_infrastructure_data()
    ambulance_count = min(ambulances, len(inventory.get("ambulances", [])))
    boat_count = min(boats, len(inventory.get("boats", [])))
    shelter_count = min(shelters, len(shelter_inventory.get("shelters", [])))
    estimate = round((ambulance_count * 6.5 + boat_count * 8.0 + shelter_count * 5.0) - ((rainfall - RAINFALL_MIN) * 0.18) + 25.0)
    return max(25, min(95, estimate))

app = FastAPI(
    title="GEO-SHIELD API",
    description="Geospatial Disaster Risk Intelligence & Emergency Resource Optimization for Potheri / SRM KTR",
    version="1.0.0"
)

# Enable CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv(
        "GEO_SHIELD_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",") if origin.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

risk_engine = RiskEngine()
optimizer = ResourceOptimizer()
router = EvacuationRouter()

@app.get("/health")
def health_check() -> Dict[str, str]:
    study_area = load_active_study_area()
    has_real_elevation = using_real_risk_grid()
    return {
        "status": "healthy",
        "service": "GEO-SHIELD Geospatial Intelligence Engine",
        "study_area": f"{study_area['name']}, {study_area['state']}, {study_area['country']}",
        "mode": "REAL ELEVATION + DEMO FALLBACKS" if has_real_elevation else "DEMO / SIMULATION"
    }

@app.get("/methodology")
def get_methodology() -> Dict[str, Any]:
    data_sources = effective_data_sources()
    return {
        "risk_model": risk_engine.config,
        "exposure_definition": EXPOSURE_DEFINITION,
        "model_status": "Prototype heuristic; not calibrated against historical flood observations and not a hydrological flood model.",
        "study_area": load_active_study_area(),
        "data_sources": data_sources,
        "zone_generation": "Real Copernicus DEM sampled on a configurable grid within retained demo-zone footprints; missing factors use demo fallbacks." if using_real_risk_grid() else "Retained Phase 1 demo zones; real-data layers are disabled or unavailable, so demo fallback mode is active."
    }

@app.get("/data-sources")
def get_data_sources() -> Dict[str, Any]:
    datasets = effective_data_sources()
    return {
        "status": "MIXED REAL / DEMO" if real_data_enabled() and any(item.get("is_real") is True for item in datasets.values()) else "DEMO / SIMULATION",
        "study_area": load_active_study_area(),
        "sources": [{"category": key.replace("_", " ").title(), **metadata} for key, metadata in datasets.items()]
    }

@app.get("/study-area")
def get_study_area() -> Dict[str, Any]:
    return load_active_study_area()

@app.get("/rainfall")
def get_rainfall(
    mode: Literal["scenario", "forecast"] = Query(default="scenario"),
    scenario_mm: float = Query(default=120.0, ge=RAINFALL_MIN, le=RAINFALL_MAX)
) -> Dict[str, Any]:
    """Return cached source forecast plus the user scenario; this endpoint never fetches external data."""
    forecast = load_rainfall_record()
    forecast_view = None
    if forecast:
        forecast_view = {
            **forecast,
            "is_real": bool(forecast.get("active")),
            "status": forecast.get("effective_status", "STALE_SOURCE_DATA")
        }
    scenario = rainfall_provenance_for_scenario(scenario_mm)
    selected_input = resolve_rainfall_input(scenario_mm, mode)
    selected = selected_input["provenance"]
    selected_mode = selected_input["active_mode"]
    return {
        "status": "success",
        "requested_mode": mode,
        "active_mode": selected_mode,
        "rainfall_source": selected_input["rainfall_source"],
        "period_hours": selected_input["period_hours"],
        "unit": selected_input["unit"],
        "type": selected.get("type", selected_mode),
        "value_mm": selected_input["value_mm"],
        "source": selected.get("source"),
        "accumulation_period": selected.get("accumulation_period"),
        "retrieved_at": selected.get("retrieved_at"),
        "is_real": selected.get("is_real", False),
        "data_status": selected.get("status"),
        "scenario": scenario,
        "forecast": forecast_view,
        "fallback_reason": "Cached source forecast is unavailable, expired, or disabled; the selected scenario value is returned." if mode == "forecast" and selected_mode != "forecast" else None
    }

@app.get("/risk-zones")
def get_risk_zones(
    rainfall: float = Query(default=120.0, ge=RAINFALL_MIN, le=RAINFALL_MAX),
    rainfall_mode: Literal["scenario", "forecast"] = Query(default="scenario")
) -> Dict[str, Any]:
    """
    Returns GeoJSON FeatureCollection of study area zones with dynamic risk attributes.
    """
    rainfall, selected_mode, rain_source = resolve_rainfall(rainfall, rainfall_mode)
    zones_data = risk_engine.evaluate_all_zones(rainfall_mm=rainfall, rainfall_provenance=rain_source)
    geojson_raw = load_risk_zones_geojson()
    
    # Merge evaluated dynamic properties into GeoJSON features
    features = []
    zone_dict = {z["id"]: z for z in zones_data}
    for feat in geojson_raw.get("features", []):
        z_id = feat["properties"]["id"]
        if z_id in zone_dict:
            evaluated = zone_dict[z_id]
            merged_props = {**feat["properties"], **evaluated}
            features.append({
                "type": "Feature",
                "properties": merged_props,
                "geometry": feat["geometry"]
            })

    return {
        "type": "FeatureCollection",
        "name": f"{load_active_study_area()['id']}_dynamic_risk_grid",
        "simulation_state": "REAL ELEVATION + DEMO FALLBACKS" if using_real_risk_grid() else "DEMO / SIMULATION",
        "zone_generation": "risk_grid" if any(zone.get("data_provenance", {}).get("elevation", {}).get("status") == "REAL_SOURCE_DATA" for zone in zones_data) else "retained_demo_polygons",
        "rainfall_mm": rainfall,
        "rainfall_mode": selected_mode,
        "rainfall_source": rain_source.get("rainfall_source", "SCENARIO"),
        "rainfall_period_hours": rain_source.get("period_hours", 24),
        "rainfall_unit": rain_source.get("unit", "mm"),
        "rainfall_provenance": rain_source,
        "features": features
    }

@app.get("/risk-summary")
def get_risk_summary(
    rainfall: float = Query(default=120.0, ge=RAINFALL_MIN, le=RAINFALL_MAX),
    ambulances: int = Query(default=3, ge=0, le=8),
    boats: int = Query(default=2, ge=0, le=5),
    shelters: int = Query(default=4, ge=0, le=4),
    rainfall_mode: Literal["scenario", "forecast"] = Query(default="scenario")
) -> Dict[str, Any]:
    """
    Calculates aggregate disaster metrics for KPI dashboard cards.
    """
    rainfall, selected_mode, rain_source = resolve_rainfall(rainfall, rainfall_mode)
    zones = risk_engine.evaluate_all_zones(rainfall_mm=rainfall, rainfall_provenance=rain_source)
    
    total_pop = sum(z["population"] for z in zones)
    total_exposed = sum(z["exposed_population"] for z in zones)
    high_or_crit_zones = [z for z in zones if z["risk_category"] in ("HIGH", "CRITICAL")]
    
    # Calculate population-weighted average risk score
    weighted_score = sum(z["risk_score"] * z["population"] for z in zones) / total_pop if total_pop else 70.0
    overall_score = round(weighted_score, 1)
    overall_category = risk_engine.classify_risk(overall_score)

    infra_data = load_normalized_infrastructure()
    crit_infra_count = len(infra_data.get("hospitals", [])) + len(infra_data.get("shelters", [])) + len(infra_data.get("schools", []))
    infra_counts = {"hospitals": len(infra_data.get("hospitals", [])), "shelters": len(infra_data.get("shelters", [])), "schools": len(infra_data.get("schools", [])), "utilities": len(infra_data.get("utilities", [])), "transit": len(infra_data.get("transit", [])), "other": len(infra_data.get("other_critical_assets", []))}

    base_coverage = calculate_resource_coverage(rainfall, ambulances, boats, shelters)

    return {
        "simulation_state": "DEMO / SIMULATION",
        "rainfall_mm": rainfall,
        "rainfall_mode": selected_mode,
        "rainfall_source": rain_source.get("rainfall_source", "SCENARIO"),
        "rainfall_period_hours": rain_source.get("period_hours", 24),
        "rainfall_unit": rain_source.get("unit", "mm"),
        "rainfall_provenance": rain_source,
        "overall_risk_score": overall_score,
        "overall_risk_category": overall_category,
        "exposed_population": total_exposed,
        "total_study_population": total_pop,
        "high_risk_zones_count": len(high_or_crit_zones),
        "total_zones_count": len(zones),
        "critical_infrastructure_count": crit_infra_count,
        "infrastructure_counts": infra_counts,
        "infrastructure_data_status": infra_data.get("data_status", "DEMO FALLBACK"),
        "exposure_definition": EXPOSURE_DEFINITION,
        "resource_coverage_pct": base_coverage,
        "zones": zones
    }

@app.get("/exposure")
def get_exposure(
    rainfall: float = Query(default=120.0, ge=RAINFALL_MIN, le=RAINFALL_MAX),
    rainfall_mode: Literal["scenario", "forecast"] = Query(default="scenario")
) -> Dict[str, Any]:
    """Spatially intersect active real OSM roads and facility points with the modeled susceptibility mask."""
    rainfall, selected_mode, rain_source = resolve_rainfall(rainfall, rainfall_mode)
    zones = risk_engine.evaluate_all_zones(rainfall_mm=rainfall, rainfall_provenance=rain_source)
    infrastructure = load_normalized_infrastructure()
    provenance = effective_data_sources()
    return {
        "status": "success",
        "rainfall_mm": rainfall,
        "rainfall_mode": selected_mode,
        "rainfall_source": rain_source.get("rainfall_source", "SCENARIO"),
        "rainfall_provenance": rain_source,
        "data": build_exposure_summary(zones, infrastructure, provenance),
    }

@app.post("/simulate", response_model=SimulationResponse)
def simulate_scenario(req: SimulationRequest) -> Dict[str, Any]:
    """
    POST /simulate:
    Calculates dynamic disaster scenario metrics based on rainfall and resource constraints.
    """
    rainfall, rainfall_mode, rainfall_source = resolve_rainfall(req.rainfall, req.rainfall_mode)
    zones = risk_engine.evaluate_all_zones(rainfall_mm=rainfall, rainfall_provenance=rainfall_source)
    total_pop = sum(z["population"] for z in zones)
    total_exposed = sum(z["exposed_population"] for z in zones)
    high_crit_zones = [z for z in zones if z["risk_category"] in ("HIGH", "CRITICAL")]

    # Calculate overall risk score
    weighted_score = sum(z["risk_score"] * z["population"] for z in zones) / total_pop if total_pop else 70.0
    overall_score = int(round(weighted_score))
    overall_category = risk_engine.classify_risk(overall_score)

    infra_data = load_normalized_infrastructure()
    crit_infra_count = len(infra_data.get("hospitals", [])) + len(infra_data.get("shelters", [])) + len(infra_data.get("schools", []))
    infra_counts = {"hospitals": len(infra_data.get("hospitals", [])), "shelters": len(infra_data.get("shelters", [])), "schools": len(infra_data.get("schools", [])), "utilities": len(infra_data.get("utilities", [])), "transit": len(infra_data.get("transit", [])), "other": len(infra_data.get("other_critical_assets", []))}

    # Coverage scales with ambulances, boats, and shelters vs rainfall stress
    resources_db = load_resources_data()
    shelter_inventory = load_infrastructure_data()
    coverage = calculate_resource_coverage(rainfall, req.ambulances, req.boats, req.shelters)

    return {
        "simulation_state": "DEMO / SIMULATION",
        "rainfall_mm": rainfall,
        "rainfall_mode": rainfall_mode,
        "rainfall_source": rainfall_source.get("rainfall_source", "SCENARIO"),
        "rainfall_period_hours": rainfall_source.get("period_hours", 24),
        "rainfall_unit": rainfall_source.get("unit", "mm"),
        "rainfall_provenance": rainfall_source,
        "risk_score": overall_score,
        "risk_category": overall_category,
        "exposed_population": total_exposed,
        "high_risk_zones": len(high_crit_zones),
        "critical_infrastructure": crit_infra_count,
        "critical_infrastructure_count": crit_infra_count,
        "infrastructure_counts": infra_counts,
        "infrastructure_data_status": infra_data.get("data_status", "DEMO FALLBACK"),
        "total_study_population": total_pop,
        "overall_risk_score": overall_score,
        "overall_risk_category": overall_category,
        "high_risk_zones_count": len(high_crit_zones),
        "total_zones_count": len(zones),
        "resource_coverage_pct": coverage,
        "resource_inventory": {"ambulances_available": len(resources_db.get("ambulances", [])), "boats_available": len(resources_db.get("boats", [])), "shelters_available": len(shelter_inventory.get("shelters", []))},
        "exposure_definition": EXPOSURE_DEFINITION,
        "resource_coverage": coverage,
        "zones": zones
    }

@app.post("/optimize")
def optimize_resources(req: OptimizationRequest) -> Dict[str, Any]:
    """
    POST /optimize:
    Runs explainable heuristic resource dispatch to allocate ambulances, boats, and shelters.
    """
    rainfall, rainfall_mode, rainfall_source = resolve_rainfall(req.rainfall, req.rainfall_mode)
    zones = risk_engine.evaluate_all_zones(rainfall_mm=rainfall, rainfall_provenance=rainfall_source)
    result = optimizer.optimize(
        zones=zones,
        num_ambulances=req.ambulances,
        num_boats=req.boats,
        num_shelters=req.shelters,
        relief_kits=req.relief_kits
    )
    return {
        "simulation_state": "SCENARIO-BASED RISK SIMULATION",
        "rainfall_mm": rainfall,
        "rainfall_mode": rainfall_mode,
        "rainfall_source": rainfall_source.get("rainfall_source", "SCENARIO"),
        "rainfall_period_hours": rainfall_source.get("period_hours", 24),
        "rainfall_unit": rainfall_source.get("unit", "mm"),
        "rainfall_provenance": rainfall_source,
        "status": "success",
        "data": result
    }

@app.get("/resources", response_model=ResourceInventoryResponse)
def get_resources() -> Dict[str, Any]:
    return load_normalized_resources()

@app.get("/infrastructure", response_model=InfrastructureResponse)
def get_infrastructure() -> Dict[str, Any]:
    return load_normalized_infrastructure()

@app.get("/routes/scenarios")
def get_route_scenarios() -> List[Dict[str, Any]]:
    return [{"id": scenario["id"], "name": scenario["name"], "origin": scenario["origin"], "destination": scenario["destination"]} for scenario in router.get_available_scenarios()]

@app.get("/routes", response_model=RouteResponse)
def get_routes(scenario_id: str = "EVAC-01") -> Dict[str, Any]:
    return router.compute_evacuation_routes(scenario_id=scenario_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
