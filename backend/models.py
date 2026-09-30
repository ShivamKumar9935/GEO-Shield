"""
Data models and schemas for GEO-SHIELD FastAPI backend.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal
from risk_engine import load_risk_config

_RISK_CONFIG = load_risk_config()
_RAINFALL_MIN = _RISK_CONFIG["rainfall"]["min_mm"]
_RAINFALL_MAX = _RISK_CONFIG["rainfall"]["max_mm"]

class SimulationRequest(BaseModel):
    rainfall: float = Field(..., ge=_RAINFALL_MIN, le=_RAINFALL_MAX, description="Expected precipitation in mm")
    rainfall_mode: Literal["scenario", "forecast"] = Field(default="scenario", description="Use the user-defined scenario amount or cached source forecast")
    ambulances: int = Field(default=3, ge=0, le=8, description="Ambulances selected for deployment")
    boats: int = Field(default=2, ge=0, le=5, description="Available rescue boats")
    shelters: int = Field(default=4, ge=0, le=4, description="Shelters activated from the current demo inventory")
    relief_kits: Optional[int] = Field(default=5000, ge=1000, le=7500, description="Simulated relief-kit stock metric")

class RiskFactorBreakdown(BaseModel):
    elevation_risk: float
    rainfall_risk: float
    drainage_risk: float
    landcover_risk: float
    water_proximity_risk: float
    elevation_contribution_pct: float
    rainfall_contribution_pct: float
    drainage_contribution_pct: float
    landcover_contribution_pct: float
    water_contribution_pct: float

class ZoneRiskProfile(BaseModel):
    id: str
    name: str
    description: str
    risk_score: float
    risk_category: str
    base_elevation_m: float = 40.0
    elevation_m: Optional[float] = None
    elevation_factor: float = 50.0
    elevation_risk: Optional[float] = None
    elevation_normalization_method: Optional[str] = None
    drainage_factor: float = 50.0
    landcover_factor: float = 50.0
    water_proximity_factor: float = 50.0
    population: int
    exposed_population: int
    infrastructure: List[str]
    factors: RiskFactorBreakdown
    factor_contributions: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    accessibility_factor: float
    center: List[float]
    coordinates: List[List[float]] = Field(default_factory=list)
    geometry: Dict[str, Any] = Field(default_factory=dict)
    primary_risk_drivers: List[str] = Field(default_factory=list)
    data_provenance: Dict[str, Any] = Field(default_factory=dict)

class InfrastructureResponse(BaseModel):
    data_status: str = "MIXED REAL / DEMO"
    data_provenance: Dict[str, Any] = Field(default_factory=dict)
    study_area: Dict[str, Any] = Field(default_factory=dict)
    hospitals: List[Dict[str, Any]] = Field(default_factory=list)
    shelters: List[Dict[str, Any]] = Field(default_factory=list)
    schools: List[Dict[str, Any]] = Field(default_factory=list)
    water_bodies: List[Dict[str, Any]] = Field(default_factory=list)
    roads: List[Dict[str, Any]] = Field(default_factory=list)
    utilities: List[Dict[str, Any]] = Field(default_factory=list)
    transit: List[Dict[str, Any]] = Field(default_factory=list)
    other_critical_assets: List[Dict[str, Any]] = Field(default_factory=list)

class ResourceInventoryResponse(BaseModel):
    data_status: str = "DEMO / SIMULATION"
    ambulances: List[Dict[str, Any]] = Field(default_factory=list)
    boats: List[Dict[str, Any]] = Field(default_factory=list)
    shelters: List[Dict[str, Any]] = Field(default_factory=list)
    relief_kits_stock_simulated: int = 0

class ModeledRouteLeg(BaseModel):
    name: Optional[str] = None
    distance_km: Optional[float] = None
    distance_m: Optional[float] = None
    est_time_min: Optional[float] = None
    risk_level: Optional[str] = None
    risk_score: Optional[float] = None
    path: List[List[float]]
    description: Optional[str] = None
    color: Optional[str] = None
    traversed_hazard_zones: List[str] = Field(default_factory=list)

class RouteResponse(BaseModel):
    scenario_id: str
    name: str
    origin: Dict[str, Any]
    destination: Dict[str, Any]
    shortest: ModeledRouteLeg
    risk_aware: ModeledRouteLeg
    route_type: str
    road_network_used: bool = False
    water_checked: bool = False
    water_route_clear: Optional[bool] = None
    fallback_reason: Optional[str] = None
    recommendation: str
    comparison_summary: Dict[str, Any]
    note: str
    water_checked_endpoints: int = 0

class SimulationResponse(BaseModel):
    simulation_state: str
    rainfall_mm: float
    rainfall_mode: str = "scenario"
    rainfall_source: str = "SCENARIO"
    rainfall_period_hours: int = 24
    rainfall_unit: str = "mm"
    rainfall_provenance: Dict[str, Any] = Field(default_factory=dict)
    risk_score: int
    risk_category: str
    exposed_population: int
    total_study_population: int
    high_risk_zones: int
    critical_infrastructure: int
    critical_infrastructure_count: int
    infrastructure_counts: Dict[str, int]
    infrastructure_data_status: str = "DEMO FALLBACK"
    overall_risk_score: int
    overall_risk_category: str
    high_risk_zones_count: int
    total_zones_count: int
    resource_coverage: int
    resource_coverage_pct: int
    resource_inventory: Dict[str, int]
    exposure_definition: str
    zones: List[ZoneRiskProfile]

class RiskSummaryResponse(BaseModel):
    simulation_state: str = "DEMO / SIMULATION"
    rainfall_mm: float
    overall_risk_score: float
    risk_category: str
    exposed_population: int
    total_study_population: int
    high_risk_zones_count: int
    total_zones_count: int
    critical_infrastructure_count: int
    resource_coverage_pct: float
    zones: List[ZoneRiskProfile]

class OptimizationRequest(BaseModel):
    rainfall: float = Field(default=120, ge=_RAINFALL_MIN, le=_RAINFALL_MAX)
    rainfall_mode: Literal["scenario", "forecast"] = "scenario"
    ambulances: int = Field(default=3, ge=0, le=8)
    boats: int = Field(default=2, ge=0, le=5)
    shelters: int = Field(default=4, ge=0, le=4)
    relief_kits: int = Field(default=5000, ge=1000, le=7500)

class ResourceAssignment(BaseModel):
    resource_type: str
    resource_id: str
    resource_name: Optional[str] = None
    assigned_zone_id: str
    assigned_zone_name: str
    priority_score: float
    risk_score: Optional[float] = None
    population: Optional[int] = None
    exposed_population: Optional[int] = None
    rationale: str
    coordinates: List[float]

class OptimizationResult(BaseModel):
    algorithm: str = "Explainable heuristic dispatch"
    total_ambulances_assigned: int
    total_boats_assigned: int
    total_shelters_active: int
    resource_coverage_pct: float
    relief_kits_available_simulated: int = 0
    assignments: List[ResourceAssignment]
    zone_priorities: List[Dict[str, Any]]
