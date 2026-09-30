"""
Risk Engine module for GEO-SHIELD.
Implements multi-criteria geospatial disaster risk assessment:
Risk Score =
  30% Elevation Risk
+ 25% Rainfall Risk
+ 20% Drainage Risk
+ 15% Land Cover Risk
+ 10% Water-body Proximity Risk

Normalized to [0, 100].
Classification:
  0 - 25: LOW
 26 - 50: MODERATE
 51 - 75: HIGH
 76 - 100: CRITICAL
"""

import json
from pathlib import Path
from typing import Dict, Any, List
from data_loader import load_risk_zones_geojson, load_data_provenance, real_data_enabled
from geodata import derive_real_water_proximity

CONFIG_PATH = Path(__file__).resolve().parent / "risk_config.json"

def load_risk_config() -> Dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as config_file:
        return json.load(config_file)

class RiskEngine:
    def __init__(self, weights: Dict[str, float] = None):
        self.config = load_risk_config()
        self.weights = weights or self.config["weights"].copy()
        # Verify normalized weights sum to 1.0
        total_w = sum(self.weights.values())
        if total_w > 0:
            self.weights = {k: v / total_w for k, v in self.weights.items()}

    def normalize_factor(self, value: float, min_val: float = 0.0, max_val: float = 100.0) -> float:
        """
        Normalize any factor value to a clean 0 - 100 scale.
        """
        if max_val == min_val:
            return 50.0
        val = ((value - min_val) / (max_val - min_val)) * 100.0
        return max(0.0, min(100.0, round(val, 1)))

    def classify_risk(self, score: float) -> str:
        """
        Classify a numerical 0-100 risk score into standard disaster tiers.
        """
        thresholds = self.config["classification"]
        if score <= thresholds["low"]:
            return "LOW"
        elif score <= thresholds["moderate"]:
            return "MODERATE"
        elif score <= thresholds["high"]:
            return "HIGH"
        else:
            return "CRITICAL"

    def calculate_rainfall_factor(self, rainfall_mm: float) -> float:
        """
        Maps 24-hour precipitation in mm to a 0-100 susceptibility factor.
        The configured line maps 40 mm to 18, 120 mm to 63.7, and
        180 mm to 98; values are clamped to [0, 100].
        """
        rainfall = self.config["rainfall"]
        span = rainfall["max_mm"] - rainfall["min_mm"]
        risk_span = rainfall["max_risk"] - rainfall["min_risk"]
        normalized = ((rainfall_mm - rainfall["min_mm"]) / span) * risk_span + rainfall["min_risk"]
        return max(0.0, min(100.0, round(normalized, 1)))

    def calculate_risk(self, zone_props: Dict[str, Any], rainfall_mm: float) -> Dict[str, Any]:
        """
        Calculate composite risk score and factor contributions for a specific zone.
        """
        elev_risk = float(zone_props.get("elevation_factor", 50))
        drain_risk = float(zone_props.get("drainage_factor", 50))
        landcover_risk = float(zone_props.get("landcover_factor", 50))
        water_risk = float(zone_props.get("water_proximity_factor", 50))
        
        rain_risk = self.calculate_rainfall_factor(rainfall_mm)

        drainage_multiplier = 1.0 + (rainfall_mm - self.config["rainfall"]["min_mm"]) / 300.0
        adjusted_drain_risk = min(100.0, drain_risk * drainage_multiplier)

        w_elev = self.weights["elevation"]
        w_rain = self.weights["rainfall"]
        w_drain = self.weights["drainage"]
        w_land = self.weights["landcover"]
        w_water = self.weights["water_proximity"]

        weighted_factors = {
            "elevation": (elev_risk, w_elev),
            "rainfall": (rain_risk, w_rain),
            "drainage": (adjusted_drain_risk, w_drain),
            "landcover": (landcover_risk, w_land),
            "water_proximity": (water_risk, w_water),
        }
        composite = sum(risk * weight for risk, weight in weighted_factors.values())
        factor_contributions = {
            name: {
                "risk": round(risk, 2),
                "weight": weight,
                "contribution": round(risk * weight, 2),
            }
            for name, (risk, weight) in weighted_factors.items()
        }

        final_score = round(max(0.0, min(100.0, composite)), 1)
        category = self.classify_risk(final_score)

        total_points = composite if composite > 0 else 1.0
        c_elev = round(((w_elev * elev_risk) / total_points) * 100)
        c_rain = round(((w_rain * rain_risk) / total_points) * 100)
        c_drain = round(((w_drain * adjusted_drain_risk) / total_points) * 100)
        c_land = round(((w_land * landcover_risk) / total_points) * 100)
        c_water = round(100 - (c_elev + c_rain + c_drain + c_land))

        return {
            "risk_score": final_score,
            "risk_category": category,
            "factors": {
                "elevation_risk": elev_risk,
                "rainfall_risk": rain_risk,
                "drainage_risk": round(adjusted_drain_risk, 1),
                "landcover_risk": landcover_risk,
                "water_proximity_risk": water_risk,
                "elevation_contribution_pct": max(0, c_elev),
                "rainfall_contribution_pct": max(0, c_rain),
                "drainage_contribution_pct": max(0, c_drain),
                "landcover_contribution_pct": max(0, c_land),
                "water_contribution_pct": max(0, c_water)
            },
            "factor_contributions": factor_contributions,
            "primary_risk_drivers": [
                name for name, _ in sorted(
                    (("Elevation", w_elev * elev_risk), ("Rainfall", w_rain * rain_risk),
                     ("Drainage", w_drain * adjusted_drain_risk),
                     ("Land cover", w_land * landcover_risk), ("Water proximity", w_water * water_risk)),
                    key=lambda item: item[1], reverse=True
                )[:3]
            ]
        }

    def calculate_exposure(self, zone_props: Dict[str, Any], risk_score: float) -> int:
        total_pop = int(zone_props.get("population", 5000))
        thresholds = self.config["classification"]
        if risk_score <= thresholds["low"]:
            ratio = 0.20
        elif risk_score <= thresholds["moderate"]:
            ratio = 0.45
        elif risk_score <= thresholds["high"]:
            ratio = 0.75
        else:
            ratio = 0.95

        return int(round(total_pop * ratio))

    def evaluate_all_zones(self, rainfall_mm: float, rainfall_provenance: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        geojson = load_risk_zones_geojson()
        source_metadata = load_data_provenance().get("datasets", {})
        results = []

        for feature in geojson.get("features", []):
            props = feature.get("properties", {})
            calc_props = dict(props)
            provenance = dict(props.get("factor_provenance", {}))
            provenance_defaults = {
                "elevation": ("elevation", "DEMO_FALLBACK"),
                "drainage": ("drainage", "DEMO"),
                "landcover": ("landcover", "DEMO"),
                "water_proximity": ("water_bodies", "DEMO_FALLBACK"),
                "population": ("population", "DEMO")
            }
            for factor, (dataset, fallback_status) in provenance_defaults.items():
                if factor not in provenance:
                    metadata = source_metadata.get(dataset, {})
                    provenance[factor] = {
                        "status": fallback_status,
                        "source": metadata.get("source", "Retained demo dataset"),
                        "method": metadata.get("description", "Retained demo value.")
                    }
            if provenance.get("water_proximity", {}).get("status") != "REAL_SOURCE_DERIVED":
                water_metadata = source_metadata.get("water_bodies", {})
                if real_data_enabled() and water_metadata.get("is_real") is True:
                    provenance["water_proximity"] = {
                        "status": "DEMO_FALLBACK",
                        "source": "Retained Phase 1 demo water-proximity factor",
                        "coverage_status": water_metadata.get("status", "PARTIAL_REAL_SOURCE"),
                        "coverage": water_metadata.get("geographic_extent"),
                        "method": "No real OSM-derived distance is available for this cell because it lies outside the partial query coverage or no mapped water feature was returned. Missing OSM mapping does not establish that water is absent. The inherited demo factor is used."
                    }
                elif not real_data_enabled():
                    provenance["water_proximity"] = {
                        "status": "DEMO_FALLBACK",
                        "source": "Retained Phase 1 demo water-proximity factor",
                        "method": "Real-data layers are disabled for this process; the retained demo water-proximity factor is used."
                    }
            center = props.get("center", [12.823, 80.044])
            if len(center) >= 2:
                water_derived = derive_real_water_proximity(float(center[1]), float(center[0]))
                if water_derived:
                    calc_props["water_proximity_factor"] = water_derived["risk"]
                    provenance["water_proximity"] = water_derived["provenance"]
            risk_info = self.calculate_risk(calc_props, rainfall_mm)
            exposed_pop = self.calculate_exposure(props, risk_info["risk_score"])

            contribution_sources = {
                "elevation": provenance.get("elevation", {}),
                "rainfall": rainfall_provenance or {},
                "drainage": provenance.get("drainage", {}),
                "landcover": provenance.get("landcover", {}),
                "water_proximity": provenance.get("water_proximity", {}),
            }
            factor_contributions = risk_info["factor_contributions"]
            for factor_name, source_info in contribution_sources.items():
                contribution = factor_contributions[factor_name]
                contribution["source"] = source_info.get("source")
                contribution["status"] = source_info.get("status", "SCENARIO_INPUT" if factor_name == "rainfall" else "DEMO")
                if factor_name == "rainfall":
                    contribution["value_mm"] = rainfall_mm
                    contribution["unit"] = source_info.get("unit", "mm")
                    contribution["period_hours"] = source_info.get("period_hours", 24)
                    contribution["accumulation_period"] = source_info.get("accumulation_period")
                elif factor_name == "elevation":
                    contribution["value_m"] = source_info.get("value_m", props.get("base_elevation_m"))
                elif factor_name == "water_proximity":
                    contribution["distance_m"] = source_info.get("distance_m")
            
            # Convert GeoJSON [lon, lat] coordinates to Leaflet [lat, lon]
            geom = feature.get("geometry", {})
            raw_coords = geom.get("coordinates", [[]])[0]
            leaflet_coords = [[pt[1], pt[0]] for pt in raw_coords if len(pt) >= 2]

            zone_data = {
                "id": props.get("id"),
                "name": props.get("name"),
                "description": props.get("description"),
                "base_elevation_m": props.get("base_elevation_m", 40.0),
                "elevation_m": props.get("base_elevation_m", 40.0),
                "elevation_factor": props.get("elevation_factor", 50),
                "elevation_risk": risk_info["factors"]["elevation_risk"],
                "elevation_normalization_method": provenance.get("elevation", {}).get("method"),
                "drainage_factor": props.get("drainage_factor", 50),
                "landcover_factor": props.get("landcover_factor", 50),
                "water_proximity_factor": calc_props.get("water_proximity_factor", 50),
                "risk_score": risk_info["risk_score"],
                "risk_category": risk_info["risk_category"],
                "population": props.get("population", 5000),
                "exposed_population": exposed_pop,
                "infrastructure": props.get("infrastructure", []),
                "factors": risk_info["factors"],
                "factor_contributions": factor_contributions,
                "primary_risk_drivers": risk_info["primary_risk_drivers"],
                "accessibility_factor": props.get("accessibility_factor", 0.7),
                "center": props.get("center", [12.823, 80.044]),
                "coordinates": leaflet_coords,
                "geometry": geom,
                "parent_zone_id": props.get("parent_zone_id"),
                "data_provenance": {
                    **provenance,
                    "rainfall": {
                        "status": (rainfall_provenance or {}).get("status", "SCENARIO_INPUT"),
                        "source": (rainfall_provenance or {}).get("source", "GEO-SHIELD scenario controls"),
                        "value_mm": rainfall_mm,
                        "type": (rainfall_provenance or {}).get("type", "scenario"),
                        "is_real": (rainfall_provenance or {}).get("is_real", False),
                        "rainfall_source": (rainfall_provenance or {}).get("rainfall_source", "SCENARIO"),
                        "period_hours": (rainfall_provenance or {}).get("period_hours", 24),
                        "unit": (rainfall_provenance or {}).get("unit", "mm"),
                        "accumulation_period": (rainfall_provenance or {}).get("accumulation_period", "User-defined scenario value; no time window or observed rainfall."),
                        "retrieved_at": (rainfall_provenance or {}).get("retrieved_at"),
                        "method": (rainfall_provenance or {}).get("method", "User-defined scenario input; not observed or forecast rainfall.")
                    }
                }
            }
            results.append(zone_data)

        return results
