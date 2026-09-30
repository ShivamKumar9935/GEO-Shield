import React, { useState, useEffect, useRef } from 'react';
import NavigationSidebar from './NavigationSidebar';
import Header from './Header';
import RiskSummary from './RiskSummary';
import RiskMap from './RiskMap';
import ZoneDetailModal from './ZoneDetailModal';
import ExposurePanel from './ExposurePanel';
import ResourceOptimizer from './ResourceOptimizer';
import SafeRoutePanel from './SafeRoutePanel';
import ScenarioControls from './ScenarioControls';
import IncidentDecisionSummary from './IncidentDecisionSummary';
import ErrorBoundary from './ErrorBoundary';

import { 
  fetchRiskSimulation, 
  fetchOptimization, 
  fetchRoutes, 
  fetchInfrastructure,
  fetchRouteScenarios,
  fetchMethodology,
  fetchStudyArea,
  fetchRainfall,
  fetchResources,
  fetchExposure
} from '../services/api';
import MethodologyPanel from './MethodologyPanel';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('incident_summary');
  
  // Core scenario parameters
  const [rainfall, setRainfall] = useState(120);
  const [rainfallMode, setRainfallMode] = useState('scenario');
  const [rainfallSource, setRainfallSource] = useState(null);
  const [ambulances, setAmbulances] = useState(3);
  const [boats, setBoats] = useState(2);
  const [shelters, setShelters] = useState(4);
  const [reliefKits, setReliefKits] = useState(5000);

  // Model calculation state
  const [simulationData, setSimulationData] = useState(null);
  const [exposureData, setExposureData] = useState(null);
  const [exposureInputKey, setExposureInputKey] = useState(null);
  const [isExposureLoading, setIsExposureLoading] = useState(true);
  const [exposureError, setExposureError] = useState(false);
  const exposureRequestId = useRef(0);
  const [simulationInputKey, setSimulationInputKey] = useState(null);
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [optimizationInputKey, setOptimizationInputKey] = useState(null);
  const optimizationRequestId = useRef(0);
  const [selectedGridId, setSelectedGridId] = useState(null);
  const [focusedZoneRequest, setFocusedZoneRequest] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [backendStatus, setBackendStatus] = useState('DEMO / SIMULATION');
  const [infrastructure, setInfrastructure] = useState(null);
  const [resourceInventory, setResourceInventory] = useState(null);
  const [routes, setRoutes] = useState(null);
  const [routeScenarios, setRouteScenarios] = useState([]);
  const [routeScenarioId, setRouteScenarioId] = useState('EVAC-01');
  const [selectedMapRoute, setSelectedMapRoute] = useState(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [methodology, setMethodology] = useState(null);
  const [studyArea, setStudyArea] = useState(null);
  const [focusedResourceRequest, setFocusedResourceRequest] = useState(null);
  const currentInputKey = JSON.stringify([rainfall, rainfallMode, ambulances, boats, shelters, reliefKits]);
  const currentSimulationData = simulationInputKey === currentInputKey ? simulationData : null;
  const currentOptimizationResult = optimizationInputKey === currentInputKey ? optimizationResult : null;
  const currentExposureKey = JSON.stringify([rainfall, rainfallMode]);
  const currentExposureData = exposureInputKey === currentExposureKey ? exposureData : null;
  const mapZones = currentSimulationData?.zones || simulationData?.zones || [];
  const selectedZone = mapZones.find((zone) => zone.id === selectedGridId) || null;
  const activeRainfallMode = currentSimulationData?.rainfall_mode || rainfallMode;
  const activeRainfallMm = currentSimulationData?.rainfall_mm ?? (
    activeRainfallMode === 'forecast' ? rainfallSource?.forecast?.value_mm : rainfall
  );
  const activeRainfallSource = currentSimulationData?.rainfall_source || (
    activeRainfallMode === 'forecast' ? 'FORECAST' : 'SCENARIO'
  );
  const activeRainfallPeriodHours = currentSimulationData?.rainfall_period_hours || 24;

  useEffect(() => {
    fetchInfrastructure().then(setInfrastructure);
    fetchResources().then(setResourceInventory).catch(() => setResourceInventory(null));
    fetchRouteScenarios().then(setRouteScenarios);
    fetchMethodology().then(setMethodology);
    fetchStudyArea().then(setStudyArea).catch(() => {});
    fetchRainfall({ mode: 'scenario', scenarioMm: rainfall }).then(setRainfallSource).catch(() => setRainfallSource(null));
  }, []);

  useEffect(() => {
    let isMounted = true;
    setRoutes(null);
    fetchRoutes(routeScenarioId).then((result) => {
      if (isMounted) setRoutes(result);
    }).catch((error) => {
      if (isMounted) console.error(error);
    });
    return () => { isMounted = false; };
  }, [routeScenarioId]);

  useEffect(() => {
    setSelectedGridId(null);
    setFocusedZoneRequest(null);
  }, [rainfall, rainfallMode]);

  useEffect(() => {
    const requestId = ++exposureRequestId.current;
    setIsExposureLoading(true);
    setExposureError(false);
    fetchExposure({ rainfall, rainfallMode }).then((result) => {
      if (requestId === exposureRequestId.current) {
        setExposureData(result);
        setExposureInputKey(JSON.stringify([rainfall, rainfallMode]));
        setIsExposureLoading(false);
      }
    }).catch((error) => {
      if (requestId === exposureRequestId.current) {
        setExposureData(null);
        setExposureInputKey(null);
        setIsExposureLoading(false);
        setExposureError(true);
        console.error('Exposure analysis error:', error);
      }
    });
  }, [rainfall, rainfallMode]);

  // Layer visibility toggles
  const [activeLayers, setActiveLayers] = useState({
    floodRisk: true,
    waterBodies: true,
    roads: true,
    hospitals: true,
    schools: true,
    emergencyFacilities: true,
    shelters: true,
    resources: true,
    safeRoute: true
  });

  const toggleLayer = (layerId) => {
    setActiveLayers(prev => ({
      ...prev,
      [layerId]: !prev[layerId]
    }));
  };

  // Safe simulation trigger without recursive re-render loop
  useEffect(() => {
    let isMounted = true;
    setIsSimulating(true);

    fetchRiskSimulation({
      rainfall,
      rainfallMode,
      ambulances,
      boats,
      shelters,
      reliefKits
    }).then(res => {
      if (!isMounted) return;
      setSimulationData(res.data);
      setSimulationInputKey(currentInputKey);
      if (res.source) setBackendStatus(res.source);

    }).catch(err => {
      console.error('Simulation error:', err);
      setBackendStatus('API unavailable');
    }).finally(() => {
      if (isMounted) setIsSimulating(false);
    });

    return () => {
      isMounted = false;
    };
  }, [rainfall, rainfallMode, ambulances, boats, shelters, reliefKits]);

  // Optimizer execution
  const handleRunOptimization = async (params) => {
    const requestId = ++optimizationRequestId.current;
    const requestParams = {
      rainfall: params?.rainfall ?? rainfall,
      rainfallMode: params?.rainfallMode ?? rainfallMode,
      ambulances: params?.ambulances ?? ambulances,
      boats: params?.boats ?? boats,
      shelters: params?.shelters ?? shelters,
      reliefKits: params?.reliefKits ?? reliefKits
    };
    const requestInputKey = JSON.stringify([
      requestParams.rainfall, requestParams.rainfallMode, requestParams.ambulances,
      requestParams.boats, requestParams.shelters, requestParams.reliefKits
    ]);
    setIsOptimizing(true);
    try {
      const res = await fetchOptimization(requestParams);
      if (requestId === optimizationRequestId.current) {
        setOptimizationResult(res.data);
        setOptimizationInputKey(requestInputKey);
        setActiveLayers(prev => ({ ...prev, resources: true }));
      }
    } catch (err) {
      console.error('Optimization error:', err);
    } finally {
      if (requestId === optimizationRequestId.current) setIsOptimizing(false);
    }
  };

  // Keep dispatch recommendations synchronized with the active scenario.
  useEffect(() => {
    handleRunOptimization({ rainfall, ambulances, boats, shelters, reliefKits });
  }, [rainfall, rainfallMode, ambulances, boats, shelters, reliefKits]);

  const handleOpenPriorityZone = (zoneId) => {
    const zone = mapZones.find((item) => item.id === zoneId);
    if (!zone) return;
    setSelectedGridId(zone.id);
    setFocusedZoneRequest({ gridId: zone.id, requestId: Date.now() });
    setFocusedResourceRequest(null);
    setSelectedMapRoute(null);
    setActiveTab('risk_overview');
  };

  const handleSelectMapZone = (zone) => {
    setSelectedGridId(zone.id);
    setFocusedZoneRequest(null);
    setFocusedResourceRequest(null);
    setSelectedMapRoute(null);
  };

  const handleFocusResource = (resource) => {
    const zone = simulationData?.zones?.find((item) => item.id === resource.assigned_zone_id);
    setFocusedZoneRequest(null);
    setSelectedGridId(null);
    setSelectedMapRoute(null);
    setFocusedResourceRequest(null);
    if (Array.isArray(resource.coordinates) && resource.coordinates.length >= 2) {
      setFocusedResourceRequest({ resourceId: resource.resource_id, requestId: Date.now() });
      setActiveLayers((prev) => ({ ...prev, resources: true }));
    } else if (zone) {
      setSelectedGridId(zone.id);
    }
    setActiveTab('risk_overview');
  };

  const handleInspectRoute = (routeKey) => {
    const route = routes?.[routeKey];
    if (!route || !Array.isArray(route.path) || route.path.length < 2) return;
    setSelectedMapRoute({
      scenarioId: routes.scenario_id || routeScenarioId,
      routeKey,
      routeType: routes.route_type,
      roadNetworkUsed: routes.road_network_used === true,
      route
    });
    setFocusedZoneRequest(null);
    setSelectedGridId(null);
    setFocusedResourceRequest(null);
    setActiveLayers((prev) => ({ ...prev, safeRoute: true }));
    setActiveTab('risk_overview');
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen overflow-hidden bg-navy-950 font-sans text-slate-100 select-none">
        {/* 1. Left Navigation Sidebar */}
        <NavigationSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          simulationRainfall={rainfall}
          studyArea={studyArea}
          onOpenMethodology={() => setShowMethodology(true)}
        />

        {/* 2. Main Workstation Area */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Top Header */}
          <Header
            rainfall={rainfall}
            setRainfall={setRainfall}
            rainfallMode={rainfallMode}
            activeRainfallMode={activeRainfallMode}
            activeRainfallMm={activeRainfallMm}
            activeRainfallSource={activeRainfallSource}
            activeRainfallPeriodHours={activeRainfallPeriodHours}
            setRainfallMode={setRainfallMode}
            rainfallSource={rainfallSource?.forecast}
            onUseSourceForecast={() => setRainfallMode('forecast')}
            backendStatus={backendStatus}
            studyArea={studyArea}
            dataSources={methodology?.data_sources}
            onRefresh={() => {
              setIsSimulating(true);
              fetchRiskSimulation({ rainfall, rainfallMode, ambulances, boats, shelters, reliefKits })
                .then(res => { setSimulationData(res.data); setBackendStatus(res.source); })
                .catch(() => setBackendStatus('API unavailable'))
                .finally(() => setIsSimulating(false));
            }}
            isSimulating={isSimulating}
          />

          {/* Tab Views */}
          <div className="flex-1 relative min-h-0 overflow-hidden">
            {/* TAB 1: Risk Overview (Map + KPIs) */}
            {activeTab === 'risk_overview' && (
              <div className="h-full flex flex-col p-4 gap-3">
                {/* Top Metrics Cards */}
                <RiskSummary summaryData={currentSimulationData} exposureData={currentExposureData} />

                {/* Leaflet GIS Map Container */}
                <div className="flex-1 relative rounded-xl border border-slate-800 overflow-hidden shadow-2xl min-h-[450px]">
                  <ErrorBoundary>
                    <RiskMap
                      zones={mapZones}
                      exposureData={currentSimulationData ? currentExposureData : null}
                      infrastructure={infrastructure}
                      allocatedResources={currentOptimizationResult?.assignments || optimizationResult?.assignments || []}
                      focusedResourceRequest={focusedResourceRequest}
                      focusedZoneRequest={focusedZoneRequest}
                      selectedRoute={selectedMapRoute}
                      classification={methodology?.risk_model?.classification}
                      dataSources={methodology?.data_sources}
                      activeLayers={activeLayers}
                      toggleLayer={toggleLayer}
                      selectedGridId={selectedGridId}
                      onSelectZone={handleSelectMapZone}
                      center={studyArea ? [studyArea.latitude, studyArea.longitude] : [12.8235, 80.0440]}
                      zoom={14}
                    />
                  </ErrorBoundary>

                  {/* Clickable Zone Detail Modal */}
                  {selectedZone && (
                    <ZoneDetailModal
                      zone={selectedZone}
                      onClose={() => {
                        setSelectedGridId(null);
                        setFocusedZoneRequest(null);
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {activeTab === 'incident_summary' && (
              <IncidentDecisionSummary
                simulationData={currentSimulationData}
                optimizationResult={currentOptimizationResult}
                resourceInventory={resourceInventory}
                routes={routes}
                routeScenarios={routeScenarios}
                dataSources={methodology?.data_sources || {}}
                rainfallMode={rainfallMode}
                rainfall={rainfall}
                rainfallSource={rainfallSource}
                reliefKitsSelected={reliefKits}
                isSimulating={isSimulating || !currentSimulationData}
                isOptimizing={isOptimizing || !currentOptimizationResult}
                onSelectZone={handleOpenPriorityZone}
                onSelectResource={handleFocusResource}
                onShowRoutes={() => setActiveTab('safe_routes')}
              />
            )}

            {/* TAB 2: Exposure Analysis */}
            {activeTab === 'exposure_analysis' && (
              <ErrorBoundary>
                <ExposurePanel
                  exposure={currentExposureData}
                  isLoading={!currentExposureData && isExposureLoading}
                  hasError={exposureError}
                />
              </ErrorBoundary>
            )}

            {/* TAB 3: Resource Optimizer */}
            {activeTab === 'resource_optimizer' && (
              <ErrorBoundary>
                <ResourceOptimizer
                  onRunOptimization={handleRunOptimization}
                  optimizationResult={optimizationResult}
                  isOptimizing={isOptimizing}
                  currentRainfall={rainfall}
                  rainfallMode={rainfallMode}
                  rainfallSource={rainfallSource?.forecast}
                  ambulances={ambulances}
                  setAmbulances={setAmbulances}
                  boats={boats}
                  setBoats={setBoats}
                  shelters={shelters}
                  setShelters={setShelters}
                  reliefKits={reliefKits}
                  setReliefKits={setReliefKits}
                  onNavigateToMap={() => setActiveTab('risk_overview')}
                />
              </ErrorBoundary>
            )}

            {/* TAB 4: Safe Routes */}
            {activeTab === 'safe_routes' && (
              <ErrorBoundary>
                <SafeRoutePanel
                  routes={routes}
                  routeScenarioId={routeScenarioId}
                  routeScenarios={routeScenarios}
                  onScenarioChange={(id) => {
                    setSelectedMapRoute(null);
                    setRouteScenarioId(id);
                  }}
                  onNavigateToMap={handleInspectRoute}
                />
              </ErrorBoundary>
            )}

            {/* TAB 5: Scenario Simulator */}
            {activeTab === 'scenario_simulator' && (
              <ErrorBoundary>
                <ScenarioControls
                  rainfall={rainfall}
                  setRainfall={setRainfall}
                  setRainfallMode={setRainfallMode}
                  rainfallMode={rainfallMode}
                  activeRainfallMode={activeRainfallMode}
                  rainfallSource={rainfallSource?.forecast}
                  ambulances={ambulances}
                  setAmbulances={setAmbulances}
                  boats={boats}
                  setBoats={setBoats}
                  shelters={shelters}
                  setShelters={setShelters}
                  summaryData={simulationData}
                  onNavigateToMap={() => setActiveTab('risk_overview')}
                />
              </ErrorBoundary>
            )}
          </div>
        </div>
      </div>
      {showMethodology && <MethodologyPanel onClose={() => setShowMethodology(false)} />}
    </ErrorBoundary>
  );
}
