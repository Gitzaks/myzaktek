export type UserRole = "customer" | "dealer" | "regional" | "admin";

export interface IUser {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  dealerId?: string;
  regionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDealer {
  _id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  regionId?: string;
  coordinates?: { lat: number; lng: number };
  active: boolean;
  createdAt: Date;
}

export interface IVehicle {
  _id: string;
  customerId: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  color: string;
  dealerId: string;
  purchaseDate: Date;
  coverageType: "exterior" | "interior" | "both";
  warrantyExpiresAt: Date;
  createdAt: Date;
}

export interface IServiceRecord {
  _id: string;
  vehicleId: string;
  customerId: string;
  dealerId: string;
  type: "exterior" | "interior" | "both";
  status: "scheduled" | "completed" | "cancelled" | "missed";
  scheduledDate: Date;
  completedDate?: Date;
  notes?: string;
  technicianName?: string;
  createdAt: Date;
}

export interface IReport {
  _id: string;
  dealerId: string;
  type: "monthly" | "quarterly" | "annual";
  period: string;
  totalServices: number;
  completedServices: number;
  missedServices: number;
  newCustomers: number;
  revenue: number;
  generatedAt: Date;
}
