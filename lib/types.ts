export interface PackageType {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
}

export interface CableLength {
  id: string;
  length: number;
  price: number;
  isCustom?: boolean;
  isActive: boolean;
}

export interface ConnectorType {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
}

export interface DeviceModel {
  id: string;
  name: string;
  price: number;
  type: string; // e.g., "ONU", "ONT"
  isActive: boolean;
}

export interface MaintenanceType {
  id: string;
  name: string;
  basePrice: number;
  description: string;
  isActive: boolean;
}

export interface InvoiceSettings {
  id: string;
  teamId: string;
  lastUpdated: string;
  packageTypes: PackageType[];
  cableLengths: CableLength[];
  connectorTypes: ConnectorType[];
  deviceModels: DeviceModel[];
  maintenanceTypes: MaintenanceType[];
}

export interface InvoiceItem {
  id: string;
  type:
    | "newCustomerInstallation"
    | "maintenance"
    | "transportationFee"
    | "expenseReimbursement"
    | "subscriptionRenewal"
    | "customItem";
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  packageType?: string;
  cableLength?: number | string; // Can be number or "custom"
  connectorType?: string[];
  receiverDevice?: string; // Appears in serializedItems, might be legacy or part of deviceModel
  numHooks?: number;
  numBags?: number;
  maintenanceType?: string; // e.g., "cableReplacement", "connectorReplacement"
  deviceModel?: string;
  additionalNotes?: string;
  subscriberId?: string | null;
  isPaid?: boolean;
}

export interface Attachment {
  downloadURL: string;
  fileName: string;
  mimeType?: string;
  size?: number;
  fileUrl?: string;
  fileType?: string;
  fileSize?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  lastLogin: any;
  status: string;
  teamId?: string;
  photoURL?: string;
  createdAt?: any;
  phone?: string;
  stockItems?: UserStockItem[];
  lastClearTimes: any[]
  uid: string; // Assuming this is the Firebase UID
}



export interface Invoice {
  id: string;
  linkedServiceRequestId: string;
  createdBy: string;
  createdAt: string;
  lastUpdated: string;
  items: InvoiceItem[];
  totalAmount: number;
  status: "draft" | "pending" | "paid" | "cancelled" | "submitted" | "approved";
  notes?: string;
  customerName?: string;
  creatorName?: string;
  type: "invoice" | "newsubscriberinstall"; // Or other types if applicable
  teamId?: string | null;
  teamCreatorId?: string | null; // Assuming this might exist
  subscriberId?: string | null;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: any;
  createdAt?: any;
  isStatusChange?: boolean;
  attachments?: Attachment[];
}

export interface ServiceRequest {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  title: string;
  description: string;
  type: string; 
  status: string; 
  priority: string; 
  date: string; 
  createdAt: string; 
  lastUpdated: string;
  assignedTo?: string;
  assignedUsers?: string[];
  attachments?: string[]; 
  comments?: Comment[];
  creatorId: string;
  creatorName: string;
  subscribers?: string[];
  subscriberId?: string | null;
  invoiceIds?: string[];
  userResponses?: UserResponse[];
completionTimestamp?: any;
  onLocationTimestamp?: any;
  estimatedTime?: number;
}
export interface UserResponse {
  userId: string;
  userName: string;
  response: "accepted" | "rejected" | "completed";
  timestamp: string;
}

export interface UserStockItem {
  id: string;
  itemType:
    | "packageType"
    | "cableLength"
    | "connectorType"
    | "deviceModel"
    | "maintenanceType"
    | "hook"
    | "bag"
    | "cable"
    | string;
  itemId: string;
  itemName: string;
  quantity: number;
  lastUpdated: any;
  notes?: string;
}

export interface UserStock {
  id: string; // User's UID
  userId: string;
  userName?: string | null;
  items: UserStockItem[];
  lastUpdated: string;
}

export interface StockTransaction {
  id: string;
  userId: string;
  userName: string;
  itemType:
    | "packageType"
    | "cableLength"
    | "connectorType"
    | "deviceModel"
    | "maintenanceType"
    | "hook"
    | "bag"
    | "cable"
    | string;
  itemId: string;
  itemName: string;
  quantity: number;
  type: "addition" | "reduction" | "inventory" | "invoice";
  sourceId?: string;
  sourceName?: string;
  timestamp: any;
  notes?: string;
}