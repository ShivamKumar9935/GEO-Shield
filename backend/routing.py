"""Road-constrained modeled evacuation routes using the stored OSM snapshot.

This deliberately small graph router uses only mapped road centerlines already
loaded by GEO-SHIELD. It is not a live navigation, traffic, or travel-time
service. If a route cannot be connected to the mapped graph, the stored demo
geometry is returned only as an explicitly identified fallback.
"""

from copy import deepcopy
import heapq
import itertools
import math
from typing import Any, Dict, List, Optional, Tuple

from data_loader import load_routes_data, load_normalized_infrastructure
from resource_placement import find_land_deployment

EARTH_RADIUS_M = 6_371_008.8
MAX_ROAD_CONNECTOR_M = 200.0
NODE_SNAP_DECIMALS = 5


def _distance_m(a, b):
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    haversine = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(haversine)))


def _node_key(point):
    return (round(float(point[0]), NODE_SNAP_DECIMALS), round(float(point[1]), NODE_SNAP_DECIMALS))


def _point_segment_projection(point, start, end):
    """Return a clamped local-metric projection and its distance in metres."""
    lat0 = math.radians((point[0] + start[0] + end[0]) / 3)
    sx, sy = 0.0, 0.0
    ex = (end[1] - start[1]) * 111_320.0 * math.cos(lat0)
    ey = (end[0] - start[0]) * 111_320.0
    px = (point[1] - start[1]) * 111_320.0 * math.cos(lat0)
    py = (point[0] - start[0]) * 111_320.0
    dx, dy = ex - sx, ey - sy
    denominator = dx * dx + dy * dy
    fraction = 0.0 if denominator == 0 else max(0.0, min(1.0, ((px - sx) * dx + (py - sy) * dy) / denominator))
    projected = [start[0] + fraction * (end[0] - start[0]), start[1] + fraction * (end[1] - start[1])]
    return fraction, projected, math.hypot(px - fraction * dx, py - fraction * dy)


def _point_in_ring(point, ring):
    lat, lon = point
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = current[1], current[0]
        x2, y2 = previous[1], previous[0]
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / ((y2 - y1) or 1e-15) + x1:
            inside = not inside
        previous = current
    return inside


def _orientation(a, b, c):
    return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])


def _segments_intersect(a, b, c, d):
    def on_segment(p, q, r):
        return (min(p[1], r[1]) - 1e-10 <= q[1] <= max(p[1], r[1]) + 1e-10
                and min(p[0], r[0]) - 1e-10 <= q[0] <= max(p[0], r[0]) + 1e-10)
    o1, o2, o3, o4 = _orientation(a, b, c), _orientation(a, b, d), _orientation(c, d, a), _orientation(c, d, b)
    if ((o1 > 0) != (o2 > 0)) and ((o3 > 0) != (o4 > 0)):
        return True
    return ((abs(o1) < 1e-10 and on_segment(a, c, b))
            or (abs(o2) < 1e-10 and on_segment(a, d, b))
            or (abs(o3) < 1e-10 and on_segment(c, a, d))
            or (abs(o4) < 1e-10 and on_segment(c, b, d)))


def _water_rings(water_features):
    rings = []
    for feature in water_features:
        if feature.get("source_status") not in (None, "REAL_SOURCE_DATA", "DEMO_FALLBACK"):
            continue
        geometry = feature.get("geometry") or {}
        geometry_type = feature.get("geometry_type") or geometry.get("type")
        coordinates = feature.get("coordinates") or feature.get("path") or geometry.get("coordinates") or []
        if geometry_type == "Polygon" and coordinates:
            # Map-ready features contain a single [lat, lon] ring; GeoJSON can
            # contain nested [lon, lat] rings. Normalized API features are the
            # former, while direct test fixtures may use that same convention.
            first = coordinates[0]
            if first and isinstance(first[0], (list, tuple)):
                coordinates = first
            if coordinates and len(coordinates[0]) >= 2:
                rings.append(coordinates)
    return [ring for ring in rings if len(ring) >= 4]


