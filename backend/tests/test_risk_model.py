"""Focused regression tests for risk normalization and source selection."""
import os
import unittest
from unittest.mock import patch

from data_loader import real_data_enabled
from geodata import derive_real_water_proximity
from ingest_geodata import normalize_elevation
from models import SimulationResponse
from rainfall_data import resolve_rainfall_input
from risk_engine import RiskEngine


class RainfallNormalizationTests(unittest.TestCase):
    def setUp(self):
        self.engine = RiskEngine()

    def test_rainfall_values_are_monotonic_bounded_and_expected(self):
        inputs = [0, 4.3, 20, 40, 80, 120, 160, 200, 500]
        values = [self.engine.calculate_rainfall_factor(value) for value in inputs]
        self.assertEqual(values, sorted(values))
        self.assertTrue(all(0 <= value <= 100 for value in values))
        self.assertEqual(values, [0.0, 0.0, 6.6, 18.0, 40.9, 63.7, 86.6, 100.0, 100.0])

    def test_forecast_and_scenario_inputs_are_separate(self):
        forecast = {
            "value_mm": 4.3,
            "source": "Open-Meteo test forecast",
            "accumulation_period": "Next 24 hours, test window",
            "retrieved_at": "2026-09-29T11:30:30Z",
            "method": "Test fixture",
            "source_grid_coordinates": [12.829525, 80.03629],
        }
        with patch("rainfall_data.load_active_rainfall_forecast", return_value=forecast):
            selected = resolve_rainfall_input(120, "forecast")
        self.assertEqual(selected["value_mm"], 4.3)
        self.assertEqual(selected["rainfall_source"], "FORECAST")
        self.assertEqual(selected["period_hours"], 24)
        self.assertEqual(selected["unit"], "mm")
        self.assertEqual(selected["provenance"]["value_mm"], 4.3)

        with patch("rainfall_data.load_active_rainfall_forecast", return_value=forecast):
            scenario = resolve_rainfall_input(120, "scenario")
        self.assertEqual(scenario["value_mm"], 120)
        self.assertEqual(scenario["rainfall_source"], "SCENARIO")
        self.assertNotEqual(scenario["value_mm"], selected["value_mm"])

    def test_missing_or_disabled_forecast_falls_back_explicitly(self):
        with patch("rainfall_data.load_active_rainfall_forecast", return_value=None):
            missing = resolve_rainfall_input(120, "forecast")
        self.assertEqual(missing["value_mm"], 120)
        self.assertEqual(missing["rainfall_source"], "DEMO_FALLBACK")
        self.assertEqual(missing["provenance"]["status"], "DEMO_FALLBACK")

        with patch.dict(os.environ, {"GEO_SHIELD_DISABLE_REAL_DATA": "1"}):
            self.assertFalse(real_data_enabled())
            disabled = resolve_rainfall_input(40, "forecast")
        self.assertEqual(disabled["value_mm"], 40)
        self.assertEqual(disabled["rainfall_source"], "DEMO_FALLBACK")

    def test_partial_osm_coverage_is_not_interpreted_as_no_water(self):
        with patch.dict(os.environ, {"GEO_SHIELD_DISABLE_REAL_DATA": ""}):
            self.assertTrue(real_data_enabled())
            inside_coverage = derive_real_water_proximity(80.044, 12.8235)
            outside_coverage = derive_real_water_proximity(80.032, 12.810)
        self.assertIsNotNone(inside_coverage)
        self.assertGreaterEqual(inside_coverage["risk"], 0)
        self.assertIsNone(outside_coverage)


