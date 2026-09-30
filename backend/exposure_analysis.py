"""Spatial exposure metrics for the currently available GEO-SHIELD layers.

The hazard mask is explicitly limited to modeled susceptibility cells in the
HIGH and CRITICAL classes. Road lengths are measured from active real-source
OSM centerlines only; facility points preserve their source coordinates.
"""
import math
from typing import Any, Dict, Iterable, List, Sequence, Tuple

EARTH_RADIUS_M = 6_371_008.8


def _distance_m(a: Sequence[float], b: Sequence[float]) -> float:
    lat1, lon1 = map(math.radians, a[:2])
    lat2, lon2 = map(math.radians, b[:2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def _rings(zone: Dict[str, Any]) -> List[List[Tuple[float, float]]]:
    geometry = zone.get("geometry") or {}
    kind, coords = geometry.get("type"), geometry.get("coordinates") or []
    polygons = coords if kind == "MultiPolygon" else [coords] if kind == "Polygon" else []
    return [[(float(point[1]), float(point[0])) for point in polygon[0] if len(point) >= 2]
            for polygon in polygons if polygon and len(polygon[0]) >= 4]


def _point_in_ring(point: Tuple[float, float], ring: Sequence[Tuple[float, float]]) -> bool:
    lat, lon = point
    inside = False
    previous = ring[-1]
    for current in ring:
        y1, x1 = current
        y2, x2 = previous
        cross = (lon - x1) * (y2 - y1) - (lat - y1) * (x2 - x1)
        if abs(cross) < 1e-12 and min(x1, x2) - 1e-12 <= lon <= max(x1, x2) + 1e-12 and min(y1, y2) - 1e-12 <= lat <= max(y1, y2) + 1e-12:
            return True
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / ((y2 - y1) or 1e-15) + x1:
            inside = not inside
        previous = current
    return inside


def _crossing_t(a, b, c, d):
    """Parameter t where segment a-b crosses c-d in a local planar projection."""
    lat0 = math.radians((a[0] + b[0] + c[0] + d[0]) / 4)
    scale_x = 111_320.0 * math.cos(lat0)
    scale_y = 111_320.0
    ax, ay = a[1] * scale_x, a[0] * scale_y
    bx, by = b[1] * scale_x, b[0] * scale_y
    cx, cy = c[1] * scale_x, c[0] * scale_y
    dx, dy = d[1] * scale_x, d[0] * scale_y
    rx, ry, sx, sy = bx - ax, by - ay, dx - cx, dy - cy
    denominator = rx * sy - ry * sx
    if abs(denominator) < 1e-10:
        return None
    qx, qy = cx - ax, cy - ay
    t = (qx * sy - qy * sx) / denominator
    u = (qx * ry - qy * rx) / denominator
    return t if -1e-10 <= t <= 1 + 1e-10 and -1e-10 <= u <= 1 + 1e-10 else None


def _segment_fraction_in_mask(a, b, rings, clip_rings=None):
    clip_rings = clip_rings or []
    def inside(point):
        in_mask = any(_point_in_ring(point, ring) for ring in rings)
        in_clip = not clip_rings or any(_point_in_ring(point, ring) for ring in clip_rings)
        return in_mask and in_clip
    if _distance_m(a, b) <= 1e-7:
        return 1.0 if inside(a) else 0.0
    cuts = [0.0, 1.0]
    for ring in [*rings, *clip_rings]:
        for i, c in enumerate(ring):
            t = _crossing_t(a, b, c, ring[(i + 1) % len(ring)])
            if t is not None:
                cuts.append(max(0.0, min(1.0, t)))
    cuts = sorted(cuts)
    unique = []
    for value in cuts:
        if not unique or value - unique[-1] > 1e-9:
            unique.append(value)
    fraction = 0.0
    for start, end in zip(unique, unique[1:]):
        middle = (start + end) / 2
        point = (a[0] + (b[0] - a[0]) * middle, a[1] + (b[1] - a[1]) * middle)
        if inside(point):
            fraction += end - start
    return min(1.0, fraction)


def line_length_m(path: Sequence[Sequence[float]]) -> float:
    return sum(_distance_m(a, b) for a, b in zip(path, path[1:]) if len(a) >= 2 and len(b) >= 2)


def line_intersection_length_m(
    path: Sequence[Sequence[float]], zones: Iterable[Dict[str, Any]],
    clip_zones: Iterable[Dict[str, Any]] = (),
) -> float:
    rings = [ring for zone in zones for ring in _rings(zone)]
    clip_rings = [ring for zone in clip_zones for ring in _rings(zone)]
    exposed = 0.0
    for a, b in zip(path, path[1:]):
        if len(a) < 2 or len(b) < 2:
            continue
        segment_length = _distance_m(a, b)
        exposed += segment_length * _segment_fraction_in_mask(a, b, rings, clip_rings)
    return exposed


def point_intersects_mask(point: Sequence[float], zones: Iterable[Dict[str, Any]]) -> bool:
    if not point or len(point) < 2:
        return False
    return any(_point_in_ring((float(point[0]), float(point[1])), ring)
               for zone in zones for ring in _rings(zone))


def build_exposure_summary(zones, infrastructure, provenance) -> Dict[str, Any]:
    hazard_zones = [zone for zone in zones if zone.get("risk_category") in {"HIGH", "CRITICAL"}]
    roads_source = provenance.get("roads", {})
    road_extent = roads_source.get("geographic_extent") or {}
    query_extent = road_extent.get("layer_query_extent") or road_extent
    coverage_zones = []
    if all(key in query_extent for key in ("south", "west", "north", "east")):
        south, west = query_extent["south"], query_extent["west"]
        north, east = query_extent["north"], query_extent["east"]
        coverage_zones = [{"geometry": {"type": "Polygon", "coordinates": [[
            [west, south], [east, south], [east, north], [west, north], [west, south],
        ]]}}]
    road_features = []
    total_length = exposed_length = 0.0
    for index, road in enumerate(infrastructure.get("roads", [])):
        if road.get("source_status") != "REAL_SOURCE_DATA":
            continue
        path = road.get("coordinates") or []
        if len(path) < 2:
            continue
        length = line_intersection_length_m(path, coverage_zones) if coverage_zones else line_length_m(path)
        if length <= 0.01:
            continue
        exposed = min(length, line_intersection_length_m(path, hazard_zones, coverage_zones))
        total_length += length
        exposed_length += exposed
        road_features.append({
            "id": str(road.get("id", f"osm-road-{index}")),
            "name": road.get("name") or "Unnamed OSM road",
            "exposed": exposed > 0.01,
            "total_length_m": round(length, 2),
            "exposed_length_m": round(exposed, 2),
        })

    facility_categories = {
        "hospitals": "Hospitals",
        "schools": "Schools & universities",
        "shelters": "Shelters",
        "other_critical_assets": "Other emergency facilities",
    }
    facilities = []
    by_category = {}
    for key, label in facility_categories.items():
        records = infrastructure.get(key, [])
        tested = exposed_count = 0
        for index, item in enumerate(records):
            point = item.get("coordinates")
            testable = bool(point and len(point) >= 2)
            is_exposed = testable and point_intersects_mask(point, hazard_zones)
            if testable:
                tested += 1
            if is_exposed:
                exposed_count += 1
            facilities.append({
                "id": str(item.get("id", f"{key}-{index}")),
                "name": item.get("name") or label,
                "category": key,
                "source_status": item.get("source_status", "DEMO_FALLBACK"),
                "testable": testable,
                "exposed": bool(is_exposed),
                "coordinates": point,
            })
        by_category[key] = {
            "label": label,
            "total_inventory": len(records),
            "spatially_tested": tested,
            "hazard_exposed": exposed_count,
        }

    total_facilities = sum(row["total_inventory"] for row in by_category.values())
    tested_facilities = sum(row["spatially_tested"] for row in by_category.values())
    exposed_facilities = sum(row["hazard_exposed"] for row in by_category.values())
    return {
        "hazard": {
            "label": "MODELED FLOOD SUSCEPTIBILITY",
            "source": "GEO-SHIELD backend risk model",
            "exposure_definition": "Spatial overlap with cells classified HIGH or CRITICAL in the selected scenario.",
            "susceptibility_zones": len(hazard_zones),
            "total_zones": len(zones),
            "not_observed_flood_extent": True,
        },
        "roads": {
            "source": roads_source.get("source", "OpenStreetMap snapshot"),
            "analysis_extent": query_extent if coverage_zones else None,
            "status": roads_source.get("status", "UNKNOWN"),
            "total_length_m": round(total_length, 2),
            "exposed_length_m": round(exposed_length, 2),
            "exposure_percent": round(exposed_length / total_length * 100, 2) if total_length else 0.0,
            "feature_count": len(road_features),
            "features": road_features,
        },
        "facilities": {
            "source": "Mixed real-source and demo facility inventory; locations tested against modeled susceptibility cells.",
            "total_inventory": total_facilities,
            "spatially_tested": tested_facilities,
            "hazard_exposed": exposed_facilities,
            "by_category": by_category,
            "features": facilities,
        },
        "buildings": {"available": False, "label": "Not available in current study-area dataset"},
        "settlements": {"available": False, "label": "Not available in current study-area dataset"},
        "population": {"reported": False, "label": "Not reported as observed exposure; available population inputs are modeled/demo estimates."},
        "land_use": {"available": False, "label": "Not available in current study-area dataset"},
        "water_bodies": {"label": "Map context only; not included as affected assets."},
    }
