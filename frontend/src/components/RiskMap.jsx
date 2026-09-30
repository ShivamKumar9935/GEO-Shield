import React, { useEffect, useRef } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Polygon, 
  Polyline, 
  Marker, 
  Popup, 
  Tooltip,
  useMap,
  Pane
} from 'react-leaflet';
import L from 'leaflet';
import RiskLegend from './RiskLegend';

// Custom clean DivIcons for high-density command center GIS
const createCustomIcon = (bgColor, iconChar, borderColor = '#ffffff') => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        background-color: ${bgColor};
        color: white;
        border: 2px solid ${borderColor};
        border-radius: 50%;
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        box-shadow: 0 4px 10px rgba(0,0,0,0.6);
      ">
        ${iconChar}
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14]
  });
};

const hospitalIcon = createCustomIcon('#ef4444', '🏥', '#fca5a5');
const schoolIcon = createCustomIcon('#8b5cf6', '🏫', '#c4b5fd');
const emergencyFacilityIcon = createCustomIcon('#2563eb', '✚', '#93c5fd');
const shelterIcon = createCustomIcon('#10b981', '⛺', '#6ee7b7');
const standbyShelterIcon = createCustomIcon('#475569', '⛺', '#94a3b8');
const ambulanceIcon = createCustomIcon('#f59e0b', '🚑', '#fde68a');
const boatIcon = createCustomIcon('#06b6d4', '🚤', '#a5f3fc');
const cartoKey = import.meta.env.VITE_CARTO_API_KEY;
const tileUrl = cartoKey
  ? `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${encodeURIComponent(cartoKey)}`
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const tileAttribution = cartoKey
  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Color mapping for risk tiers
const getZoneColor = (category) => {
  if (category === 'CRITICAL') return '#ef4444';
  if (category === 'HIGH') return '#f97316';
  if (category === 'MODERATE') return '#f59e0b';
  return '#10b981';
};

function ResourceMapFocus({ request, markerRefs }) {
  const map = useMap();
  useEffect(() => {
    const marker = request?.resourceId ? markerRefs.current[request.resourceId] : null;
    if (!marker) return;
    map.flyTo(marker.getLatLng(), Math.max(16, map.getZoom()), { duration: 0.5 });
    marker.openPopup();
  }, [request, markerRefs, map]);
  return null;
}

function RouteMapFocus({ selectedRoute }) {
  const map = useMap();
  const path = selectedRoute?.route?.path;
  useEffect(() => {
    if (!Array.isArray(path) || path.length < 2) return;
    const bounds = L.latLngBounds(path);
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        paddingTopLeft: [48, 48],
        paddingBottomRight: [48, 48],
        maxZoom: 17,
        animate: true
      });
    }
  }, [selectedRoute, path, map]);
  return null;
}

function ZoneMapFocus({ request, zones }) {
  const map = useMap();
  useEffect(() => {
    if (!request?.gridId) return;
    const zone = zones.find((feature) => feature.id === request.gridId);
    const positions = getZonePositions(zone);
    if (!positions || positions.length < 3) return;
    const bounds = L.latLngBounds(positions);
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [56, 56],
        maxZoom: 16,
        animate: true
      });
    }
  }, [request, zones, map]);
  return null;
}

// Safe helper to extract [lat, lon] positions for Leaflet Polygon
function getZonePositions(zone) {
  if (!zone) return null;
  if (Array.isArray(zone.coordinates) && zone.coordinates.length >= 3) {
    return zone.coordinates;
  }
  if (zone.geometry?.coordinates?.[0] && Array.isArray(zone.geometry.coordinates[0])) {
    return zone.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
  }
  return null;
}

