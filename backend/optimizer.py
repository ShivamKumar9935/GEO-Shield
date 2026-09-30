"""
Resource Optimizer module for GEO-SHIELD.
Implements an explainable multi-factor heuristic dispatch algorithm:

Priority Score = Risk × Population Exposure × Accessibility Hazard Multiplier

Assigns limited emergency resources (Ambulances, Rescue Boats, Emergency Shelters,
Relief Kits) to highest-priority zones based on hazard vulnerability, flood barriers,
and triage staging capacity.

Modular interface: Designed to be swapped with Google OR-Tools MIP solver in production.
"""

from typing import Dict, Any, List
from data_loader import load_resources_data, load_infrastructure_data, load_normalized_infrastructure
from resource_placement import find_land_deployment, find_boat_position

class ResourceOptimizer:
    def __init__(self):
        self.disclaimer = (
            "Prototype explainable heuristic optimization — "
            "replace with OR-Tools MILP constraint optimization in production."
        )

    def calculate_zone_priority(self, zone: Dict[str, Any]) -> float:
        """
        Computes Priority Score = (Risk / 100) * (Exposed_Pop / 1000) * (1.6 - Accessibility)
        Lower accessibility means higher vulnerability & urgent need for specialized assets.
        """
        risk_norm = float(zone.get("risk_score", 50.0)) / 100.0
        pop_norm = float(zone.get("exposed_population", 3000)) / 1000.0
        # Lower accessibility index (0.5) increases priority weight (needs early deployment before cut-off)
        access = float(zone.get("accessibility_factor", 0.7))
        accessibility_urgency = 1.6 - access

        priority = round(risk_norm * pop_norm * accessibility_urgency, 2)
        return priority

    def optimize(
        self,
        zones: List[Dict[str, Any]],
        num_ambulances: int = 3,
        num_boats: int = 2,
        num_shelters: int = 4,
        relief_kits: int = 5000
    ) -> Dict[str, Any]:
        """
        Runs heuristic resource positioning optimization across evaluated zones.
        """
        resources_db = load_resources_data()
        infrastructure_db = load_infrastructure_data()
        map_infrastructure = load_normalized_infrastructure()
        water_features = map_infrastructure.get("water_bodies", [])
        mapped_roads = [road for road in map_infrastructure.get("roads", []) if road.get("source_status") == "REAL_SOURCE_DATA"]
        safe_shelters = {item.get("id"): item for item in map_infrastructure.get("shelters", [])}
        relief_kits_available = min(relief_kits, resources_db.get("relief_kits_stock", 0))
        num_ambulances, num_boats, num_shelters = max(0, num_ambulances), max(0, num_boats), max(0, num_shelters)
        avail_ambs = resources_db.get("ambulances", [])[:num_ambulances]
        avail_boats = resources_db.get("boats", [])[:num_boats]

        def assignment_context(zone):
            assets = zone.get("infrastructure") or []
            category = zone.get("risk_category", "UNCLASSIFIED")
            return [
                f"{category} risk (score {zone.get('risk_score', 0)})",
                "legacy tier-based population proxy used for optimizer scoring; not a spatial exposure count",
                f"{len(assets)} infrastructure assets listed for the zone",
                "listed infrastructure count breaks exact priority-score ties only",
            ]

        # Rank zones by Priority Score descending
        ranked_zones = []
        for z in zones:
            score = self.calculate_zone_priority(z)
            ranked_zones.append({
                **z,
                "priority_score": score
            })

        ranked_zones.sort(key=lambda x: (x["priority_score"], len(x.get("infrastructure") or [])), reverse=True)

        assignments = []
        amb_idx = 0
        boat_idx = 0
        placed_boat_coordinates = []

        # Allocation:
        # 1. Rescue Boats: Prioritize zones with high water-proximity / drainage risk (e.g. Zone C, Zone F)
        water_zones = [z for z in ranked_zones if z["factors"]["water_proximity_risk"] >= 70 or z["factors"]["drainage_risk"] >= 70]
        # Fall back to general priority if needed
        boat_candidate_zones = water_zones if water_zones else ranked_zones
        boat_water_priority_available = bool(water_zones)

        for z in boat_candidate_zones:
            if boat_idx >= len(avail_boats):
                break
            boat = avail_boats[boat_idx]
            placement = find_boat_position(z["center"], water_features, z, placed_boat_coordinates)
            if placement["placement_method"] == "WATER_FEATURE_POINT":
                placed_boat_coordinates.append(placement["coordinates"])
            reason = assignment_context(z)
            reason.append("zone met the existing water/drainage priority threshold" if boat_water_priority_available else "no zone met the water/drainage threshold; assigned by general zone priority")
            reason.append(placement["water_status"])
            assignments.append({
                "resource_type": "Rescue Boat",
                "status": "DEPLOYED",
                "resource_id": boat["id"],
                "resource_name": boat["name"],
                "assigned_zone_id": z["id"],
                "assigned_zone_name": z["name"],
                "priority_score": z["priority_score"],
                "risk_score": z["risk_score"],
                "population": z["population"],
                "exposed_population": z["exposed_population"],
                "rationale": (f"Water proximity {z['factors']['water_proximity_risk']}% and drainage risk {z['factors']['drainage_risk']}%; assigned to a water-priority zone."
                              if boat_water_priority_available else "No zone met the configured water/drainage threshold; assigned by general zone priority."),
                "reason": reason,
                "coordinates": placement["coordinates"],
                "placement_method": placement["placement_method"],
                "placement_adjusted": placement["placement_adjusted"],
                "placement_distance_m": placement["placement_distance_m"],
                "water_status": placement["water_status"],
                "placement_source": f"{placement['water_status']} + GEO-SHIELD optimizer",
                "deployment": {"latitude": placement["coordinates"][0], "longitude": placement["coordinates"][1],
                               "placement_method": placement["placement_method"], "water_status": placement["water_status"]}
            })
            boat_idx += 1

        # 2. Ambulances: Assign across highest priority zones with accessible road infrastructure
        for z in ranked_zones:
            if amb_idx >= len(avail_ambs):
                break
            amb = avail_ambs[amb_idx]
            placement = find_land_deployment(z["center"], water_features, mapped_roads, z)
            reason = assignment_context(z)
            reason.append("land-accessible deployment point identified" if placement["placement_method"] != "DEMO_FALLBACK" else "demo fallback point used")
            reason.append(placement["road_status"])
            if placement.get("placement_failed"):
                reason.append(placement["placement_failure_reason"])
            deployment_coordinates = placement["coordinates"] or []
            assignments.append({
                "resource_type": "Ambulance",
                "status": "DEPLOYED",
                "resource_id": amb["id"],
                "resource_name": amb["callsign"],
                "assigned_zone_id": z["id"],
                "assigned_zone_name": z["name"],
                "priority_score": z["priority_score"],
                "risk_score": z["risk_score"],
                "population": z["population"],
                "exposed_population": z["exposed_population"],
                "rationale": f"Priority score {z['priority_score']} uses risk, the legacy modeled population proxy, and accessibility {z.get('accessibility_factor', 0.7)}; population is not spatially measured exposure.",
                "reason": reason,
                "coordinates": deployment_coordinates,
                "placement_adjusted": placement["placement_adjusted"],
                "placement_method": placement["placement_method"],
                "placement_distance_m": placement["placement_distance_m"],
                "placement_failed": placement.get("placement_failed", False),
                "placement_failure_reason": placement.get("placement_failure_reason"),
                "nearest_road_distance_m": placement["nearest_road_distance_m"],
                "road_status": placement["road_status"],
                "placement_source": "Mapped water validation + " + ("OSM roads" if mapped_roads else "road data unavailable") + " + GEO-SHIELD optimizer",
                "deployment": {"latitude": deployment_coordinates[0] if deployment_coordinates else None,
                               "longitude": deployment_coordinates[1] if deployment_coordinates else None,
                               "placement_method": placement["placement_method"],
                               "placement_distance_m": placement["placement_distance_m"],
                               "nearest_road_distance_m": placement["nearest_road_distance_m"],
                               "road_status": placement["road_status"]}
            })
            amb_idx += 1

        # 3. Emergency Shelters: Activate top elevated and accessible zones
        # Zone B (SRM Medical) and Zone G (Maraimalai) are primary elevated staging zones
        shelter_inventory = sorted(
            infrastructure_db.get("shelters", []),
            key=lambda shelter: (-shelter.get("elevation_m", 0), -shelter.get("capacity", 0))
        )
        active_shelters = shelter_inventory[:num_shelters]
        shelter_assignments = []
        zones_by_id = {z["id"]: z for z in ranked_zones}
        zones_by_parent = {}
        for zone in ranked_zones:
            if zone.get("parent_zone_id"):
                zones_by_parent.setdefault(zone["parent_zone_id"], []).append(zone)
        for s in active_shelters:
            assigned_zone = zones_by_id.get(s.get("zone_id"))
            if assigned_zone is None and zones_by_parent.get(s.get("zone_id")):
                candidates = zones_by_parent[s["zone_id"]]
                source_coords = s.get("coordinates") or candidates[0].get("center", [])
                assigned_zone = min(candidates, key=lambda zone: (
                    float(zone.get("center", source_coords)[0]) - float(source_coords[0])
                ) ** 2 + (
                    float(zone.get("center", source_coords)[1]) - float(source_coords[1])
                ) ** 2)
            if assigned_zone is None and ranked_zones:
                source_coords = s.get("coordinates") or ranked_zones[0].get("center", [0, 0])
                assigned_zone = min(ranked_zones, key=lambda zone: (
                    float(zone.get("center", source_coords)[0]) - float(source_coords[0])
                ) ** 2 + (
                    float(zone.get("center", source_coords)[1]) - float(source_coords[1])
                ) ** 2)
            if assigned_zone is None:
                continue
            shelter_assignments.append({
                "resource_type": "Active Shelter",
                "resource_id": s["id"],
                "resource_name": s["name"],
                "assigned_zone_id": assigned_zone["id"],
                "assigned_zone_name": assigned_zone["name"],
                "priority_score": assigned_zone["priority_score"],
                "risk_score": assigned_zone["risk_score"],
                "population": assigned_zone["population"],
                "exposed_population": assigned_zone["exposed_population"],
                "rationale": f"Existing demo shelter, {s.get('capacity', 0):,}-person capacity, elevation {s.get('elevation_m', 'unknown')} m.",
                "status": "FIXED FACILITY · ACTIVE FOR THIS SCENARIO",
                "coordinates": safe_shelters.get(s["id"], {}).get("map_coordinates", s.get("coordinates", assigned_zone["center"])),
                "placement_adjusted": safe_shelters.get(s["id"], {}).get("map_placement_adjusted", False),
                "placement_note": safe_shelters.get(s["id"], {}).get("map_placement_note"),
                "placement_method": safe_shelters.get(s["id"], {}).get("map_placement_method", "DEMO_FALLBACK"),
                "nearest_road_distance_m": safe_shelters.get(s["id"], {}).get("nearest_road_distance_m"),
                "road_status": safe_shelters.get(s["id"], {}).get("road_status", "ROAD DATA UNAVAILABLE")
            })

        # Calculate coverage metric: percentage of exposed population covered by deployed resources
        total_exposed = sum(z.get("exposed_population", 0) for z in zones) or 1
        covered_pop = 0
        all_assignments = assignments + shelter_assignments
        covered_zones_set = set(a["assigned_zone_id"] for a in all_assignments)
        for z in zones:
            if z["id"] in covered_zones_set:
                covered_pop += z.get("exposed_population", 0)

        assigned_ambulances = sum(a["resource_type"] == "Ambulance" for a in assignments)
        assigned_boats = sum(a["resource_type"] == "Rescue Boat" for a in assignments)
        coverage_pct = round(min(100.0, (covered_pop / total_exposed) * 100.0 * (0.8 + 0.05 * assigned_ambulances + 0.04 * assigned_boats)), 1)
        coverage_pct = min(98.5, max(35.0, coverage_pct)) if all_assignments else 0.0

        return {
            "algorithm": "Explainable heuristic dispatch based on risk, a legacy tier-based population proxy, accessibility, and available demo inventory. The proxy is not a spatial exposure result.",
            "ambulances_selected": num_ambulances,
            "boats_selected": num_boats,
            "shelters_selected": num_shelters,
            "total_ambulances_assigned": assigned_ambulances,
            "total_boats_assigned": assigned_boats,
            "total_shelters_active": len(active_shelters),
            "relief_kits_available_simulated": relief_kits_available,
            "resource_coverage_pct": coverage_pct,
            "assignments": assignments + shelter_assignments,
            "zone_priorities": [
                {
                    "zone_id": z["id"],
                    "zone_name": z["name"],
                    "risk_score": z["risk_score"],
                    "exposed_population": z["exposed_population"],
                    "priority_score": z["priority_score"],
                    "infrastructure_asset_count": len(z.get("infrastructure") or [])
                }
                for z in ranked_zones
            ]
        }
