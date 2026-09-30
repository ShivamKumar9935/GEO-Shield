"""Land-safe display placement for deployed resources and fixed facilities.

This adjusts map positions only. Resource identities, source coordinates, zone
assignments, and the risk model remain unchanged.
"""
import math
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

LatLon = Tuple[float, float]


def _point_in_ring(point: LatLon, ring: Sequence[Sequence[float]]) -> bool:
    lat, lon = point
    inside = False
    if len(ring) < 3:
        return False
    j = len(ring) - 1
    for i, vertex in enumerate(ring):
        # Rings reaching this helper are normalized to Leaflet [lat, lon].
        y_i, x_i = float(vertex[0]), float(vertex[1])
        prev = ring[j]
        y_j, x_j = float(prev[0]), float(prev[1])
        if (y_i > lat) != (y_j > lat) and lon < (x_j - x_i) * (lat - y_i) / ((y_j - y_i) or 1e-15) + x_i:
            inside = not inside
        j = i
    return inside


def _distance_to_ring_edge_m(point: LatLon, ring: Sequence[Sequence[float]]) -> float:
    lat, lon = point
    cos_lat = max(0.2, math.cos(math.radians(lat)))
    best = float("inf")
    for index, start in enumerate(ring):
        end = ring[(index + 1) % len(ring)]
        ax = (float(start[1]) - lon) * 111320.0 * cos_lat
        ay = (float(start[0]) - lat) * 111320.0
        bx = (float(end[1]) - lon) * 111320.0 * cos_lat
        by = (float(end[0]) - lat) * 111320.0
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        t = 0.0 if length_sq == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / length_sq))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def _rings_from_geojson(geometry: Dict[str, Any]) -> List[List[List[float]]]:
    coordinates = geometry.get("coordinates") or []
    kind = geometry.get("type")
    if kind == "Polygon":
        return coordinates[:1]
    if kind == "MultiPolygon":
        return [polygon[0] for polygon in coordinates if polygon]
    return []


def _water_rings(water_features: Iterable[Dict[str, Any]]) -> List[List[List[float]]]:
    rings = []
    for feature in water_features:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") in {"Polygon", "MultiPolygon"}:
            rings.extend([
                [[float(point[1]), float(point[0])] for point in ring if len(point) >= 2]
                for ring in _rings_from_geojson(geometry)
            ])
            continue
        coordinates = feature.get("coordinates") or []
        if not coordinates:
            continue
        # Normalized mock polygons are a single Leaflet ring; normalized OSM
        # polygons are also reduced to a Leaflet outer ring by data_loader.
        if isinstance(coordinates[0], (list, tuple)) and coordinates[0] and isinstance(coordinates[0][0], (int, float)):
            rings.append(coordinates)
        elif feature.get("geometry_type") == "Polygon" and coordinates:
            rings.append(coordinates[0])
    return rings


def point_is_in_water(point: Sequence[float], water_features: Iterable[Dict[str, Any]]) -> bool:
    """Return whether a [latitude, longitude] point lies in a mapped water polygon."""
    if not point or len(point) < 2:
        return False
    latlon_rings = _water_rings(water_features)
    lat, lon = float(point[0]), float(point[1])
    # All rings are normalized to Leaflet [lat, lon].
    for ring in latlon_rings:
        if _point_in_ring((lat, lon), ring) or _distance_to_ring_edge_m((lat, lon), ring) <= 1.0:
            return True
    return False


def _zone_ring(zone: Optional[Dict[str, Any]]) -> Optional[List[List[float]]]:
    if not zone:
        return None
    geometry = zone.get("geometry") or {}
    rings = _rings_from_geojson(geometry)
    if rings:
        return [[float(point[1]), float(point[0])] for point in rings[0] if len(point) >= 2]
    coordinates = zone.get("coordinates") or []
    if coordinates and isinstance(coordinates[0], (list, tuple)) and coordinates[0] and isinstance(coordinates[0][0], (int, float)):
        return coordinates
    return None


def _inside_zone(point: LatLon, ring: Optional[List[List[float]]]) -> bool:
    return ring is None or _point_in_ring(point, ring)