def _segment_crosses_water(start, end, rings):
    if not rings:
        return False
    for ring in rings:
        if _point_in_ring(start, ring) or _point_in_ring(end, ring):
            return True
        for index in range(len(ring)):
            if _segments_intersect(start, end, ring[index - 1], ring[index]):
                return True
    return False


def _line_crosses_water(path, rings):
    return any(_segment_crosses_water(a, b, rings) for a, b in zip(path, path[1:]))


def _road_edges(roads, water_rings):
    edges = []
    for road in roads:
        coordinates = road.get("coordinates") or road.get("path") or []
        for start, end in zip(coordinates, coordinates[1:]):
            if len(start) < 2 or len(end) < 2:
                continue
            a, b = [float(start[0]), float(start[1])], [float(end[0]), float(end[1])]
            length = _distance_m(a, b)
            if length < 0.1 or _segment_crosses_water(a, b, water_rings):
                continue
            edges.append({"a": _node_key(a), "b": _node_key(b), "pa": a, "pb": b, "length": length})
    return edges


def _nearest_attachment(point, edges, water_rings):
    candidates = []
    for edge_index, edge in enumerate(edges):
        fraction, projected, distance = _point_segment_projection(point, edge["pa"], edge["pb"])
        candidates.append((distance, edge_index, fraction, projected))
    candidates.sort(key=lambda candidate: candidate[0])
    for distance, edge_index, fraction, projected in candidates:
        if distance <= MAX_ROAD_CONNECTOR_M:
            if _segment_crosses_water(point, projected, water_rings):
                continue
            return {"distance": distance, "edge_index": edge_index, "fraction": fraction, "point": projected}
        return None
    return None


def _build_graph(edges, attachments):
    adjacency, coordinates = {}, {}
    splits = {index: [] for index in range(len(edges))}
    for role, attachment in attachments.items():
        splits[attachment["edge_index"]].append((attachment["fraction"], ("snap", role), attachment["point"]))
        coordinates[("snap", role)] = attachment["point"]
    for index, edge in enumerate(edges):
        a_key, b_key = edge["a"], edge["b"]
        coordinates.setdefault(a_key, edge["pa"])
        coordinates.setdefault(b_key, edge["pb"])
        points = [(0.0, a_key, edge["pa"]), *splits[index], (1.0, b_key, edge["pb"])]
        points.sort(key=lambda item: item[0])
        for (_, a_node, a_point), (_, b_node, b_point) in zip(points, points[1:]):
            weight = _distance_m(a_point, b_point)
            if weight < 0.01:
                continue
            adjacency.setdefault(a_node, []).append((b_node, weight, [a_point, b_point]))
            adjacency.setdefault(b_node, []).append((a_node, weight, [b_point, a_point]))
    return adjacency, coordinates


def _dijkstra(adjacency, start, goal, prefer_water_clearance=False, water_rings=None):
    counter = itertools.count()
    queue = [(0.0, next(counter), start)]
    distances, previous = {start: 0.0}, {}
    while queue:
        cost, _, node = heapq.heappop(queue)
        if cost != distances.get(node):
            continue
        if node == goal:
            break
        for neighbor, length, geometry in adjacency.get(node, []):
            weight = length
            if prefer_water_clearance and water_rings:
                # A modest local preference yields a distinct mapped-road
                # alternative when one exists; it is not a flood-risk score.
                near_water = min((_distance_m(point, ring_point)
                                  for point in geometry for ring in water_rings for ring_point in ring), default=math.inf)
                if near_water < 80.0:
                    weight *= 1.0 + 0.6 * (1.0 - near_water / 80.0)
            next_cost = cost + weight
            if next_cost < distances.get(neighbor, math.inf):
                distances[neighbor] = next_cost
                previous[neighbor] = (node, geometry)
                heapq.heappush(queue, (next_cost, next(counter), neighbor))
    if goal not in distances:
        return None
    edge_geometries = []
    node = goal
    while node != start:
        parent, geometry = previous[node]
        edge_geometries.append(geometry)
        node = parent
    edge_geometries.reverse()
    path = []
    for geometry in edge_geometries:
        path.extend(geometry if not path else geometry[1:])
    return path


def _length_m(path):
    return sum(_distance_m(a, b) for a, b in zip(path, path[1:]))


