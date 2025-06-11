import { Timestamp } from "firebase/firestore";

export interface ServiceRequest {
  id: string
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone: string
address?: string
  title: string
  description: string
  type: string
  status: string
  priority: string
  date: Timestamp | string
  createdAt?: Timestamp | string
  lastUpdated: Timestamp | string
  assignedTo?: string
  assignedUsers?: string[]
  attachments?: string[]
  notes?: string
  comments?: Comment[]
  creatorId?: string
  creatorName?: string
  location?: {
    lat: number
    lng: number
  }
  newInstallImages?: string[]
  invoiceIds?: string[]
  userResponses?: UserResponse[]
  subscribers?: Subscriber[]
  senttouser?: boolean;
  onLocation?: boolean;
  onLocationTimestamp?: Timestamp | null;
  completionTimestamp?: Timestamp | null;
  estimatedTime?: number;
  subscriberId?: string | null
}

export interface UserResponse {
  userId: string
  userName: string
  response: "accepted" | "rejected" | "pending" | "completed"
  timestamp: Timestamp | string
}

export interface Comment {
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: Timestamp | string;
}

export interface Subscriber {
    id: string;
    name: string;
    email: string;
}