def _offset_m(point: LatLon, east_m: float, north_m: float) -> LatLon:
    lat, lon = point
    return (lat + north_m / 111320.0, lon + east_m / (111320.0 * max(0.2, math.cos(math.radians(lat)))))


def _point_distance_m(start: Sequence[float], end: Sequence[float]) -> float:
    lat0 = float(start[0])
    north = (float(end[0]) - lat0) * 111320.0
    east = (float(end[1]) - float(start[1])) * 111320.0 * max(0.2, math.cos(math.radians(lat0)))
    return round(math.hypot(north, east), 1)


def distance_to_roads_m(point: Sequence[float], roads: Iterable[Dict[str, Any]]) -> Optional[float]:
    """Return the closest distance to the supplied mapped road polylines."""
    if not point or len(point) < 2:
        return None
    lat, lon = float(point[0]), float(point[1])
    cos_lat = max(0.2, math.cos(math.radians(lat)))
    best = float("inf")
    for road in roads:
        path = road.get("coordinates") or road.get("path") or []
        for start, end in zip(path, path[1:]):
            ax = (float(start[1]) - lon) * 111320.0 * cos_lat
            ay = (float(start[0]) - lat) * 111320.0
            bx = (float(end[1]) - lon) * 111320.0 * cos_lat
            by = (float(end[0]) - lat) * 111320.0
            dx, dy = bx - ax, by - ay
            length_sq = dx * dx + dy * dy
            t = 0.0 if length_sq == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / length_sq))
            best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return round(best, 1) if math.isfinite(best) else None


