"""Geospatial-derived factors that are independent of any one study-area name."""
import json
import math
from functools import lru_cache
from pathlib import Path

from data_loader import DATA_DIR, load_active_study_area, load_data_provenance, real_data_enabled

@lru_cache(maxsize=4)
def _water_dataset(file_path: str):
    path = Path(file_path)
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as source:
        return json.load(source)

def _point_in_ring(x, y, ring):
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-15) + xi:
            inside = not inside
        j = i
    return inside

def _distance_to_segment_m(lon, lat, start, end):
    cos_lat = math.cos(math.radians(lat))
    def project(point):
        return ((point[0] - lon) * 111320.0 * cos_lat, (point[1] - lat) * 111320.0)
    ax, ay = project(start)
    bx, by = project(end)
    dx, dy = bx - ax, by - ay
    denominator = dx * dx + dy * dy
    t = 0.0 if denominator == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / denominator))
    return math.hypot(ax + t * dx, ay + t * dy)

def derive_real_water_proximity(lon, lat):
    """Return a documented 0–100 heuristic and nearest mapped-water distance, or None."""
    location = load_active_study_area()
    source = load_data_provenance().get("datasets", {}).get("water_bodies", {})
    if not real_data_enabled() or source.get("is_real") is not True:
        return None
    path = DATA_DIR / location["osm_layers_file"]
    dataset = _water_dataset(str(path.resolve()))
    coverage = dataset.get("coverage", {}).get("water_bodies")
    if coverage and not (
        coverage["south"] <= lat <= coverage["north"]
        and coverage["west"] <= lon <= coverage["east"]
    ):
        return None
    features = dataset.get("features", [])
    nearest = None
    for feature in features:
        properties = feature.get("properties", {})
        if properties.get("kind") != "water_body":
            continue
        geometry = feature.get("geometry") or {}
        if geometry.get("type") == "Polygon":
            for ring in geometry.get("coordinates", []):
                if len(ring) >= 4:
                    if _point_in_ring(lon, lat, ring):
                        nearest = 0.0
                        break
                    for i in range(1, len(ring)):
                        distance = _distance_to_segment_m(lon, lat, ring[i - 1], ring[i])
                        nearest = distance if nearest is None else min(nearest, distance)
        elif geometry.get("type") == "LineString":
            coordinates = geometry.get("coordinates", [])
            for i in range(1, len(coordinates)):
                distance = _distance_to_segment_m(lon, lat, coordinates[i - 1], coordinates[i])
                nearest = distance if nearest is None else min(nearest, distance)
        if nearest == 0:
            break
    if nearest is None:
        return None
    threshold_m = 1000.0
    score = round(max(0.0, min(100.0, (1.0 - nearest / threshold_m) * 100.0)), 1)
    return {
        "risk": score,
        "distance_m": round(nearest, 1),
        "provenance": {
            "status": "REAL_SOURCE_DERIVED",
            "source": source.get("name"),
            "url_or_reference": source.get("url_or_reference"),
            "method": f"Nearest mapped OSM water feature is {round(nearest, 1)} m away; linear 0–100 decay to 1,000 m. Applied only inside the retrieved OSM water coverage; outside it the retained demo value is used.",
            "distance_m": round(nearest, 1),
            "coverage": coverage
        }
    }
