"""Regression tests for resource inventory and placement contracts."""
import unittest
from unittest.mock import patch

from optimizer import ResourceOptimizer
from resource_placement import (
    find_boat_position,
    find_land_deployment,
    point_is_in_water,
)
from risk_engine import RiskEngine
from data_loader import load_normalized_infrastructure
from data_loader import load_infrastructure_data
from routing import EvacuationRouter


class ResourceOptimizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.zones = RiskEngine().evaluate_all_zones(120)
        cls.optimizer = ResourceOptimizer()

    def test_inventory_limits_zero_and_requested_counts(self):
        mapped = load_normalized_infrastructure()
        for inventory_count in (0, 1, 3, 5):
            with self.subTest(resource_count=inventory_count):
                result = self.optimizer.optimize(
                    self.zones, num_ambulances=inventory_count,
                    num_boats=inventory_count, num_shelters=0,
                )
                amb = [a for a in result["assignments"] if a["resource_type"] == "Ambulance"]
                boats = [a for a in result["assignments"] if a["resource_type"] == "Rescue Boat"]
                self.assertEqual(len(amb), inventory_count)
                self.assertEqual(len(boats), inventory_count)
                self.assertLessEqual(len(amb), inventory_count)
                self.assertLessEqual(len(boats), inventory_count)
                self.assertEqual(result["total_shelters_active"], 0)
                if inventory_count == 0:
                    self.assertEqual(result["resource_coverage_pct"], 0.0)
                for assignment in amb:
                    self.assertFalse(point_is_in_water(assignment["coordinates"], mapped["water_bodies"]))
                    self.assertIn("placement_method", assignment)
                    self.assertIn("nearest_road_distance_m", assignment)
                for assignment in boats:
                    self.assertEqual(assignment["placement_method"], "WATER_FEATURE_POINT")
                    self.assertIn("WATER FEATURE", assignment["water_status"])

    def test_land_candidate_inside_water_moves_to_valid_land_and_keeps_zone(self):
        water = [{"geometry_type": "Polygon", "coordinates": [
            [12.0004, 80.0004], [12.0004, 80.0006],
            [12.0006, 80.0006], [12.0006, 80.0004],
        ]}]
        zone = {"id": "CELL-1", "geometry": {"type": "Polygon", "coordinates": [[
            [80.0, 12.0], [80.001, 12.0], [80.001, 12.001], [80.0, 12.001], [80.0, 12.0],
        ]]}}
        road = [{"source_status": "REAL_SOURCE_DATA", "coordinates": [[12.0002, 80.0002], [12.0008, 80.0008]]}]
        placement = find_land_deployment([12.0005, 80.0005], water, road, zone)
        self.assertTrue(placement["placement_adjusted"])
        self.assertFalse(point_is_in_water(placement["coordinates"], water))
        self.assertEqual(placement["road_status"], "OSM_ROADS_AVAILABLE")
        self.assertNotEqual(placement["coordinates"], [12.0005, 80.0005])

    def test_land_candidate_on_land_and_missing_layers_fall_back_cleanly(self):
        land = find_land_deployment([12.0, 80.0], [], [], None)
        self.assertEqual(land["placement_method"], "ZONE_REPRESENTATIVE_POINT")
        self.assertEqual(land["coordinates"], [12.0, 80.0])
        self.assertEqual(land["road_status"], "ROAD DATA UNAVAILABLE")
        no_water = find_land_deployment([12.0, 80.0], [], [{"coordinates": [[12.0, 80.0], [12.001, 80.0]]}], None)
        self.assertEqual(no_water["coordinates"], [12.0, 80.0])
        self.assertIsNotNone(no_water["nearest_road_distance_m"])

    def test_boats_prefer_mapped_water_and_report_missing_water(self):
        water = [{"geometry_type": "Polygon", "coordinates": [
            [12.0, 80.0], [12.0, 80.002], [12.002, 80.002], [12.002, 80.0],
        ]}]
        placement = find_boat_position([12.001, 80.001], water)
        self.assertEqual(placement["placement_method"], "WATER_FEATURE_POINT")
        self.assertTrue(point_is_in_water(placement["coordinates"], water))
        fallback = find_boat_position([12.001, 80.001], [])
        self.assertEqual(fallback["placement_method"], "DEMO_FALLBACK")
        self.assertEqual(fallback["water_status"], "MAPPED WATER DATA UNAVAILABLE")

    def test_fixed_shelter_is_still_a_fixed_facility_when_scenario_activates_it(self):
        infrastructure = load_normalized_infrastructure()
        fixed_count = len(infrastructure["shelters"])
        result = self.optimizer.optimize(self.zones, num_ambulances=1, num_boats=0, num_shelters=1)
        active = [item for item in result["assignments"] if item["resource_type"] == "Active Shelter"]
        deployed = [item for item in result["assignments"] if item["resource_type"] == "Ambulance"]
        self.assertEqual(len(infrastructure["shelters"]), fixed_count)
        self.assertEqual(len(active), 1)
        self.assertEqual(len(deployed), 1)
        self.assertEqual(active[0]["status"], "FIXED FACILITY · ACTIVE FOR THIS SCENARIO")
        shelter = next(item for item in infrastructure["shelters"] if item["id"] == active[0]["resource_id"])
        matching_parent = [zone for zone in self.zones if zone.get("parent_zone_id") == shelter["zone_id"]]
        if matching_parent:
            expected_zone = min(matching_parent, key=lambda zone: sum(
                (float(zone["center"][axis]) - float(shelter["coordinates"][axis])) ** 2 for axis in (0, 1)
            ))
        else:
            expected_zone = min(self.zones, key=lambda zone: sum(
                (float(zone["center"][axis]) - float(shelter["coordinates"][axis])) ** 2 for axis in (0, 1)
            ))
        self.assertEqual(active[0]["assigned_zone_id"], expected_zone["id"])

    def test_routes_use_road_network_geometry_and_dry_endpoints(self):
        router = EvacuationRouter()
        shelters = load_infrastructure_data()["shelters"]
        infrastructure = load_normalized_infrastructure()
        water = infrastructure["water_bodies"]
        for scenario in router.get_available_scenarios():
            with self.subTest(scenario=scenario["id"]):
                destination = scenario["destination"]["coords"]
                destination_shelter = next((shelter for shelter in shelters if shelter["coordinates"] == destination), None)
                self.assertIsNotNone(destination_shelter)
                self.assertGreater(destination_shelter["capacity"], 0)
                for route_key in ("shortest_route", "risk_aware_route"):
                    path = scenario[route_key]["path"]
                    self.assertEqual(path[0], scenario["origin"]["coords"])
                    self.assertEqual(path[-1], destination)
                response = router.compute_evacuation_routes(scenario["id"])
                self.assertEqual(response["route_type"], "OSM_ROAD_NETWORK")
                self.assertTrue(response["road_network_used"])
                self.assertTrue(response["water_checked"])
                self.assertTrue(response["water_route_clear"])
                self.assertFalse(point_is_in_water(response["origin"]["coords"], water))
                self.assertFalse(point_is_in_water(response["destination"]["coords"], water))
                self.assertEqual(response["water_checked_endpoints"], 2)
                self.assertEqual(response["shortest"]["path"][0], response["origin"]["coords"])
                self.assertEqual(response["shortest"]["path"][-1], response["destination"]["coords"])
                self.assertGreater(len(response["shortest"]["path"]), 2)
                self.assertGreater(response["shortest"]["distance_m"], 0)
                self.assertNotIn("est_time_min", response["shortest"])
                self.assertIsNone(response["shortest"]["risk_score"])

    def test_route_falls_back_explicitly_when_osm_roads_are_unavailable(self):
        infrastructure = load_normalized_infrastructure()
        infrastructure["roads"] = []
        with patch("routing.load_normalized_infrastructure", return_value=infrastructure):
            response = EvacuationRouter().compute_evacuation_routes("EVAC-01")
        self.assertEqual(response["route_type"], "MODELED_FALLBACK")
        self.assertFalse(response["road_network_used"])
        self.assertIn("OpenStreetMap road geometry is unavailable", response["fallback_reason"])
        self.assertTrue(response["water_checked"])
        self.assertIsNone(response["shortest"]["est_time_min"])
        if response["shortest"]["path"]:
            self.assertFalse(point_is_in_water(response["shortest"]["path"][0], infrastructure["water_bodies"]))

    def test_route_falls_back_when_endpoints_cannot_connect_to_roads(self):
        infrastructure = load_normalized_infrastructure()
        infrastructure["roads"] = [{
            "source_status": "REAL_SOURCE_DATA", "geometry_type": "LineString",
            "coordinates": [[10.0, 70.0], [10.001, 70.001]],
        }]
        with patch("routing.load_normalized_infrastructure", return_value=infrastructure):
            response = EvacuationRouter().compute_evacuation_routes("EVAC-01")
        self.assertEqual(response["route_type"], "MODELED_FALLBACK")
        self.assertFalse(response["road_network_used"])
        self.assertIn("more than", response["fallback_reason"])

    def test_route_falls_back_when_either_endpoint_has_no_road_connection(self):
        attachment = {"edge_index": 0, "fraction": 0.5, "point": [12.82, 80.04], "distance": 10.0}
        for missing_endpoint in ("origin", "destination"):
            with self.subTest(endpoint=missing_endpoint):
                outcomes = [None, attachment] if missing_endpoint == "origin" else [attachment, None]
                with patch("routing._nearest_attachment", side_effect=outcomes):
                    response = EvacuationRouter().compute_evacuation_routes("EVAC-01")
                self.assertEqual(response["route_type"], "MODELED_FALLBACK")
                self.assertFalse(response["road_network_used"])
                self.assertIn("endpoint is more than", response["fallback_reason"])

    def test_water_crossing_osm_edges_are_excluded(self):
        from routing import _road_edges, _water_rings, _line_crosses_water
        water = [{"geometry_type": "Polygon", "coordinates": [
            [12.0004, 80.0004], [12.0004, 80.0006],
            [12.0006, 80.0006], [12.0006, 80.0004], [12.0004, 80.0004],
        ]}]
        rings = _water_rings(water)
        roads = [{"coordinates": [[12.0005, 80.0001], [12.0005, 80.0009]]}]
        edges = _road_edges(roads, rings)
        self.assertTrue(all(not _line_crosses_water([[edge["pa"][0], edge["pa"][1]], [edge["pb"][0], edge["pb"][1]]], rings) for edge in edges))
        self.assertLess(len(edges), 1)

    def test_adjusted_placement_does_not_change_zone_assignment(self):
        zones = [{
            "id": "CELL-1", "name": "Test cell", "center": [12.0005, 80.0005],
            "geometry": {"type": "Polygon", "coordinates": [[[80.0, 12.0], [80.001, 12.0], [80.001, 12.001], [80.0, 12.001], [80.0, 12.0]]]},
            "risk_score": 80, "risk_category": "CRITICAL", "population": 1000,
            "exposed_population": 950, "accessibility_factor": 0.5,
            "infrastructure": ["School", "Clinic"],
            "factors": {"water_proximity_risk": 70, "drainage_risk": 50},
        }]
        normalized = {
            "water_bodies": [{"geometry_type": "Polygon", "coordinates": [[12.0004, 80.0004], [12.0004, 80.0006], [12.0006, 80.0006], [12.0006, 80.0004]]}],
            "roads": [], "shelters": [],
        }
        with patch("optimizer.load_resources_data", return_value={"ambulances": [{"id": "AMB-1", "callsign": "A1"}], "boats": [], "relief_kits_stock": 0}), \
             patch("optimizer.load_infrastructure_data", return_value={"shelters": []}), \
             patch("optimizer.load_normalized_infrastructure", return_value=normalized):
            result = self.optimizer.optimize(zones, num_ambulances=1, num_boats=0, num_shelters=0)
        assignment = next(item for item in result["assignments"] if item["resource_type"] == "Ambulance")
        self.assertEqual(assignment["assigned_zone_id"], "CELL-1")
        self.assertTrue(assignment["placement_adjusted"])
        self.assertFalse(point_is_in_water(assignment["coordinates"], normalized["water_bodies"]))


if __name__ == "__main__":
    unittest.main()
