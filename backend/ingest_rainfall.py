"""Fetch and cache a timestamped, next-24-hour Open-Meteo precipitation forecast.

Usage: python ingest_rainfall.py --fetch
The FastAPI app serves this local snapshot and never calls the external API per request.
"""
import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from data_loader import DATA_DIR, load_active_study_area
from rainfall_data import RAINFALL_CACHE

PROVENANCE_PATH = DATA_DIR / "provenance.json"
API_BASE = "https://api.open-meteo.com/v1/forecast"
SOURCE_URL = "https://open-meteo.com/en/docs"
LICENSE = "Creative Commons Attribution 4.0 International (CC BY 4.0)"
ATTRIBUTION = "Weather forecast data by Open-Meteo.com"

def parse_time(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

def build_forecast_record(response, retrieved_at=None, requested_coordinates=None):
    retrieved = retrieved_at or datetime.now(timezone.utc)
    if retrieved.tzinfo is None:
        retrieved = retrieved.replace(tzinfo=timezone.utc)
    retrieved = retrieved.astimezone(timezone.utc)
    now_hour = retrieved.replace(minute=0, second=0, microsecond=0)
    start = now_hour if retrieved == now_hour else now_hour + timedelta(hours=1)
    hourly = response.get("hourly", {})
    times = hourly.get("time", [])
    values = hourly.get("precipitation", [])
    if response.get("hourly_units", {}).get("precipitation") != "mm":
        raise ValueError("Open-Meteo response precipitation unit was not millimeters")
    if len(times) != len(values):
        raise ValueError("Open-Meteo response had mismatched hourly timestamps and precipitation")
    parsed_times = [parse_time(value) for value in times]
    try:
        start_index = parsed_times.index(start)
        end = start + timedelta(hours=24)
        end_index = parsed_times.index(end)
    except ValueError as error:
        raise ValueError("Open-Meteo response does not include a complete next-24-hour window") from error
    hourly_window = values[start_index + 1:end_index + 1]
    if len(hourly_window) != 24 or any(value is None for value in hourly_window):
        raise ValueError("Open-Meteo returned missing precipitation hours in the selected window")
    total_mm = round(sum(float(value) for value in hourly_window), 1)
    return {
        "name": "Open-Meteo next-24-hour precipitation forecast",
        "source": "Open-Meteo Forecast API (automatic best-match forecast model)",
        "source_model": "Best match; provider/model is selected by Open-Meteo and is not reported in this response.",
        "source_url": f"{API_BASE}?latitude={response['latitude']}&longitude={response['longitude']}&hourly=precipitation&forecast_hours=48&timezone=UTC",
        "documentation_url": SOURCE_URL,
        "license": LICENSE,
        "attribution": ATTRIBUTION,
        "type": "forecast",
        "is_real": True,
        "status": "REAL_SOURCE_DATA",
        "value_mm": total_mm,
        "unit": "mm",
        "period_hours": 24,
        "accumulation_period": f"Next 24 hours, {start.isoformat(timespec='minutes').replace('+00:00', 'Z')} to {end.isoformat(timespec='minutes').replace('+00:00', 'Z')} (UTC)",
        "valid_start": start.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "valid_end": end.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "retrieved_at": retrieved.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "spatial_resolution": "Forecast model grid selected by the API; provider resolution varies and is not returned.",
        "requested_coordinates": requested_coordinates,
        "source_grid_coordinates": [response["latitude"], response["longitude"]],
        "geographic_extent": {
            "latitude": response["latitude"],
            "longitude": response["longitude"]
        },
        "method": "Sum of the 24 hourly precipitation totals (mm) following the forecast-window start; API hourly precipitation is each preceding-hour sum.",
        "hourly_values_mm": [round(float(value), 1) for value in hourly_window]
    }

def write_forecast(record):
    RAINFALL_CACHE.parent.mkdir(parents=True, exist_ok=True)
    RAINFALL_CACHE.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    manifest = json.loads(PROVENANCE_PATH.read_text(encoding="utf-8"))
    entry = manifest["datasets"]["rainfall"]
    entry.update({
        "name": record["name"],
        "source": record["source"],
        "url_or_reference": f"{record['source_url']}; {record['documentation_url']}",
        "license": record["license"],
        "attribution": record["attribution"],
        "retrieved_at": record["retrieved_at"],
        "spatial_resolution": record["spatial_resolution"],
        "geographic_extent": record["geographic_extent"],
        "is_real": True,
        "status": "REAL_SOURCE_DATA",
        "description": f"Model-based source forecast, not a rain-gauge observation. {record['value_mm']} mm accumulation for {record['accumulation_period']}. Forecast snapshot expires at {record['valid_end']}.",
        "processing": {
            "type": record["type"],
            "unit": record["unit"],
            "period_hours": record["period_hours"],
            "accumulation_period": record["accumulation_period"],
            "valid_start": record["valid_start"],
            "valid_end": record["valid_end"],
            "cache_file": str(RAINFALL_CACHE.relative_to(DATA_DIR)),
            "value_mm": record["value_mm"],
            "method": record["method"]
        }
    })
    PROVENANCE_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

def fetch_forecast():
    study_area = load_active_study_area()
    params = urlencode({
        "latitude": study_area["latitude"],
        "longitude": study_area["longitude"],
        "hourly": "precipitation",
        "forecast_hours": 48,
        "timezone": "UTC",
        "timeformat": "iso8601"
    })
    request = Request(f"{API_BASE}?{params}", headers={"User-Agent": "GEO-SHIELD local rainfall ingestion/1.0", "Accept": "application/json"})
    with urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    record = build_forecast_record(payload, requested_coordinates=[study_area["latitude"], study_area["longitude"]])
    write_forecast(record)
    print(json.dumps({"status": "source_forecast_cached", "value_mm": record["value_mm"], "accumulation_period": record["accumulation_period"], "retrieved_at": record["retrieved_at"], "source_grid_coordinates": record["source_grid_coordinates"]}, indent=2))

def main():
    parser = argparse.ArgumentParser(description="Fetch and cache Potheri's source precipitation forecast.")
    parser.add_argument("--fetch", action="store_true", help="Fetch one forecast snapshot from Open-Meteo and update the local cache")
    parser.add_argument("--process-response", metavar="FILE", help="Process a saved Open-Meteo JSON response without making a network request")
    args = parser.parse_args()
    if args.fetch == bool(args.process_response):
        parser.error("Choose exactly one of --fetch or --process-response FILE")
    if args.fetch:
        fetch_forecast()
    else:
        response = json.loads(Path(args.process_response).read_text(encoding="utf-8-sig"))
        study_area = load_active_study_area()
        record = build_forecast_record(response, requested_coordinates=[study_area["latitude"], study_area["longitude"]])
        write_forecast(record)
        print(json.dumps({"status": "source_forecast_cached", "value_mm": record["value_mm"], "accumulation_period": record["accumulation_period"], "retrieved_at": record["retrieved_at"], "source_grid_coordinates": record["source_grid_coordinates"]}, indent=2))

if __name__ == "__main__":
    main()
