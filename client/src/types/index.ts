export type UserRole = 'admin' | 'supervisor' | 'planner' | 'operations' | 'carrier' | 'viewer';

export interface User {
  id: number;
  username: string;
  role: UserRole;
}

export interface ApprovalItem {
  id: number;
  req_number: string;
  requestor_name: string;
  department?: string;
  supplier_name?: string;
  supplier_city?: string;
  supplier_country?: string;
  shipment_type?: string;
  transport_mode?: string;
  pallets: number;
  weight_kg?: number;
  assigned_price?: number;
  pickup_date: string;
  delivery_date?: string;
  carrier?: string;
  deviations: string[];
  deviation_justification?: string;
  is_special_transport: boolean;
  approval_status?: string;
  approved_by?: string;
  approval_timestamp?: string;
  approval_notes?: string;
  status: string;
  created_at?: string;
}

export interface Contact {
  id?: number;
  supplier_id?: number;
  type: 'primary' | 'secondary' | 'escalation';
  escalation_level?: number | null;
  name: string;
  role_title?: string;
  email?: string;
  phone?: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
}

export interface Commodity {
  id: number;
  name: string;
  description?: string;
}

export interface Supplier {
  id: number;
  supplier_id: string;
  company_name: string;
  country: string;
  city: string;
  street_address?: string;
  latitude?: number;
  longitude?: number;
  default_incoterm?: string;
  status: 'active' | 'inactive' | 'on-hold';
  notes?: string;
  created_at?: string;
  updated_at?: string;
  contacts?: Contact[];
  projects?: Project[];
  commodities?: Commodity[];
  routes?: TransportRoute[];
}

export interface Waypoint {
  lat: number;
  lng: number;
  label?: string;
}

export type ShipmentType = 'ftl' | 'ltl' | 'milkrun' | 'hub';

export interface TransportRoute {
  id: number;
  name: string;
  route_description?: string;
  tour_description?: string;
  route_type: 'inbound' | 'outbound';
  transport_mode: 'sea' | 'air' | 'rail' | 'road' | 'multimodal';
  shipment_type?: ShipmentType;
  carrier_name?: string;
  transit_days?: number;
  waypoints: Waypoint[];
  suppliers?: { id: number; supplier_id: string; company_name: string; latitude?: number; longitude?: number }[];
  routePlans?: { id: number; route_description: string; transport_mode: string; direction: string }[];
  created_at?: string;
}

export const SHIPMENT_TYPE_CONFIG: Record<ShipmentType, { label: string; description: string; color: string; dash?: string }> = {
  ftl: { label: 'FTL', description: 'Full Truck Load — direct supplier → RT', color: '#3b82f6' },
  ltl: { label: 'LTL', description: 'Less Than Truck Load — shared capacity', color: '#8b5cf6', dash: '8, 4' },
  milkrun: { label: 'Milkrun', description: 'Collecting from multiple suppliers on one route', color: '#f59e0b' },
  hub: { label: 'HUB', description: 'Consolidated at a hub before continuing to RT', color: '#10b981' },
};

export interface RouteFilters {
  search?: string;
  routeDescription?: string;
  transportMode?: string[];
  routeType?: string[];
  carrier?: string[];
  supplier?: number[];
  shipmentType?: string[];
  transitDaysMin?: number;
  transitDaysMax?: number;
}

export interface SupplierFilters {
  search?: string;
  status?: string[];
  incoterm?: string[];
  project?: number[];
  commodity?: number[];
  mode?: string[];
  carrier?: string[];
  supplier?: number[];
  shipmentType?: string[];
}

// Transport Requisition types
export type RequisitionStatus = 'new' | 'pending_approval' | 'spot_requested' | 'quotes_received' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';
export type RequisitionPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ForwarderQuote {
  id?: number;
  requisition_id?: number;
  forwarder_name: string;
  price: number;
  currency: string;
  transit_days: number;
  valid_until?: string;
  notes?: string;
  selected?: boolean;
}

export interface TransportRequisition {
  id: number;
  req_number: string;
  requestor_name: string;
  department?: string;
  supplier_id: number;
  supplier_name?: string;
  supplier_city?: string;
  priority: RequisitionPriority;
  // Route-plan aligned fields
  direction: 'inbound' | 'outbound';
  shipment_type: string; // FTL, LTL, MR, HUB
  origin_id?: string;
  origin_name?: string;
  origin_zip?: string;
  origin_city?: string;
  origin_country?: string;
  destination_id?: string;
  destination_name?: string;
  destination_zip?: string;
  destination_city?: string;
  destination_country?: string;
  route_description?: string;
  pickup_date: string;
  pickup_time?: string;
  delivery_date: string;
  arrival_time?: string;
  carrier?: string;
  equipment?: string;
  transit_days?: number;
  customs?: string;
  pallets: number;
  weight_kg?: number;
  volume_m3?: number;
  transport_mode: string;
  material_description?: string;
  special_instructions?: string;
  status: RequisitionStatus;
  is_special_transport?: boolean;
  matched_route_plan_id?: number;
  assigned_forwarder?: string;
  assigned_price?: number;
  route_id?: number;
  created_at?: string;
  updated_at?: string;
  quotes?: ForwarderQuote[];
}

// KPI types
export interface KPIData {
  utilization: {
    avgFillRate: number;
    emptyTruckRatio: number;
    deadheadRatio: number;
    avgUtilization: number;
  };
  costs: {
    costPerPallet: number;
    costPerKm: number;
    costPerTruck: number;
    costPerKg: number;
  };
  network: {
    avgShipmentSize: number;
    consolidationRate: number;
    avgDistancePerShipment: number;
    transportFrequency: number;
  };
  operational: {
    onTimeDispatch: number;
    urgentShipments: number;
    modeMix: { mode: string; percentage: number }[];
  };
  advanced: {
    freightCostPctOfValue: number;
    optimizationPotentialSavings: number;
    currentFillRate: number;
    targetFillRate: number;
    truckReductionPct: number;
  };
  alerts: {
    title: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
  }[];
  topExpensiveLanes: { supplier: string; costPerPallet: number }[];
  worstUtilizationLanes: { supplier: string; fillRate: number }[];
  fillRateByRoute: { route: string; fillRate: number }[];
  costPerPalletByLane: { lane: string; cost: number }[];
  monthlyTrend: { month: string; fillRate: number }[];
}

export const INCOTERM_COLORS: Record<string, string> = {
  EXW: '#22c55e',  // green
  FOB: '#3b82f6',  // blue
  CIF: '#f97316',  // orange
  DDP: '#ef4444',  // red
  FCA: '#a855f7',  // purple
};

export function getIncotermColor(incoterm?: string): string {
  if (!incoterm) return '#6b7280'; // gray
  return INCOTERM_COLORS[incoterm] || '#6b7280';
}