def find_land_deployment(
    preferred: Sequence[float], water_features: Iterable[Dict[str, Any]],
    roads: Iterable[Dict[str, Any]], zone: Optional[Dict[str, Any]] = None,
    max_distance_m: float = 5000.0, prefer_roads: bool = True,
) -> Dict[str, Any]:
    """Resolve a zone assignment to a dry point and describe its road access."""
    water, roads = list(water_features), list(roads)
    origin = (float(preferred[0]), float(preferred[1]))
    zone_ring = _zone_ring(zone)
    road_distance = distance_to_roads_m(origin, roads)
    origin_is_valid = _inside_zone(origin, zone_ring) and not point_is_in_water(origin, water)

    # Keep an already safe representative point, unless a nearby same-zone point
    # is materially closer to a mapped road (bounded to 120 m of adjustment).
    if origin_is_valid and (not prefer_roads or road_distance is None or road_distance <= 100):
        return {"coordinates": list(origin), "placement_method": "ZONE_REPRESENTATIVE_POINT",
                "placement_adjusted": False, "nearest_road_distance_m": road_distance,
                "placement_distance_m": 0.0,
                "road_status": "OSM_ROADS_AVAILABLE" if roads else "ROAD DATA UNAVAILABLE"}

    step_m = 12.0
    max_steps = max(1, int(max_distance_m // step_m))
    same_zone_candidates = [(origin, road_distance, 0.0)] if origin_is_valid else []
    for radius in range(1, max_steps + 1):
        ring_radius = radius * step_m
        count = 1 if radius == 0 else max(16, int(2 * math.pi * ring_radius / step_m))
        for index in range(count):
            angle = 0 if radius == 0 else 2 * math.pi * index / count
            candidate = origin if radius == 0 else _offset_m(origin, ring_radius * math.cos(angle), ring_radius * math.sin(angle))
            if not _inside_zone(candidate, zone_ring) or point_is_in_water(candidate, water):
                continue
            distance = distance_to_roads_m(candidate, roads)
            same_zone_candidates.append((candidate, distance, ring_radius))
        if same_zone_candidates and radius * step_m >= 120:
            break

    if same_zone_candidates:
        if roads:
            near_road = [item for item in same_zone_candidates if item[1] is not None and item[1] <= 100]
            if near_road:
                point, distance, _ = min(near_road, key=lambda item: (item[1], item[2]))
                method = "ROAD_ADJACENT_LAND_POINT"
            else:
                point, distance, _ = min(same_zone_candidates, key=lambda item: (item[2], item[1] if item[1] is not None else float("inf")))
                method = "ZONE_REPRESENTATIVE_POINT" if point == origin else "NEAREST_VALID_LAND_POINT"
        else:
            point, distance, _ = min(same_zone_candidates, key=lambda item: item[2])
            method = "ZONE_REPRESENTATIVE_POINT" if not origin_is_valid else "DEMO_FALLBACK"
        return {"coordinates": [point[0], point[1]], "placement_method": method,
                "placement_adjusted": point != origin, "nearest_road_distance_m": distance,
                "placement_distance_m": _point_distance_m(origin, point),
                "road_status": "OSM_ROADS_AVAILABLE" if roads else "ROAD DATA UNAVAILABLE"}

    # Zone contains no sampled dry location; bounded nearest-land search.
    for radius in range(1, max_steps + 1):
        ring_radius = radius * step_m
        count = max(24, int(2 * math.pi * ring_radius / step_m))
        dry = []
        for index in range(count):
            angle = 2 * math.pi * index / count
            candidate = _offset_m(origin, ring_radius * math.cos(angle), ring_radius * math.sin(angle))
            if not point_is_in_water(candidate, water):
                dist = distance_to_roads_m(candidate, roads)
                dry.append((candidate, dist))
        if dry:
            point, distance = min(dry, key=lambda item: (item[1] if item[1] is not None else float("inf"), ring_radius))
            return {"coordinates": [point[0], point[1]], "placement_method": "NEAREST_VALID_LAND_POINT",
                    "placement_adjusted": True, "nearest_road_distance_m": distance,
                    "placement_distance_m": _point_distance_m(origin, point),
                    "road_status": "OSM_ROADS_AVAILABLE" if roads else "ROAD DATA UNAVAILABLE"}
    # Never return a known wet point as a land deployment. Keep the assignment,
    # but expose an explicit placement failure for the UI/API to report.
    return {"coordinates": None, "placement_method": "DEMO_FALLBACK",
            "placement_adjusted": False, "placement_failed": True,
            "placement_failure_reason": f"No valid dry point found within {max_distance_m:.0f} m.",
            "nearest_road_distance_m": None, "placement_distance_m": None,
            "road_status": "OSM_ROADS_AVAILABLE" if roads else "ROAD DATA UNAVAILABLE"}


def find_boat_position(preferred: Sequence[float], water_features: Iterable[Dict[str, Any]], zone=None, occupied_points=()) -> Dict[str, Any]:
    """Place a boat on a mapped water feature when one is available."""
    origin = (float(preferred[0]), float(preferred[1]))
    zone_ring = _zone_ring(zone)
    candidates = []
    for feature in water_features:
        source_status = feature.get("source_status", "DEMO_FALLBACK")
        coords = feature.get("coordinates") or feature.get("path") or []
        if feature.get("geometry_type") == "LineString":
            candidates.extend(((float(p[0]), float(p[1])), source_status) for p in coords if len(p) >= 2)
            continue
        ring = coords
        if ring and isinstance(ring[0], (list, tuple)) and len(ring[0]) >= 2 and isinstance(ring[0][0], (int, float)):
            candidates.extend(((float(p[0]), float(p[1])), source_status) for p in ring)
            if len(ring) >= 3:
                center = (sum(float(p[0]) for p in ring) / len(ring), sum(float(p[1]) for p in ring) / len(ring))
                candidates.append((center, source_status))
                # Create a handful of interior points so several assigned boats
                # can be shown distinctly while remaining inside the same water polygon.
                for vertex in ring:
                    for fraction in (0.35, 0.65):
                        candidate = (
                            float(vertex[0]) + (center[0] - float(vertex[0])) * fraction,
                            float(vertex[1]) + (center[1] - float(vertex[1])) * fraction,
                        )
                        if point_is_in_water(candidate, [feature]):
                            candidates.append((candidate, source_status))
    if not candidates:
        return {"coordinates": list(origin), "placement_method": "DEMO_FALLBACK", "placement_adjusted": False,
                "water_status": "MAPPED WATER DATA UNAVAILABLE", "placement_distance_m": 0.0}
    in_zone = [item for item in candidates if _inside_zone(item[0], zone_ring)]
    real_in_zone = [item for item in in_zone if item[1] == "REAL_SOURCE_DATA"]
    real_candidates = [item for item in candidates if item[1] == "REAL_SOURCE_DATA"]
    pool = real_in_zone or in_zone or real_candidates or candidates
    available = [item for item in pool if all(
        math.hypot((item[0][0] - float(used[0])) * 111320.0,
                   (item[0][1] - float(used[1])) * 111320.0 * max(0.2, math.cos(math.radians(item[0][0])))) >= 35.0
        for used in occupied_points
    )]
    if available:
        pool = available
    point, source_status = min(pool, key=lambda item: (item[0][0] - origin[0]) ** 2 + (item[0][1] - origin[1]) ** 2)
    return {"coordinates": [point[0], point[1]], "placement_method": "WATER_FEATURE_POINT",
            "placement_adjusted": point != origin,
            "placement_distance_m": _point_distance_m(origin, point),
            "water_status": ("OSM MAPPED WATER FEATURE" if source_status == "REAL_SOURCE_DATA" else "DEMO MAPPED WATER FEATURE") if in_zone else ("NEAREST OSM MAPPED WATER FEATURE" if source_status == "REAL_SOURCE_DATA" else "NEAREST DEMO WATER FEATURE")}


def find_land_position(
    preferred: Sequence[float],
    water_features: Iterable[Dict[str, Any]],
    zone: Optional[Dict[str, Any]] = None,
    max_distance_m: float = 2000.0,
) -> Tuple[List[float], bool]:
    """Compatibility wrapper for callers using the earlier tuple return type."""
    if not preferred or len(preferred) < 2:
        return list(preferred or []), False
    placement = find_land_deployment(
        preferred, water_features, (), zone, max_distance_m=max_distance_m,
        prefer_roads=False,
    )
    coordinates = placement["coordinates"] or list(preferred[:2])
    return coordinates, placement["placement_adjusted"]


def annotate_land_positions(
    items: List[Dict[str, Any]],
    water_features: Iterable[Dict[str, Any]],
    zones: Iterable[Dict[str, Any]],
    roads: Iterable[Dict[str, Any]] = (),
) -> List[Dict[str, Any]]:
    """Add safe display coordinates while retaining original source coordinates."""
    zones = list(zones)
    zones_by_id = {zone.get("id"): zone for zone in zones}
    zones_by_parent: Dict[str, List[Dict[str, Any]]] = {}
    for zone in zones:
        if zone.get("parent_zone_id"):
            zones_by_parent.setdefault(zone["parent_zone_id"], []).append(zone)
    output = []
    for item in items:
        coords = item.get("coordinates") or item.get("coords") or []
        if len(coords) < 2:
            output.append(item)
            continue
        zone = zones_by_id.get(item.get("zone_id"))
        if zone is None and zones_by_parent.get(item.get("zone_id")):
            zone = min(
                zones_by_parent[item["zone_id"]],
                key=lambda candidate: (
                    float(candidate.get("center", [coords[0], coords[1]])[0]) - float(coords[0])
                ) ** 2 + (
                    float(candidate.get("center", [coords[0], coords[1]])[1]) - float(coords[1])
                ) ** 2,
            )
        placement = find_land_deployment(coords, water_features, roads, zone, prefer_roads=False)
        display = placement["coordinates"]
        output.append({
            **item,
            "map_coordinates": display,
            "map_placement_adjusted": placement["placement_adjusted"],
            "map_placement_failed": placement.get("placement_failed", False),
            "map_placement_method": placement["placement_method"],
            "map_placement_distance_m": placement["placement_distance_m"],
            "nearest_road_distance_m": placement["nearest_road_distance_m"],
            "road_status": placement["road_status"],
            "map_placement_note": "Map display position shifted to nearby mapped land to avoid a water polygon." if placement["placement_adjusted"] else None,
        })
    return output
