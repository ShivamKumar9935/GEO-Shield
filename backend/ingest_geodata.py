"""One-time open-data ingestion; the API reads compact local products, not live large downloads.

Usage: python ingest_geodata.py --process-dem <tile.tif> | --download-dem | --fetch-osm
Install optional raster tools with: python -m pip install -r requirements-geodata.txt
"""
import argparse
import json
import math
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
STUDY_PATH = DATA / "study_areas.json"
PROVENANCE_PATH = DATA / "provenance.json"
MOCK_ZONES_PATH = DATA / "mock" / "risk_zones.geojson"
DEM_URL = "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/Copernicus_DSM_COG_10_N12_00_E080_00_DEM/Copernicus_DSM_COG_10_N12_00_E080_00_DEM.tif"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OSM_CREDIT = "Data © OpenStreetMap contributors, available under the ODbL."

def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))

def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def point_in_ring(lon, lat, ring):
    inside = False
    j = len(ring) - 1
    for i, (xi, yi) in enumerate(ring):
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-15) + xi:
            inside = not inside
        j = i
    return inside

def normalize_elevation(elevation_m, p02_m, p98_m):
    if p98_m <= p02_m:
        return 50.0
    return round(max(0.0, min(100.0, (p98_m - elevation_m) / (p98_m - p02_m) * 100.0)), 1)

def process_dem(dem_path, location, out_dir):
    try:
        import numpy as np
        import rasterio
        from rasterio.windows import from_bounds, transform as window_transform
    except ImportError as error:
        raise RuntimeError("Install backend/requirements-geodata.txt to process raster data") from error
    bbox = location["bbox"]
    bounds = (bbox["west"], bbox["south"], bbox["east"], bbox["north"])
    zones = read_json(MOCK_ZONES_PATH).get("features", [])
    out_dir.mkdir(parents=True, exist_ok=True)
    with rasterio.open(dem_path) as dem:
        window = from_bounds(*bounds, transform=dem.transform).round_offsets().round_lengths()
        crop = dem.read(1, window=window, masked=True)
        values = crop.compressed()
        if values.size == 0:
            raise RuntimeError("Copernicus DEM tile has no valid pixels inside the configured study area")
        p02, p98 = (float(x) for x in np.percentile(values, [2, 98]))
        nodata = dem.nodata if dem.nodata is not None else -32768.0
        profile = dem.profile.copy()
        profile.update(driver="GTiff", height=crop.shape[0], width=crop.shape[1], count=1,
                       transform=window_transform(window, dem.transform), nodata=nodata,
                       compress="deflate", predictor=3, tiled=False)
        with rasterio.open(out_dir / "elevation_clip_30m.tif", "w", **profile) as target:
            target.write(crop.filled(nodata).astype(dem.dtypes[0]), 1)
        cell_m = float(location.get("grid_cell_size_m", 180))
        dlat = cell_m / 111320.0
        dlon = cell_m / (111320.0 * math.cos(math.radians(location["latitude"])))
        cells, counts = [], {}
        lat = bbox["south"] + dlat / 2
        row = 0
        while lat + dlat / 2 <= bbox["north"]:
            lon = bbox["west"] + dlon / 2
            col = 0
            while lon + dlon / 2 <= bbox["east"]:
                parent = next((f for f in zones if point_in_ring(lon, lat, f["geometry"]["coordinates"][0])), None)
                if parent:
                    height = float(next(dem.sample([(lon, lat)]))[0])
                    if dem.nodata is None or not math.isclose(height, float(dem.nodata)):
                        pid = parent["properties"]["id"]
                        cells.append({"row": row, "col": col, "center": [round(lat, 7), round(lon, 7)],
                                      "bounds": [lon-dlon/2, lat-dlat/2, lon+dlon/2, lat+dlat/2],
                                      "parent": parent, "elevation_m": round(height, 2)})
                        counts[pid] = counts.get(pid, 0) + 1
                lon += dlon
                col += 1
            lat += dlat
            row += 1
    if not cells:
        raise RuntimeError("No generated grid-cell centroids fell inside the retained demo-zone geometry")
    cursors = {feature["properties"]["id"]: 0 for feature in zones}
    features = []
    for cell in cells:
        parent = cell["parent"]["properties"]
        pid, n = parent["id"], counts[parent["id"]]
        cursor = cursors[pid]
        pop = int(parent.get("population", 0))
        cell_pop = pop // n + int(cursor < pop % n)
        cursors[pid] += 1
        west, south, east, north = cell["bounds"]
        h = cell["elevation_m"]
        cell_id = f"POT-{cell['row']:03d}-{cell['col']:03d}"
        props = {
            "id": cell_id, "name": f"Grid {cell_id} · {parent['name']}",
            "description": "Centroid sampled from clipped Copernicus DEM; other factors and population are inherited/apportioned from the retained Phase 1 demo zone.",
            "parent_zone_id": pid, "parent_zone_name": parent["name"], "base_elevation_m": h,
            "elevation_factor": normalize_elevation(h, p02, p98),
            "drainage_factor": parent.get("drainage_factor", 50),
            "landcover_factor": parent.get("landcover_factor", 50),
            "water_proximity_factor": parent.get("water_proximity_factor", 50),
            "population": cell_pop, "infrastructure": parent.get("infrastructure", []),
            "accessibility_factor": parent.get("accessibility_factor", 0.7), "center": cell["center"],
            "factor_provenance": {
                "elevation": {"status": "REAL_SOURCE_DATA", "source": "Copernicus DEM GLO-30", "value_m": h, "method": f"Centroid elevation; inverse linear normalization between P02={p02:.4f} m and P98={p98:.4f} m."},
                "rainfall": {"status": "SCENARIO_INPUT", "source": "GEO-SHIELD rainfall scenario", "method": "Scenario input, not observed rainfall."},
                "drainage": {"status": "DEMO", "source": "Retained Phase 1 demo risk-zone dataset", "method": f"Inherited from {pid}; no observed drainage model."},
                "landcover": {"status": "DEMO", "source": "Retained Phase 1 demo risk-zone dataset", "method": f"Inherited from {pid}; no real land-cover raster is connected."},
                "water_proximity": {"status": "DEMO_FALLBACK", "source": "Retained Phase 1 demo risk-zone dataset", "method": f"Inherited from {pid}; OSM water features have not yet been retrieved."},
                "population": {"status": "DEMO", "source": "Retained Phase 1 demo risk-zone dataset", "method": f"{cell_pop} people apportioned from {pid} across {n} cells; the source zone total is conserved."}
            }
        }
        features.append({"type": "Feature", "properties": props, "geometry": {"type": "Polygon", "coordinates": [[[west,south],[east,south],[east,north],[west,north],[west,south]]]}})
    grid_path = out_dir / "risk_grid.geojson"
    write_json(grid_path, {"type": "FeatureCollection", "name": f"{location['id']}_copernicus_dem_risk_grid", "features": features})
    return {"grid_path": grid_path, "cell_count": len(features), "valid_crop_pixels": int(values.size),
            "crop_min_elevation_m": round(float(values.min()), 4), "crop_max_elevation_m": round(float(values.max()), 4),
            "normalization_p02_m": round(p02, 4), "normalization_p98_m": round(p98, 4), "cell_size_m": int(cell_m),
            "source_crs": "EPSG:4326"}

