import unittest

from exposure_analysis import build_exposure_summary, line_intersection_length_m, line_length_m


class ExposureGeometryTests(unittest.TestCase):
    def setUp(self):
        self.high_zone = {
            "risk_category": "HIGH",
            "geometry": {"type": "Polygon", "coordinates": [[
                [80.0, 12.0], [80.001, 12.0], [80.001, 12.001],
                [80.0, 12.001], [80.0, 12.0],
            ]]},
        }
        self.low_zone = {
            "risk_category": "LOW",
            "geometry": {"type": "Polygon", "coordinates": [[
                [80.001, 12.0], [80.002, 12.0], [80.002, 12.001],
                [80.001, 12.001], [80.001, 12.0],
            ]]},
        }

    def test_road_length_is_clipped_to_high_and_critical_susceptibility_geometry(self):
        full = [[12.0005, 80.0001], [12.0005, 80.0009]]
        crossing = [[12.0005, 79.9995], [12.0005, 80.0015]]
        outside = [[12.0005, 80.0011], [12.0005, 80.0019]]
        mask = [self.high_zone]
        self.assertAlmostEqual(line_intersection_length_m(full, mask), line_length_m(full), delta=0.02)
        self.assertAlmostEqual(
            line_intersection_length_m(crossing, mask) / line_length_m(crossing),
            0.5,
            delta=0.01,
        )
        self.assertEqual(line_intersection_length_m(outside, [self.high_zone]), 0.0)

    def test_road_totals_can_be_clipped_to_partial_source_extent(self):
        crossing = [[12.0005, 79.9995], [12.0005, 80.0015]]
        clipped_extent = {"geometry": {"type": "Polygon", "coordinates": [[
            [80.00025, 12.0], [80.00075, 12.0], [80.00075, 12.001],
            [80.00025, 12.001], [80.00025, 12.0],
        ]]}}
        total_in_extent = line_intersection_length_m(crossing, [clipped_extent])
        exposed_in_extent = line_intersection_length_m(crossing, [self.high_zone], [clipped_extent])
        self.assertGreater(total_in_extent, 0)
        self.assertAlmostEqual(exposed_in_extent, total_in_extent, delta=0.02)

    def test_summary_separates_inventory_from_spatially_exposed_facilities(self):
        infrastructure = {
            "roads": [
                {"id": "osm-1", "name": "Crossing road", "source_status": "REAL_SOURCE_DATA",
                 "coordinates": [[12.0005, 79.9995], [12.0005, 80.0015]]},
                {"id": "demo-road", "source_status": "DEMO_FALLBACK",
                 "coordinates": [[12.0005, 80.0001], [12.0005, 80.0009]]},
            ],
            "hospitals": [
                {"id": "hospital-in", "name": "Inside", "coordinates": [12.0005, 80.0005], "source_status": "DEMO_FALLBACK"},
                {"id": "hospital-out", "name": "Outside", "coordinates": [12.0005, 80.0015], "source_status": "DEMO_FALLBACK"},
            ],
            "schools": [], "shelters": [], "other_critical_assets": [],
        }
        result = build_exposure_summary(
            [self.high_zone, self.low_zone], infrastructure,
            {"roads": {"source": "OpenStreetMap snapshot", "status": "PARTIAL_REAL_SOURCE"}},
        )
        self.assertEqual(result["roads"]["feature_count"], 1)
        self.assertEqual(result["roads"]["source"], "OpenStreetMap snapshot")
        self.assertAlmostEqual(result["roads"]["exposure_percent"], 50.0, delta=0.01)
        self.assertEqual(result["facilities"]["total_inventory"], 2)
        self.assertEqual(result["facilities"]["spatially_tested"], 2)
        self.assertEqual(result["facilities"]["hazard_exposed"], 1)
        self.assertFalse(result["buildings"]["available"])
        self.assertFalse(result["settlements"]["available"])
        self.assertFalse(result["population"]["reported"])
        self.assertFalse(result["land_use"]["available"])


if __name__ == "__main__":
    unittest.main()