def _append_endpoints(path, origin, destination):
    return [list(origin), *[list(point) for point in path], list(destination)]


class EvacuationRouter:
    def __init__(self):
        self.disclaimer = (
            "Modeled road-network evacuation route based on the available OpenStreetMap snapshot. "
            "This is not live navigation, traffic guidance, or a real-time travel-time estimate."
        )

    def get_available_scenarios(self) -> List[Dict[str, Any]]:
        return load_routes_data().get("scenarios", [])

    def _route_leg(self, path, name, color, description):
        distance_m = round(_length_m(path), 1)
        return {
            "name": name,
            "distance_km": round(distance_m / 1000.0, 2),
            "distance_m": distance_m,
            "risk_level": None,
            "risk_score": None,
            "path": path,
            "description": description,
            "color": color,
            "traversed_hazard_zones": [],
        }

    def _fallback_leg(self, stored, origin, destination, rings, name):
        route = deepcopy(stored)
        path = route.get("path") or []
        if len(path) >= 2:
            path[0], path[-1] = list(origin), list(destination)
            if _line_crosses_water(path, rings):
                path = []
        else:
            path = []
        distance_m = round(_length_m(path), 1) if len(path) >= 2 else None
        return {
            **route,
            "name": name,
            "distance_km": round(distance_m / 1000.0, 2) if distance_m is not None else None,
            "distance_m": distance_m,
            "est_time_min": None,
            "risk_level": None,
            "risk_score": None,
            "path": path,
            "traversed_hazard_zones": [],
        }

    def compute_evacuation_routes(self, scenario_id: str = "EVAC-01") -> Dict[str, Any]:
        scenarios = self.get_available_scenarios()
        scenario = next((item for item in scenarios if item["id"] == scenario_id), None)
        if scenario is None:
            scenario = next((item for item in scenarios if item["id"] == "EVAC-01"), scenarios[0] if scenarios else None)
        if scenario is None:
            raise ValueError("No modeled evacuation route scenarios are configured.")

        infrastructure = load_normalized_infrastructure()
        water = infrastructure.get("water_bodies", [])
        rings = _water_rings(water)
        roads = [road for road in infrastructure.get("roads", [])
                 if road.get("source_status") == "REAL_SOURCE_DATA"
                 and (road.get("geometry_type") in (None, "LineString"))]
        origin = deepcopy(scenario["origin"])
        destination = deepcopy(scenario["destination"])
        shelters = infrastructure.get("shelters", [])
        matching_shelter = next((item for item in shelters if item.get("coordinates") == destination["coords"]), None)
        destination_coordinates = (matching_shelter.get("map_coordinates") if matching_shelter else None) or destination["coords"]
        origin_placement = find_land_deployment(origin["coords"], water, roads, prefer_roads=False)
        destination_placement = find_land_deployment(destination_coordinates, water, roads, prefer_roads=False)
        endpoints_valid = not origin_placement.get("placement_failed") and not destination_placement.get("placement_failed")
        origin["coords"] = origin_placement.get("coordinates") or origin["coords"]
        destination["coords"] = destination_placement.get("coordinates") or destination["coords"]
        origin["placement_method"] = origin_placement.get("placement_method")
        destination["placement_method"] = destination_placement.get("placement_method")

        edges = _road_edges(roads, rings)
        origin_attachment = _nearest_attachment(origin["coords"], edges, rings) if endpoints_valid else None
        destination_attachment = _nearest_attachment(destination["coords"], edges, rings) if endpoints_valid else None
        fallback_reason = None
        if not endpoints_valid:
            fallback_reason = "A dry origin or destination could not be resolved from available mapped geometry."
        elif not roads or not edges:
            fallback_reason = "Usable OpenStreetMap road geometry is unavailable."
        elif not origin_attachment or not destination_attachment:
            fallback_reason = f"An endpoint is more than {MAX_ROAD_CONNECTOR_M:.0f} m from an accessible mapped road segment."

        shortest_path = alternative_path = None
        if fallback_reason is None:
            adjacency, _ = _build_graph(edges, {"origin": origin_attachment, "destination": destination_attachment})
            shortest_roads = _dijkstra(adjacency, ("snap", "origin"), ("snap", "destination"))
            if shortest_roads:
                shortest_path = _append_endpoints(shortest_roads, origin["coords"], destination["coords"])
                alternative_roads = _dijkstra(
                    adjacency, ("snap", "origin"), ("snap", "destination"),
                    prefer_water_clearance=True, water_rings=rings,
                )
                if alternative_roads and alternative_roads != shortest_roads:
                    alternative_path = _append_endpoints(alternative_roads, origin["coords"], destination["coords"])
            if not shortest_path:
                fallback_reason = "The mapped road graph does not connect the configured endpoints."

        if shortest_path and (_line_crosses_water(shortest_path, rings) or
                              (alternative_path and _line_crosses_water(alternative_path, rings))):
            fallback_reason = "A water-clear connected road path could not be established from the available mapped geometry."
            shortest_path = alternative_path = None

        if fallback_reason:
            if endpoints_valid:
                shortest = self._fallback_leg(
                    scenario["shortest_route"], origin["coords"], destination["coords"], rings,
                    "Fallback modeled route — road-network path unavailable",
                )
                risk_aware = self._fallback_leg(
                    scenario["risk_aware_route"], origin["coords"], destination["coords"], rings,
                    "Fallback modeled route — road-network path unavailable",
                )
            else:
                shortest = {"name": "Fallback route unavailable", "distance_km": None, "distance_m": None,
                            "risk_level": None, "risk_score": None, "path": [],
                            "description": fallback_reason, "color": "#94a3b8", "traversed_hazard_zones": []}
                risk_aware = {**shortest, "color": "#38bdf8"}
            return {
                "scenario_id": scenario["id"], "name": scenario["name"],
                "origin": origin, "destination": destination,
                "shortest": shortest, "risk_aware": risk_aware,
                "route_type": "MODELED_FALLBACK", "road_network_used": False,
                "water_checked": bool(rings),
                "water_route_clear": (all(len(leg["path"]) >= 2 and not _line_crosses_water(leg["path"], rings)
                                          for leg in (shortest, risk_aware)) if endpoints_valid else None),
                "fallback_reason": fallback_reason,
                "recommendation": "Fallback modeled geometry; inspect local road and water conditions before operational use.",
                "comparison_summary": {},
                "note": "Fallback modeled route — road-network path unavailable. This is not live navigation, traffic, or a real-time travel-time estimate.",
                "water_checked_endpoints": 2 if rings and endpoints_valid else 0,
            }

        shortest = self._route_leg(
            shortest_path, "Shortest OSM road-network route", "#94a3b8",
            "Shortest connected path through available mapped road centerlines; no live traffic or travel-time model is applied.",
        )
        risk_aware = self._route_leg(
            alternative_path, "Mapped-water-clearance OSM road alternative", "#38bdf8",
            "Alternative mapped-road path with a local preference for greater distance from mapped water; this is not a flood-risk score.",
        ) if alternative_path else {
            "name": "No distinct road-network alternative available", "distance_km": None,
            "distance_m": None, "risk_level": None, "risk_score": None, "path": [],
            "description": "Only one distinct water-clear mapped-road path was found.",
            "color": "#38bdf8", "traversed_hazard_zones": [],
        }
        shortest_m, alternative_m = shortest["distance_m"], risk_aware["distance_m"]
        return {
            "scenario_id": scenario["id"], "name": scenario["name"],
            "origin": origin, "destination": destination,
            "shortest": shortest, "risk_aware": risk_aware,
            "route_type": "OSM_ROAD_NETWORK", "road_network_used": True,
            "water_checked": bool(rings), "water_route_clear": True,
            "fallback_reason": None,
            "recommendation": "Modeled road-network paths from the available OpenStreetMap snapshot; not live navigation or traffic guidance.",
            "comparison_summary": {
                "shortest_distance_m": shortest_m,
                "alternative_distance_m": alternative_m,
                "alternative_available": bool(alternative_path),
            },
            "note": self.disclaimer,
            "water_checked_endpoints": 2 if rings and endpoints_valid else 0,
        }