class ElevationAndCompositeTests(unittest.TestCase):
    def setUp(self):
        self.engine = RiskEngine()

    def test_elevation_normalization_clips_and_handles_degenerate_range(self):
        self.assertEqual(normalize_elevation(25, 25, 75), 100.0)
        self.assertEqual(normalize_elevation(75, 25, 75), 0.0)
        self.assertEqual(normalize_elevation(0, 10, 10), 50.0)
        self.assertEqual(normalize_elevation(100, 10, 10), 50.0)
        self.assertEqual(normalize_elevation(-100, 0, 100), 100.0)
        self.assertEqual(normalize_elevation(200, 0, 100), 0.0)

    def test_score_contributions_match_the_configured_weighted_score(self):
        result = self.engine.calculate_risk({
            "elevation_factor": 82,
            "drainage_factor": 70,
            "landcover_factor": 55,
            "water_proximity_factor": 30,
        }, 120)
        contributions = result["factor_contributions"]
        self.assertAlmostEqual(sum(item["weight"] for item in contributions.values()), 1.0)
        self.assertAlmostEqual(sum(item["contribution"] for item in contributions.values()), result["risk_score"], delta=0.06)
        self.assertTrue(all(0 <= item["risk"] <= 100 for item in contributions.values()))
        self.assertTrue(all(item["contribution"] >= 0 for item in contributions.values()))
        self.assertTrue(0 <= result["risk_score"] <= 100)

    def test_score_is_bounded_at_factor_and_rainfall_extremes(self):
        for factor_value in (0, 100):
            for rainfall in (0, 500):
                with self.subTest(factor_value=factor_value, rainfall=rainfall):
                    result = self.engine.calculate_risk({
                        "elevation_factor": factor_value,
                        "drainage_factor": factor_value,
                        "landcover_factor": factor_value,
                        "water_proximity_factor": factor_value,
                    }, rainfall)
                    self.assertGreaterEqual(result["risk_score"], 0)
                    self.assertLessEqual(result["risk_score"], 100)

    def test_risk_tier_boundaries_match_configuration(self):
        expectations = {
            25: "LOW", 25.1: "MODERATE", 50: "MODERATE",
            50.1: "HIGH", 75: "HIGH", 75.1: "CRITICAL",
        }
        for score, expected in expectations.items():
            with self.subTest(score=score):
                self.assertEqual(self.engine.classify_risk(score), expected)

    def test_all_real_grid_cells_expose_provenance_and_weighted_contributions(self):
        with patch.dict(os.environ, {"GEO_SHIELD_DISABLE_REAL_DATA": ""}):
            zones = self.engine.evaluate_all_zones(120)
        self.assertEqual(len(zones), 79)
        for zone in zones:
            with self.subTest(zone=zone["id"]):
                self.assertIn("elevation_normalization_method", zone)
                self.assertEqual(set(zone["factor_contributions"]), {
                    "elevation", "rainfall", "drainage", "landcover", "water_proximity"
                })
                self.assertAlmostEqual(
                    sum(item["contribution"] for item in zone["factor_contributions"].values()),
                    zone["risk_score"],
                    delta=0.06,
                )
                self.assertTrue(zone["data_provenance"]["water_proximity"]["method"])
        water_statuses = {zone["data_provenance"]["water_proximity"]["status"] for zone in zones}
        self.assertIn("REAL_SOURCE_DERIVED", water_statuses)
        self.assertIn("DEMO_FALLBACK", water_statuses)

        zone = zones[0]
        response = SimulationResponse.model_validate({
            "simulation_state": "SCENARIO-BASED RISK SIMULATION",
            "rainfall_mm": 120,
            "rainfall_mode": "scenario",
            "rainfall_source": "SCENARIO",
            "rainfall_period_hours": 24,
            "rainfall_unit": "mm",
            "risk_score": round(zone["risk_score"]),
            "risk_category": zone["risk_category"],
            "exposed_population": zone["exposed_population"],
            "total_study_population": zone["population"],
            "high_risk_zones": 0,
            "critical_infrastructure": 0,
            "critical_infrastructure_count": 0,
            "infrastructure_counts": {},
            "overall_risk_score": round(zone["risk_score"]),
            "overall_risk_category": zone["risk_category"],
            "high_risk_zones_count": 0,
            "total_zones_count": 1,
            "resource_coverage": 50,
            "resource_coverage_pct": 50,
            "resource_inventory": {},
            "exposure_definition": "Prototype tier estimate",
            "zones": [zone],
        })
        self.assertEqual(response.zones[0].factor_contributions["rainfall"]["weight"], 0.25)

    def test_disabling_real_data_returns_demo_zones_without_crashing(self):
        with patch.dict(os.environ, {"GEO_SHIELD_DISABLE_REAL_DATA": "1"}):
            self.assertFalse(real_data_enabled())
            zones = self.engine.evaluate_all_zones(120)
        self.assertEqual(len(zones), 7)
        self.assertTrue(all(zone["risk_category"] in {"LOW", "MODERATE", "HIGH", "CRITICAL"} for zone in zones))


if __name__ == "__main__":
    unittest.main()