def refresh_dem(source_path=None):
    config = read_json(STUDY_PATH)
    location = config["locations"][config["active_location_id"]]
    out_dir = DATA / "real" / location["id"]
    if source_path:
        result = process_dem(Path(source_path), location, out_dir)
    else:
        with tempfile.TemporaryDirectory(prefix="geo-shield-dem-") as temp_dir:
            tile = Path(temp_dir) / "copernicus_tile.tif"
            with urlopen(DEM_URL, timeout=90) as response, tile.open("wb") as target:
                target.write(response.read())
            result = process_dem(tile, location, out_dir)
    metadata = read_json(PROVENANCE_PATH)
    elevation = metadata["datasets"]["elevation"]
    elevation.update({"retrieved_at": utc_now(), "is_real": True, "status": "REAL_SOURCE_DATA"})
    elevation["processing"] = {**elevation.get("processing", {}), **{k:v for k,v in result.items() if k != "grid_path"},
                                "formula": "clamp((p98_m - elevation_m) / (p98_m - p02_m) * 100, 0, 100)"}
    elevation["description"] = (f"Copernicus GLO-30 DSM clipped to the configured pilot bbox. {result['cell_size_m']} m cells use centroid elevation, "
        f"with inverse linear normalization between area P02 ({result['normalization_p02_m']} m) and P98 ({result['normalization_p98_m']} m). "
        "Lower elevation maps to higher modeled susceptibility; this is not a validated hydrological flood model.")
    write_json(PROVENANCE_PATH, metadata)
    print(json.dumps({"status":"elevation_grid_ready", **{k:str(v) if isinstance(v,Path) else v for k,v in result.items()}}, indent=2))