export default function RiskMap({
  zones = [],
  exposureData = null,
  infrastructure,
  allocatedResources = [],
  focusedResourceRequest = null,
  focusedZoneRequest = null,
  selectedRoute = null,
  classification,
  dataSources = {},
  activeLayers = {},
  toggleLayer,
  selectedGridId,
  onSelectZone,
  center = [12.8235, 80.0440],
  zoom = 14
}) {
  const resourceMarkerRefs = useRef({});
  const roadExposureById = new Map((exposureData?.roads?.features || []).map((road) => [String(road.id), road]));
  const facilityExposureByKey = new Map((exposureData?.facilities?.features || []).map((facility) => [`${facility.category}:${facility.id}`, facility]));
  const facilityExposureText = (category, feature) => {
    const result = facilityExposureByKey.get(`${category}:${feature.id}`);
    if (!result) return 'Spatial exposure status unavailable';
    if (!result.testable) return 'Location unavailable; not spatially tested';
    return result.exposed ? 'Source coordinate intersects HIGH / CRITICAL modeled susceptibility' : 'Source coordinate does not intersect HIGH / CRITICAL modeled susceptibility';
  };
  return (
    <div className="relative w-full h-full min-h-[450px] bg-navy-950 overflow-hidden">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <ResourceMapFocus request={focusedResourceRequest} markerRefs={resourceMarkerRefs} />
        <ZoneMapFocus request={focusedZoneRequest} zones={zones} />
        <RouteMapFocus selectedRoute={selectedRoute} />
        <TileLayer
          attribution={tileAttribution}
          url={tileUrl}
          maxZoom={20}
        />

        {/* 1. Flood Risk Polygons */}
        {activeLayers.floodRisk && zones.map((zone) => {
          const positions = getZonePositions(zone);
          if (!positions) return null;

          const color = getZoneColor(zone.risk_category);
          const isSelected = selectedGridId === zone.id;

          return (
            <Polygon
              key={zone.id}
              positions={positions}
              pathOptions={{
                color: isSelected ? '#ffffff' : color,
                weight: isSelected ? 3 : 2,
                fillColor: color,
                fillOpacity: isSelected ? 0.65 : 0.45,
                dashArray: isSelected ? '4, 4' : null
              }}
              eventHandlers={{
                click: () => onSelectZone(zone)
              }}
            >
              <Tooltip direction="top" sticky>
                <div className="text-xs font-sans text-slate-100">
                  <strong>{zone.name}</strong>
                  <br />
                  Susceptibility score: <span className="font-bold">{zone.risk_score}/100</span> ({zone.risk_category})
                  <br />
                  Modeled flood susceptibility: {zone.risk_category} · {zone.risk_score}/100
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* 2. Water Bodies (Potheri Eri, Kattankulathur Eri) */}
        {activeLayers.waterBodies && infrastructure?.water_bodies?.map((wb, idx) => {
          const coordinates = wb.coordinates || wb.path;
          if (!coordinates || !Array.isArray(coordinates)) return null;
          const WaterShape = wb.geometry_type === 'LineString' ? Polyline : Polygon;
          return (
            <WaterShape
              key={`wb-${idx}`}
              positions={coordinates}
              pathOptions={{
                color: wb.source_status === 'REAL_SOURCE_DATA' ? '#22d3ee' : '#38bdf8',
                weight: wb.source_status === 'REAL_SOURCE_DATA' ? 2.5 : 1.5,
                fillColor: wb.source_status === 'REAL_SOURCE_DATA' ? '#0e7490' : '#0284c7',
                fillOpacity: wb.source_status === 'REAL_SOURCE_DATA' ? 0.38 : 0.22
              }}
            >
              <Tooltip direction="center" permanent={false}>
                <div className="text-[11px] font-sans">
                  💧 <strong>{wb.name || 'Mapped water feature'}</strong> ({wb.type}) · {wb.source_status === 'REAL_SOURCE_DATA' ? 'OpenStreetMap' : 'Demo fallback'}
                </div>
              </Tooltip>
            </WaterShape>
          );
        })}

        {/* 3. Road Network */}
        {activeLayers.roads && infrastructure?.roads?.map((rd, idx) => {
          const coordinates = rd.coordinates || rd.path;
          if (!coordinates || !Array.isArray(coordinates)) return null;
          return (
            <Polyline
              key={`rd-${idx}`}
              positions={coordinates}
              pathOptions={{
                color: rd.source_status !== 'REAL_SOURCE_DATA' ? '#64748b' : roadExposureById.get(String(rd.id))?.exposed ? '#fb923c' : '#38bdf8',
                weight: rd.source_status === 'REAL_SOURCE_DATA' && roadExposureById.get(String(rd.id))?.exposed ? 4 : rd.source_status === 'REAL_SOURCE_DATA' ? 2.5 : 3,
                opacity: rd.source_status === 'REAL_SOURCE_DATA' ? 0.9 : 0.55,
                dashArray: rd.source_status === 'REAL_SOURCE_DATA' ? undefined : '6, 6'
              }}
            >
              <Tooltip direction="top">
                <span className="text-[10px] font-mono">{rd.name || 'Unnamed road'} · {rd.source_status === 'REAL_SOURCE_DATA' ? (roadExposureById.get(String(rd.id))?.exposed ? 'Exposed · modeled susceptibility' : 'Not exposed · modeled susceptibility') : 'Demo fallback · not included in road metrics'}</span>
              </Tooltip>
              <Popup>
                <div className="text-xs p-1">
                  <strong>{rd.name || 'Unnamed road'}</strong>
                  <div>{rd.source_status === 'REAL_SOURCE_DATA' ? 'OpenStreetMap snapshot' : 'Demo road · excluded from road exposure totals'}</div>
                  {rd.source_status === 'REAL_SOURCE_DATA' && <div>{roadExposureById.get(String(rd.id))?.exposed ? 'Intersects HIGH / CRITICAL modeled susceptibility' : 'Does not intersect HIGH / CRITICAL modeled susceptibility'}</div>}
                  {roadExposureById.get(String(rd.id)) && <div>Exposed length: {(roadExposureById.get(String(rd.id)).exposed_length_m / 1000).toFixed(3)} km</div>}
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* 4. Hospitals */}
        {activeLayers.hospitals && infrastructure?.hospitals?.map((hosp) => {
          if (hosp.map_placement_failed) return null;
          const coordinates = hosp.map_coordinates || hosp.coordinates || hosp.coords;
          if (!coordinates || coordinates.length < 2) return null;
          return (
            <Marker
              key={hosp.id}
              position={coordinates}
              icon={hospitalIcon}
            >
              <Popup>
                <div className="text-xs p-1">
                  <div className="font-bold text-red-400">🏥 {hosp.name}</div>
                  <div className="text-[10px] text-red-300 font-semibold">FIXED FACILITY</div>
                  <div className="text-[11px] text-slate-300 mt-1">{hosp.type}</div>
                  {hosp.beds != null && <div className="text-[10px] text-slate-400">Beds: {hosp.beds} | Critical Triage</div>}
                  <div className="text-[10px] text-slate-400">{hosp.source_status === 'REAL_SOURCE_DATA' ? 'OpenStreetMap' : 'Demo fallback'} · mapped coverage may be incomplete</div>
                  <div className="text-[10px] text-amber-300">{facilityExposureText('hospitals', hosp)}</div>
                  {hosp.map_placement_adjusted && <div className="text-[10px] text-amber-300">Display point shifted {hosp.map_placement_distance_m} m to mapped land; source location is preserved.</div>}
                  {hosp.nearest_road_distance_m != null && <div className="text-[10px] text-slate-400">Nearest mapped road: {hosp.nearest_road_distance_m} m</div>}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* 5. Emergency Shelters */}
        {activeLayers.shelters && infrastructure?.shelters?.map((sh) => {
          if (sh.map_placement_failed) return null;
          const coordinates = sh.map_coordinates || sh.coordinates || sh.coords;
          if (!coordinates || coordinates.length < 2) return null;
          const activeAssignment = allocatedResources.find((resource) =>
            resource.resource_type === 'Active Shelter' && resource.resource_id === sh.id
          );
          return (
            <Marker
              key={sh.id}
              position={coordinates}
              icon={activeAssignment ? shelterIcon : standbyShelterIcon}
            >
              <Popup>
                <div className="text-xs p-1">
                  <div className="font-bold text-emerald-400">⛺ {sh.name}</div>
                  <div className="text-[10px] text-emerald-300 font-semibold">FIXED FACILITY · {sh.source_status === 'REAL_SOURCE_DATA' ? 'OPENSTREETMAP' : 'DEMO FALLBACK'}</div>
                  <div className={`text-[11px] font-semibold mt-1 ${activeAssignment ? 'text-emerald-300' : 'text-slate-400'}`}>
                    {activeAssignment ? `Active in deployment · assigned to ${activeAssignment.assigned_zone_name}` : `Fixed shelter · not selected for this deployment · ${sh.source_status === 'REAL_SOURCE_DATA' ? 'OpenStreetMap' : 'Demo fallback'}`}
                  </div>
                  {sh.capacity != null && <div className="text-[11px] text-slate-300 mt-1">Capacity: {sh.capacity} Persons</div>}
                  <div className="text-[10px] text-amber-300">{facilityExposureText('shelters', sh)}</div>
                  {sh.rating != null && <div className="text-[10px] text-slate-400">Safety Index: {sh.rating}</div>}
                  {sh.map_placement_adjusted && <div className="text-[10px] text-amber-300">Display point shifted {sh.map_placement_distance_m} m to mapped land; source location is preserved.</div>}
                  {sh.nearest_road_distance_m != null && <div className="text-[10px] text-slate-400">Nearest mapped road: {sh.nearest_road_distance_m} m</div>}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* 5a. Schools and mapped universities */}
        {activeLayers.schools && infrastructure?.schools?.map((school) => {
          if (school.map_placement_failed) return null;
          const coordinates = school.map_coordinates || school.coordinates || school.coords;
          if (!coordinates || coordinates.length < 2) return null;
          return (
            <Marker key={school.id} position={coordinates} icon={schoolIcon}>
              <Popup>
                <div className="text-xs p-1">
                  <div className="font-bold text-violet-400">🏫 {school.name}</div>
                  <div className="text-[10px] text-violet-300 font-semibold">FIXED FACILITY</div>
                  <div className="text-[11px] text-slate-300 mt-1">{school.amenity || school.type || 'School / university'}</div>
                  <div className="text-[10px] text-slate-400">{school.source_status === 'REAL_SOURCE_DATA' ? 'OpenStreetMap' : 'Demo fallback'} · mapped coverage may be incomplete</div>
                  <div className="text-[10px] text-amber-300">{facilityExposureText('schools', school)}</div>
                  {school.map_placement_adjusted && <div className="text-[10px] text-amber-300">Display point shifted {school.map_placement_distance_m} m to mapped land; source location is preserved.</div>}
                  {school.nearest_road_distance_m != null && <div className="text-[10px] text-slate-400">Nearest mapped road: {school.nearest_road_distance_m} m</div>}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* 5b. Other mapped emergency facilities */}
        {activeLayers.emergencyFacilities && infrastructure?.other_critical_assets?.map((facility) => {
          if (facility.map_placement_failed) return null;
          const coordinates = facility.map_coordinates || facility.coordinates || facility.coords;
          if (!coordinates || coordinates.length < 2) return null;
          return (
            <Marker key={facility.id} position={coordinates} icon={emergencyFacilityIcon}>
              <Popup>
                <div className="text-xs p-1">
                  <div className="font-bold text-blue-400">✚ {facility.name}</div>
                  <div className="text-[10px] text-blue-300 font-semibold">FIXED FACILITY</div>
                  <div className="text-[11px] text-slate-300 mt-1">{facility.amenity || facility.type || 'Emergency facility'}</div>
                  <div className="text-[10px] text-amber-300">{facilityExposureText('other_critical_assets', facility)}</div>
                  <div className="text-[10px] text-slate-400">{facility.source_status === 'REAL_SOURCE_DATA' ? 'OpenStreetMap' : 'Demo fallback'} · mapped coverage may be incomplete</div>
                  {facility.map_placement_adjusted && <div className="text-[10px] text-amber-300">Display point shifted {facility.map_placement_distance_m} m to mapped land; source location is preserved.</div>}
                  {facility.nearest_road_distance_m != null && <div className="text-[10px] text-slate-400">Nearest mapped road: {facility.nearest_road_distance_m} m</div>}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* 6. Allocated Resources */}
        {activeLayers.resources && allocatedResources.filter((res) =>
          res.resource_type === 'Ambulance' || res.resource_type === 'Rescue Boat'
        ).map((res) => {
          if (!res.coordinates || !Array.isArray(res.coordinates) || res.coordinates.length < 2) {
            return null;
          }
          const isBoat = res.resource_type === 'Rescue Boat';
          const icon = isBoat ? boatIcon : ambulanceIcon;

          return (
            <Marker
              key={`alloc-${res.resource_id}`}
              ref={(marker) => {
                if (marker) resourceMarkerRefs.current[res.resource_id] = marker;
                else delete resourceMarkerRefs.current[res.resource_id];
              }}
              position={res.coordinates}
              icon={icon}
            >
              <Popup>
                <div className="text-xs p-1 max-w-[220px]">
                  <div className="font-bold text-blue-400 flex items-center gap-1">
                    {isBoat ? '🚤' : '🚑'} {res.resource_name || res.resource_id}
                  </div>
                  <div className="text-[10px] text-amber-300 font-semibold">STATUS · {res.status || 'DEPLOYED'}</div>
                  <div className="text-[11px] text-amber-300 font-semibold mt-1">
                    Assigned zone: {res.assigned_zone_id} · {res.assigned_zone_name}
                  </div>
                  {!isBoat && <div className="text-[10px] text-slate-300 mt-1">
                    Placement: {(res.placement_method || 'DEMO_FALLBACK').replace(/_/g, ' ').toLowerCase()}
                    {res.nearest_road_distance_m != null ? ` · nearest mapped OSM road ${res.nearest_road_distance_m} m` : ` · ${res.road_status || 'ROAD DATA UNAVAILABLE'}`}
                  </div>}
                  {isBoat && <div className="text-[10px] text-cyan-300 mt-1">
                    Placement: {(res.placement_method || 'DEMO_FALLBACK').replace(/_/g, ' ').toLowerCase()} · {res.water_status || 'MAPPED WATER DATA UNAVAILABLE'}
                  </div>}
                  {res.placement_adjusted && <div className="text-[10px] text-slate-400">Map point adjusted; assignment remains in the selected zone.</div>}
                  {res.placement_distance_m > 0 && <div className="text-[10px] text-slate-400">Point moved {res.placement_distance_m} m from the zone representative.</div>}
                  {res.placement_failed && <div className="text-[10px] text-rose-300">No valid dry point was found: {res.placement_failure_reason}</div>}
                  <div className="text-[10px] text-slate-300 font-semibold mt-2">WHY HERE?</div>
                  {res.reason?.map((reason, index) => <div key={index} className="text-[10px] text-slate-300">• {reason}</div>)}
                  <p className="text-[10px] text-slate-300 mt-1 leading-snug">
                    {res.rationale}
                  </p>
                  <div className="text-[10px] text-slate-400 mt-1">SOURCE · {res.placement_source || 'GEO-SHIELD optimizer'}</div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Selected route pane sits above roads/risk shapes and below all markers. */}
        {activeLayers.safeRoute && selectedRoute?.route?.path?.length > 1 && (
          <Pane name="evacuationRoutePane" style={{ zIndex: 450, pointerEvents: 'none' }}>
            <Polyline
              positions={selectedRoute.route.path}
              pathOptions={{ color: '#071521', weight: 11, opacity: 0.96, lineCap: 'round', lineJoin: 'round' }}
            />
            <Polyline
              positions={selectedRoute.route.path}
              pathOptions={{ color: selectedRoute.roadNetworkUsed ? '#22d3ee' : '#f59e0b', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' }}
            >
              <Tooltip direction="top" sticky>
                <div className="text-xs"><strong>{selectedRoute.routeType === 'MODELED_FALLBACK' ? 'MODELED FALLBACK ROUTE' : 'MODELED ROAD-NETWORK ROUTE'}</strong><br />{selectedRoute.scenarioId} · {selectedRoute.route.distance_m == null ? 'length unavailable' : `${Number(selectedRoute.route.distance_m).toLocaleString()} m`}</div>
              </Tooltip>
            </Polyline>
          </Pane>
        )}
      </MapContainer>

      {!cartoKey && (
        <div className="absolute bottom-3 right-3 z-[500] rounded border border-slate-600 bg-navy-950/90 px-2 py-1 text-[10px] text-slate-300">
          CARTO key not set · OpenStreetMap fallback
        </div>
      )}

      {activeLayers.safeRoute && selectedRoute?.route?.path?.length > 1 && (
        <div className="absolute right-4 top-4 z-[500] max-w-[260px] rounded-lg border border-cyan-500/70 bg-navy-950/95 px-3 py-2 shadow-xl pointer-events-none">
          <div className="text-[9px] font-bold uppercase tracking-wider text-cyan-300">{selectedRoute.routeType === 'MODELED_FALLBACK' ? 'MODELED FALLBACK ROUTE' : 'MODELED ROAD-NETWORK ROUTE'}</div>
          <div className="mt-0.5 text-xs font-bold text-white">{selectedRoute.scenarioId}</div>
          <div className="mt-1 text-[10px] text-slate-300">{selectedRoute.roadNetworkUsed ? 'OpenStreetMap road network' : 'Stored modeled geometry'}</div>
          <div className="text-[10px] text-slate-300">Distance: {selectedRoute.route.distance_m == null ? 'unavailable' : `${Number(selectedRoute.route.distance_m).toLocaleString()} m`}</div>
          <div className="mt-1 text-[9px] text-slate-500">Not live navigation or validated flood-safe directions.</div>
        </div>
      )}

      {/* Floating Risk Legend on Top-Left */}
      <div className="absolute top-4 left-4 z-[500] max-w-xs pointer-events-auto">
        <RiskLegend
          activeLayers={activeLayers}
          toggleLayer={toggleLayer}
          classification={classification}
          dataSources={dataSources}
        />
      </div>
    </div>
  );
}
