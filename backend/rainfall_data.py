"""Local cache access for source-based precipitation; API requests never call the provider."""
import json
from datetime import datetime, timezone

from data_loader import DATA_DIR, real_data_enabled

RAINFALL_CACHE = DATA_DIR / "real" / "potheri_srm" / "rainfall_forecast.json"

def _parse_utc(value):
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

def load_rainfall_record():
    if not RAINFALL_CACHE.exists():
        return None
    with RAINFALL_CACHE.open("r", encoding="utf-8") as source:
        record = json.load(source)
    record.setdefault("unit", "mm")
    record.setdefault("period_hours", 24)
    now = datetime.now(timezone.utc)
    start = _parse_utc(record.get("valid_start"))
    end = _parse_utc(record.get("valid_end"))
    record["is_current"] = bool(start and end and start <= now < end)
    record["enabled"] = real_data_enabled()
    record["active"] = record["is_current"] and record["enabled"] and record.get("is_real") is True
    if not record["is_current"]:
        record["effective_status"] = "STALE_SOURCE_DATA"
    elif not record["enabled"]:
        record["effective_status"] = "DEMO_FALLBACK"
    else:
        record["effective_status"] = record.get("status", "REAL_SOURCE_DATA")
    return record

def load_active_rainfall_forecast():
    record = load_rainfall_record()
    return record if record and record.get("active") else None


def scenario_rainfall_input(value_mm):
    """Return a normalized 24-hour hypothetical rainfall input."""
    value = float(value_mm)
    return {
        "value_mm": value,
        "unit": "mm",
        "period_hours": 24,
        "active_mode": "scenario",
        "rainfall_source": "SCENARIO",
        "provenance": {
            "type": "scenario",
            "status": "SCENARIO_INPUT",
            "rainfall_source": "SCENARIO",
            "source": "GEO-SHIELD user-defined scenario control",
            "is_real": False,
            "value_mm": value,
            "unit": "mm",
            "period_hours": 24,
            "accumulation_period": "User-defined hypothetical 24-hour scenario total; not observed or forecast rainfall.",
            "method": "Scenario amount is a hypothetical 24-hour rainfall input to the model."
        }
    }


def resolve_rainfall_input(value_mm, mode="scenario"):
    """Resolve exactly one rainfall input; forecast and scenario values never mix."""
    scenario = scenario_rainfall_input(value_mm)
    if mode != "forecast":
        return {**scenario, "requested_mode": "scenario"}

    forecast = load_active_rainfall_forecast()
    if forecast:
        provenance = {
            "type": "forecast",
            "status": "FORECAST_SOURCE_DATA",
            "rainfall_source": "FORECAST",
            "source": forecast["source"],
            "is_real": True,
            "value_mm": float(forecast["value_mm"]),
            "unit": "mm",
            "period_hours": 24,
            "accumulation_period": forecast["accumulation_period"],
            "retrieved_at": forecast["retrieved_at"],
            "method": forecast["method"],
            "source_grid_coordinates": forecast["source_grid_coordinates"]
        }
        return {
            "value_mm": float(forecast["value_mm"]),
            "unit": "mm",
            "period_hours": 24,
            "active_mode": "forecast",
            "requested_mode": "forecast",
            "rainfall_source": "FORECAST",
            "provenance": provenance
        }

    fallback = {**scenario["provenance"]}
    fallback.update({
        "status": "DEMO_FALLBACK",
        "rainfall_source": "DEMO_FALLBACK",
        "method": "Requested source forecast is missing, expired, or disabled; the submitted scenario amount was used instead."
    })
    return {
        **scenario,
        "requested_mode": "forecast",
        "rainfall_source": "DEMO_FALLBACK",
        "provenance": fallback
    }