def overpass_data(bbox):
    box = f"{bbox['south']},{bbox['west']},{bbox['north']},{bbox['east']}"
    lat_buffer = 0.009
    lon_buffer = 0.0092
    water_box = f"{bbox['south']-lat_buffer},{bbox['west']-lon_buffer},{bbox['north']+lat_buffer},{bbox['east']+lon_buffer}"
    query = f"""[out:json][timeout:25];(way[\"natural\"~\"water|wetland\"]({water_box});way[\"waterway\"~\"river|stream|canal\"]({water_box});way[\"landuse\"~\"reservoir|basin\"]({water_box});way[\"highway\"]({box});nwr[\"amenity\"~\"hospital|clinic|doctors|school|college|university|shelter|police|fire_station\"]({box}););out geom;"""
    body = urlencode({"data":query}).encode("utf-8")
    req = Request(OVERPASS_URL, data=body, headers={"User-Agent":"GEO-SHIELD local open-data ingestion/1.0", "Accept":"application/json"})
    with urlopen(req, timeout=40) as response:
        return json.loads(response.read().decode("utf-8"))

def osm_to_features(elements):
    features = []
    for item in elements:
        tags = item.get("tags", {})
        points = [[p["lon"],p["lat"]] for p in item.get("geometry", []) if "lon" in p and "lat" in p]
        amenity = tags.get("amenity")
        if tags.get("highway") and len(points) >= 2:
            kind, geometry = "road", {"type":"LineString","coordinates":points}
        elif tags.get("waterway") or tags.get("natural") in {"water","wetland"} or tags.get("landuse") in {"reservoir","basin"}:
            if len(points) < 2: continue
            area = points[0] == points[-1] and len(points) >= 4 and (tags.get("natural") in {"water","wetland"} or tags.get("landuse") in {"reservoir","basin"} or tags.get("waterway") == "riverbank")
            kind, geometry = "water_body", ({"type":"Polygon","coordinates":[points]} if area else {"type":"LineString","coordinates":points})
        elif amenity in {"hospital","clinic","doctors","school","college","university","shelter","police","fire_station"}:
            kind = "facility"
            if item.get("type") == "node": point = [item["lon"],item["lat"]]
            elif item.get("center"): point = [item["center"]["lon"],item["center"]["lat"]]
            elif points: point = [sum(p[0] for p in points)/len(points),sum(p[1] for p in points)/len(points)]
            else: continue
            geometry = {"type":"Point","coordinates":point}
        else: continue
        features.append({"type":"Feature","id":f"osm-{item.get('type')}-{item.get('id')}","properties":{"kind":kind,"osm_type":item.get("type"),"osm_id":item.get("id"),"name":tags.get("name"),**tags},"geometry":geometry})
    return features

def _osm_counts(features):
    counts = {kind: sum(f["properties"]["kind"] == kind for f in features) for kind in ("road", "water_body", "facility")}
    counts["facility_types"] = {}
    for feature in features:
        properties = feature["properties"]
        if properties.get("kind") == "facility":
            amenity = properties.get("amenity", "unknown")
            counts["facility_types"][amenity] = counts["facility_types"].get(amenity, 0) + 1
    return counts

