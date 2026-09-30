"""
Data loader module for GEO-SHIELD.
Loads local GeoJSON and JSON mock layers. Designed for modular replacement
with GeoPandas/Rasterio/PostGIS datasets in production.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any
from resource_placement import annotate_land_positions

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MOCK_DATA_DIR = DATA_DIR / "mock"

def real_data_enabled() -> bool:
    """Allow deployments and fallback checks to deliberately select retained demo layers."""
    return os.getenv("GEO_SHIELD_DISABLE_REAL_DATA", "").strip().lower() not in {"1", "true", "yes"}

def load_study_area_config() -> Dict[str, Any]:
    with (DATA_DIR / "study_areas.json").open("r", encoding="utf-8") as config_file:
        return json.load(config_file)

def load_active_study_area() -> Dict[str, Any]:
    config = load_study_area_config()
    return config["locations"][config["active_location_id"]]

def load_data_provenance() -> Dict[str, Any]:
    path = DATA_DIR / "provenance.json"
    if not path.exists():
        return {"datasets": {}}
    with path.open("r", encoding="utf-8") as provenance_file:
        return json.load(provenance_file)

def _dataset_path(relative_path: str) -> Path:
    return DATA_DIR / relative_path

def using_real_risk_grid() -> bool:
    study_area = load_active_study_area()
    provenance = load_data_provenance().get("datasets", {}).get("elevation", {})
    return real_data_enabled() and provenance.get("is_real") is True and _dataset_path(study_area["risk_grid_file"]).exists()

def load_risk_zones_geojson() -> Dict[str, Any]:
    study_area = load_active_study_area()
    risk_grid_path = _dataset_path(study_area["risk_grid_file"])
    use_real_grid = using_real_risk_grid()
    file_path = risk_grid_path if use_real_grid else _dataset_path(study_area["fallback_risk_zones_file"])
    if not file_path.exists():
        raise FileNotFoundError(f"Missing data file: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_infrastructure_data() -> Dict[str, Any]:
    file_path = MOCK_DATA_DIR / "infrastructure.json"
    if not file_path.exists():
        raise FileNotFoundError(f"Missing data file: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_normalized_infrastructure() -> Dict[str, Any]:
    """Return map-ready features, preferring retrieved OSM layers and visibly retaining demo fallbacks."""
    source = load_infrastructure_data()
    datasets = load_data_provenance().get("datasets", {})
    study_area = load_active_study_area()

    def with_coordinates(item: Dict[str, Any], source_status: str = "DEMO_FALLBACK") -> Dict[str, Any]:
        normalized = {key: value for key, value in item.items() if key != "coordinates"}
        normalized["coordinates"] = item.get("coordinates", [])
        normalized["source_status"] = source_status
        return normalized

    real_infra_layers = [
        real_data_enabled() and datasets.get("roads", {}).get("is_real") is True,
        real_data_enabled() and datasets.get("water_bodies", {}).get("is_real") is True,
        real_data_enabled() and datasets.get("infrastructure", {}).get("is_real") is True,
    ]
    normalized = {
        "data_status": "MIXED REAL / DEMO" if any(real_infra_layers) else "DEMO FALLBACK",
        "hospitals": [with_coordinates(item) for item in source.get("hospitals", [])],
        "shelters": [with_coordinates(item) for item in source.get("shelters", [])],
        "schools": [with_coordinates(item) for item in source.get("schools", [])],
        "water_bodies": [{**with_coordinates(item), "geometry_type": item.get("geometry_type", "Polygon")} for item in source.get("water_bodies", [])],
        "roads": [{**with_coordinates(item), "geometry_type": "LineString", "status": item.get("elevation_status", item.get("type", "Modeled road"))} for item in source.get("critical_roads", [])],
        "other_critical_assets": [with_coordinates(item) for item in source.get("other_critical_assets", [])],
        "utilities": source.get("utilities", []),
        "transit": source.get("transit", []),
        "data_provenance": {"roads": datasets.get("roads", {}), "water_bodies": datasets.get("water_bodies", {}), "infrastructure": datasets.get("infrastructure", {})},
        "study_area": study_area
    }

    osm_path = _dataset_path(study_area["osm_layers_file"])
    if real_data_enabled() and osm_path.exists():
        with osm_path.open("r", encoding="utf-8") as osm_file:
            osm = json.load(osm_file)
        if datasets.get("roads", {}).get("is_real") is True:
            normalized["roads"] += _normalize_osm_features(osm.get("features", []), "road")
        if datasets.get("water_bodies", {}).get("is_real") is True:
            normalized["water_bodies"] += _normalize_osm_features(osm.get("features", []), "water_body")
        if datasets.get("infrastructure", {}).get("is_real") is True:
            facilities = _normalize_osm_features(osm.get("features", []), "facility")
            category_amenities = {
                "hospitals": {"hospital", "clinic", "doctors"},
                "schools": {"school", "college", "university"},
                "shelters": {"shelter"},
                "other_critical_assets": {"police", "fire_station"}
            }
            category_sources = {}
            for key, amenities in category_amenities.items():
                mapped = [item for item in facilities if item.get("amenity") in amenities]
                if mapped:
                    normalized[key] += mapped
                    category_sources[key] = "REAL OSM + DEMO FALLBACK"
                else:
                    category_sources[key] = "DEMO FALLBACK"
            normalized["data_provenance"]["facility_categories"] = category_sources
            normalized["data_provenance"]["osm_counts"] = datasets.get("infrastructure", {}).get("processing", {}).get("facility_types", {})

    # Keep source coordinates intact; expose a separate safe display position
    # for point facilities that intersect any mapped real or demo water polygon.
    zone_features = load_risk_zones_geojson().get("features", [])
    placement_zones = []
    for feature in zone_features:
        props = feature.get("properties", {})
        placement_zones.append({
            "id": props.get("id"),
            "parent_zone_id": props.get("parent_zone_id"),
            "center": props.get("center"),
            "geometry": feature.get("geometry"),
        })
    water_features = normalized["water_bodies"]
    mapped_roads = [road for road in normalized["roads"] if road.get("source_status") == "REAL_SOURCE_DATA"]
    for key in ("hospitals", "shelters", "schools", "other_critical_assets"):
        normalized[key] = annotate_land_positions(normalized[key], water_features, placement_zones, mapped_roads)
    return normalized

def _normalize_osm_features(features: list, kind: str) -> list:
    """Convert stored GeoJSON coordinates to the Leaflet-ready canonical schema."""
    normalized = []
    for feature in features:
        props = feature.get("properties", {})
        if props.get("kind") != kind:
            continue
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        if kind == "facility":
            if geometry.get("type") == "Point":
                point = coordinates
            elif geometry.get("type") == "Polygon" and coordinates:
                ring = coordinates[0]
                point = [sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)] if ring else []
            else:
                point = []
            leaflet_coordinates = [point[1], point[0]] if len(point) >= 2 else []
        elif geometry.get("type") == "Polygon":
            ring = coordinates[0] if coordinates else []
            leaflet_coordinates = [[point[1], point[0]] for point in ring if len(point) >= 2]
        else:
            leaflet_coordinates = [[point[1], point[0]] for point in coordinates if len(point) >= 2]
        if len(leaflet_coordinates) < (2 if kind == "road" else 1):
            continue
        normalized.append({
            **props,
            "id": props.get("osm_id", feature.get("id")),
            "name": props.get("name") or f"OpenStreetMap {kind.replace('_', ' ')}",
            "type": props.get("highway") or props.get("waterway") or props.get("natural") or props.get("amenity") or kind,
            "status": props.get("highway") or props.get("waterway") or props.get("natural") or "OpenStreetMap mapped",
            "geometry_type": geometry.get("type"),
            "coordinates": leaflet_coordinates,
            "source_status": "REAL_SOURCE_DATA"
        })
    return normalized

def load_normalized_resources() -> Dict[str, Any]:
    """Return the complete demo resource inventory with a shared coordinate field."""
    resources = load_resources_data()
    infrastructure = load_infrastructure_data()
    def with_coordinates(item: Dict[str, Any]) -> Dict[str, Any]:
        normalized = {key: value for key, value in item.items() if key != "coords"}
        normalized["coordinates"] = item.get("coordinates", item.get("coords", []))
        return normalized
    return {
        "data_status": "DEMO / SIMULATION",
        "ambulances": [with_coordinates(item) for item in resources.get("ambulances", [])],
        "boats": [with_coordinates(item) for item in resources.get("boats", [])],
        "shelters": [with_coordinates(item) for item in infrastructure.get("shelters", [])],
        "relief_kits_stock_simulated": resources.get("relief_kits_stock", 0)
    }

def load_resources_data() -> Dict[str, Any]:
    file_path = MOCK_DATA_DIR / "resources.json"
    if not file_path.exists():
        raise FileNotFoundError(f"Missing data file: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_routes_data() -> Dict[str, Any]:
    file_path = MOCK_DATA_DIR / "routes.json"
    if not file_path.exists():
        raise FileNotFoundError(f"Missing data file: {file_path}")
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)
