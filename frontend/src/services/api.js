import { MOCK_INFRASTRUCTURE, MOCK_ROUTES } from './mockData';

const configuredApiBase = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE = (configuredApiBase || (import.meta.env.DEV ? 'http://localhost:8000' : '')).replace(/\/$/, '');

async function request(path, options = {}) {
  if (!API_BASE) {
    throw new Error('GEO-SHIELD API is not configured. Set VITE_API_BASE_URL to the deployed backend URL.');
  }
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) throw new Error(`GEO-SHIELD API ${path} failed (${response.status})`);
  return response.json();
}

export async function fetchRiskSimulation({ rainfall = 120, rainfallMode = 'scenario', ambulances = 3, boats = 2, shelters = 4, reliefKits = 5000 }) {
  const data = await request('/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rainfall, rainfall_mode: rainfallMode, ambulances, boats, shelters, relief_kits: reliefKits })
  });
  return { data, source: 'backend' };
}

export async function fetchOptimization({ rainfall = 120, rainfallMode = 'scenario', ambulances = 3, boats = 2, shelters = 4, reliefKits = 5000 }) {
  const result = await request('/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rainfall, rainfall_mode: rainfallMode, ambulances, boats, shelters, relief_kits: reliefKits })
  });
  return { data: result.data, source: 'backend' };
}

export async function fetchResources() {
  return request('/resources');
}

export async function fetchInfrastructure() {
  try {
    return await request('/infrastructure');
  } catch {
    return {
      data_status: 'DEMO / SIMULATION',
      hospitals: MOCK_INFRASTRUCTURE.hospitals.map(item => ({ ...item, coordinates: item.coords })),
      shelters: MOCK_INFRASTRUCTURE.shelters.map(item => ({ ...item, coordinates: item.coords })),
      schools: [
        { id: 'SCH-01', name: 'SRM Public School', coordinates: [12.8255, 80.0445], zone_id: 'ZONE-A' },
        { id: 'SCH-02', name: 'Potheri Panchayat Union Middle School', coordinates: [12.8285, 80.0390], zone_id: 'ZONE-C' },
        { id: 'SCH-03', name: "St. Joseph's Matriculation School", coordinates: [12.8140, 80.0360], zone_id: 'ZONE-G' }
      ],
      water_bodies: MOCK_INFRASTRUCTURE.water_bodies.map(item => ({ ...item, coordinates: item.path })),
      roads: MOCK_INFRASTRUCTURE.roads.map(item => ({ ...item, coordinates: item.path })),
      utilities: [], transit: [], other_critical_assets: []
    };
  }
}

export async function fetchRouteScenarios() {
  try {
    return await request('/routes/scenarios');
  } catch {
    return [{ id: 'EVAC-01', name: MOCK_ROUTES.shortest.name }];
  }
}

export async function fetchMethodology() {
  return request('/methodology');
}

export async function fetchStudyArea() {
  return request('/study-area');
}

export async function fetchRainfall({ mode = 'scenario', scenarioMm = 120 } = {}) {
  const params = new URLSearchParams({ mode, scenario_mm: String(scenarioMm) });
  return request(`/rainfall?${params.toString()}`);
}

export async function fetchExposure({ rainfall = 120, rainfallMode = 'scenario' } = {}) {
  const params = new URLSearchParams({ rainfall: String(rainfall), rainfall_mode: rainfallMode });
  const response = await request(`/exposure?${params.toString()}`);
  return response.data;
}

export async function fetchRoutes(scenarioId = 'EVAC-01') {
  try {
    const route = await request(`/routes?scenario_id=${encodeURIComponent(scenarioId)}`);
    return { ...route, shortest: route.shortest, risk_aware: route.risk_aware };
  } catch {
    return { scenario_id: 'EVAC-01', shortest: MOCK_ROUTES.shortest, risk_aware: MOCK_ROUTES.risk_aware, demo: true };
  }
}