def store_osm_features(response, study_bbox, water_bbox, osm_path):
    study_config = read_json(STUDY_PATH)
    active_bbox = study_config["locations"][study_config["active_location_id"]]["bbox"]
    features = osm_to_features(response.get("elements", []))
    counts = _osm_counts(features)
    snapshot = response.get("osm3s", {}).get("timestamp_osm_base")
    write_json(osm_path, {
        "type": "FeatureCollection",
        "name": "potheri_srm_openstreetmap",
        "copyright": OSM_CREDIT,
        "osm_base": snapshot,
        "retrieved_at": utc_now(),
        "study_area_bbox": study_bbox,
        "coverage": {
            "roads": study_bbox,
            "infrastructure": study_bbox,
            "water_bodies": water_bbox,
            "water_buffer_m": 1000 if water_bbox != study_bbox else 0
        },
        "features": features
    })
    metadata = read_json(PROVENANCE_PATH)
    for key, kind, extent_key in (("roads", "road", "roads"), ("water_bodies", "water_body", "water_bodies"), ("infrastructure", "facility", "infrastructure")):
        count = counts[kind]
        entry = metadata["datasets"][key]
        entry.update({
            "retrieved_at": utc_now(),
            "is_real": count > 0,
            "status": "PARTIAL_REAL_SOURCE" if count and study_bbox != active_bbox else "REAL_SOURCE_DATA" if count else "NOT_YET_CONNECTED",
            "geographic_extent": {**study_bbox, "layer_query_extent": water_bbox if extent_key == "water_bodies" else study_bbox},
            "attribution": OSM_CREDIT,
            "processing": {
                "feature_count": count,
                "feature_counts": counts,
                "study_area_coverage": study_bbox,
                "query_extent": water_bbox if extent_key == "water_bodies" else study_bbox,
                "water_buffer_m": 1000 if extent_key == "water_bodies" and water_bbox != study_bbox else 0,
                "osm_base": snapshot,
                "coverage_complete": study_bbox == active_bbox,
                "snapshot_not_realtime": True
            }
        })
        if count:
            entry["description"] = (
                f"Retrieved {count} OSM {kind.replace('_',' ')} features (snapshot {snapshot}). "
                f"Coverage is partial for the configured study area; queried extent: {entry['processing']['query_extent']}. "
                "Unmapped categories/areas retain clearly identified Phase 1 demo fallback data; this is not a complete inventory or real-time feed."
            )
        else:
            entry["description"] = "No features for this category were retrieved; the retained demo fallback remains active."
    infrastructure_entry = metadata["datasets"]["infrastructure"]
    if counts["facility"]:
        infrastructure_entry["status"] = "MIXED_REAL_AND_DEMO"
    write_json(PROVENANCE_PATH, metadata)
    return features, counts, snapshot

def refresh_osm(raw_path=None, coverage_bbox=None):
    config = read_json(STUDY_PATH)
    location = config["locations"][config["active_location_id"]]
    try:
        if raw_path:
            response = read_json(raw_path)
        else:
            response = overpass_data(location["bbox"])
    except Exception as error:
        print(f"OpenStreetMap refresh failed; existing demo fallbacks are unchanged: {error}")
        return False
    osm_path = DATA / location["osm_layers_file"]
    study_bbox = coverage_bbox or location["bbox"]
    water_bbox = {
        "south": round(study_bbox["south"] - 0.009, 6),
        "west": round(study_bbox["west"] - 0.0092, 6),
        "north": round(study_bbox["north"] + 0.009, 6),
        "east": round(study_bbox["east"] + 0.0092, 6)
    } if study_bbox == location["bbox"] else study_bbox
    features, counts, snapshot = store_osm_features(response, study_bbox, water_bbox, osm_path)
    print(json.dumps({"status":"osm_refresh_complete","counts":counts,"source_timestamp":response.get("osm3s",{}).get("timestamp_osm_base")},indent=2))
    return True

def main():
    parser = argparse.ArgumentParser(description="Create compact local geospatial inputs for the active study area.")
    parser.add_argument("--process-dem", metavar="FILE", help="Process a locally downloaded Copernicus GeoTIFF tile")
    parser.add_argument("--download-dem", action="store_true", help="Download the public Copernicus tile and process it")
    parser.add_argument("--fetch-osm", action="store_true", help="Retrieve the active area's mapped OSM roads, water and facilities")
    parser.add_argument("--process-osm", metavar="FILE", help="Normalize a previously retrieved Overpass JSON response")
    parser.add_argument("--osm-coverage-bbox", help="For --process-osm, south,west,north,east extent covered by the snapshot")
    args = parser.parse_args()
    if not (args.process_dem or args.download_dem or args.fetch_osm or args.process_osm):
        parser.error("Choose --process-dem FILE, --download-dem, --fetch-osm, or --process-osm FILE")
    if args.process_dem: refresh_dem(args.process_dem)
    if args.download_dem: refresh_dem()
    if args.fetch_osm: refresh_osm()
    if args.process_osm:
        config = read_json(STUDY_PATH)
        location = config["locations"][config["active_location_id"]]
        coverage = location["bbox"]
        if args.osm_coverage_bbox:
            south, west, north, east = (float(value) for value in args.osm_coverage_bbox.split(","))
            coverage = {"south":south,"west":west,"north":north,"east":east}
        refresh_osm(args.process_osm, coverage)

if __name__ == "__main__":
    main()
