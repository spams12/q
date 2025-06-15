"use client"

import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore"; // Added doc and getDoc
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import useFirebaseAuth from "../hooks/use-firebase-auth";
import { db } from "../lib/firebase";

// Define all possible permissions as constants
export const PERMISSIONS = {
  VIEW_DASHBOARD: "view_dashboard",
  MANAGE_PRODUCTS: "manage_products",
  VIEW_PRODUCTS: "view_products",
  MANAGE_CATEGORIES: "manage_categories",
  VIEW_CATEGORIES: "view_categories",
  MANAGE_BRANDS: "manage_brands",
  VIEW_BRANDS: "view_brands",
  MANAGE_ORDERS: "manage_orders",
  VIEW_ORDERS: "view_orders",
  MANAGE_CUSTOMERS: "manage_customers",
  VIEW_CUSTOMERS: "view_customers",
  MANAGE_USERS: "manage_users",
  VIEW_USERS: "view_users",
  MANAGE_ROLES: "manage_roles",
  VIEW_ROLES: "view_roles",
  MANAGE_SETTINGS: "manage_settings",
  VIEW_SETTINGS: "view_settings",
  MANAGE_INVENTORY: "manage_inventory",
  VIEW_INVENTORY: "view_inventory",
  MANAGE_ANALYTICS: "manage_analytics",
  VIEW_ANALYTICS: "view_analytics",
  MANAGE_HERO_BANNER: "manage_hero_banner",
  VIEW_HERO_BANNER: "view_hero_banner",
  MANAGE_PROMOTIONS: "manage_promotions",
  VIEW_PROMOTIONS: "view_promotions",
  MANAGE_SHIPPING: "manage_shipping",
  VIEW_SHIPPING: "view_shipping",
  MANAGE_SERVICE_REQUESTS: "manage_service_requests",
  VIEW_SERVICE_REQUESTS: "view_service_requests",
  MANAGE_TICKETS: "manage_tickets",
  VIEW_TICKETS: "view_tickets",
  MANAGE_ASSIGNED_TICKETS: "manage_assigned_tickets",
  VIEW_ASSIGNED_TICKETS: "view_assigned_tickets",
  CREATE_SERVICE_REQUEST: "create_service_request",
  VIEW_TECH_SERVICE_REQUEST: "view_tech_service_request",
  MANAGE_INVOICES: "manage_invoices",
  VIEW_INVOICES: "view_invoices",
  MANAGE_INVOICE_SETTINGS: "manage_invoice_settings",
  VIEW_INVOICE_SETTINGS: "view_invoice_settings",
  VIEW_TECHNICIAN_STATS: "view_technician_stats",
  IS_ADMIN: "is_admin",
  VIEW_USER_INVENTORY: "view_user_inventory",
  ASSIGN_TICKETS : "ticket_assigner",
  MANAGE_TEAMS: "manage_teams", // New permission for managing teams
}

// Define all possible routes and the permissions required
export const ROUTE_PERMISSIONS = {
  "/dashboard": [PERMISSIONS.VIEW_DASHBOARD],
  "/dashboard/products": [PERMISSIONS.VIEW_PRODUCTS],
  "/dashboard/categories": [PERMISSIONS.VIEW_CATEGORIES],
  "/dashboard/brands": [PERMISSIONS.VIEW_BRANDS],
  "/dashboard/orders": [PERMISSIONS.VIEW_ORDERS],
  "/dashboard/customers": [PERMISSIONS.VIEW_CUSTOMERS],
  "/dashboard/users": [PERMISSIONS.VIEW_USERS],
  "/dashboard/roles": [PERMISSIONS.VIEW_ROLES],
  "/dashboard/inventory": [PERMISSIONS.VIEW_INVENTORY],
  "/dashboard/analytics": [PERMISSIONS.VIEW_ANALYTICS],
  "/dashboard/hero-banner": [PERMISSIONS.VIEW_HERO_BANNER],
  "/dashboard/promotions": [PERMISSIONS.VIEW_PROMOTIONS],
  "/dashboard/shipping": [PERMISSIONS.VIEW_SHIPPING],
  "/dashboard/service-requests": [PERMISSIONS.VIEW_SERVICE_REQUESTS],
  "/dashboard/ticket-management": [PERMISSIONS.VIEW_TICKETS],
  "/dashboard/assigned-tickets": [PERMISSIONS.VIEW_ASSIGNED_TICKETS],
  "/dashboard/technician-stats": [PERMISSIONS.VIEW_TECHNICIAN_STATS],
  "/dashboard/tech-service-request": [PERMISSIONS.VIEW_TECH_SERVICE_REQUEST, PERMISSIONS.CREATE_SERVICE_REQUEST],
  "/dashboard/invoice-settings": [PERMISSIONS.VIEW_INVOICE_SETTINGS, PERMISSIONS.MANAGE_INVOICE_SETTINGS],
  "/dashboard/invoices": [PERMISSIONS.VIEW_INVOICES, PERMISSIONS.MANAGE_INVOICES],
  "/about": [], // No specific permissions required
  "/dashboard/user-stock": [PERMISSIONS.VIEW_USER_INVENTORY],
  "/dashboard/teams": [PERMISSIONS.MANAGE_TEAMS], // Route for team management
}

// Map permission names from Firestore (camelCase) to our constants (snake_case)
const PERMISSION_MAP: Record<string, string> = {
  // View permissions
  "viewDashboard": PERMISSIONS.VIEW_DASHBOARD,
  "viewProducts": PERMISSIONS.VIEW_PRODUCTS,
  "viewCategories": PERMISSIONS.VIEW_CATEGORIES,
  "viewBrands": PERMISSIONS.VIEW_BRANDS,
  "viewOrders": PERMISSIONS.VIEW_ORDERS,
  "viewCustomers": PERMISSIONS.VIEW_CUSTOMERS,
  "viewUsers": PERMISSIONS.VIEW_USERS,
  "viewRoles": PERMISSIONS.VIEW_ROLES,
  "viewInventory": PERMISSIONS.VIEW_INVENTORY,
  "viewAnalytics": PERMISSIONS.VIEW_ANALYTICS,
  "viewHeroBanner": PERMISSIONS.VIEW_HERO_BANNER,
  "viewPromotions": PERMISSIONS.VIEW_PROMOTIONS,
  "viewShipping": PERMISSIONS.VIEW_SHIPPING,
  "viewServiceRequests": PERMISSIONS.VIEW_SERVICE_REQUESTS,
  "viewTickets": PERMISSIONS.VIEW_TICKETS,
  "viewAssignedTickets": PERMISSIONS.VIEW_ASSIGNED_TICKETS,
  "viewTechServiceRequest": PERMISSIONS.VIEW_TECH_SERVICE_REQUEST,
  "viewInvoices": PERMISSIONS.VIEW_INVOICES,
  "viewInvoiceSettings": PERMISSIONS.VIEW_INVOICE_SETTINGS,
  "viewTechnicianStats": PERMISSIONS.VIEW_TECHNICIAN_STATS,
  "viewSettings": PERMISSIONS.VIEW_SETTINGS,
  "viewUserInventory": PERMISSIONS.VIEW_USER_INVENTORY,
  "ticket_assigner": PERMISSIONS.ASSIGN_TICKETS,
  // Manage permissions
  "manageProducts": PERMISSIONS.MANAGE_PRODUCTS,
  "manageCategories": PERMISSIONS.MANAGE_CATEGORIES,
  "manageBrands": PERMISSIONS.MANAGE_BRANDS,
  "manageOrders": PERMISSIONS.MANAGE_ORDERS,
  "manageCustomers": PERMISSIONS.MANAGE_CUSTOMERS,
  "manageUsers": PERMISSIONS.MANAGE_USERS,
  "manageRoles": PERMISSIONS.MANAGE_ROLES,
  "manageInventory": PERMISSIONS.MANAGE_INVENTORY,
  "manageAnalytics": PERMISSIONS.MANAGE_ANALYTICS,
  "manageHeroBanner": PERMISSIONS.MANAGE_HERO_BANNER,
  "managePromotions": PERMISSIONS.MANAGE_PROMOTIONS,
  "manageShipping": PERMISSIONS.MANAGE_SHIPPING,
  "manageServiceRequests": PERMISSIONS.MANAGE_SERVICE_REQUESTS,
  "manageTickets": PERMISSIONS.MANAGE_TICKETS,
  "manageAssignedTickets": PERMISSIONS.MANAGE_ASSIGNED_TICKETS,
  "manageInvoices": PERMISSIONS.MANAGE_INVOICES,
  "manageInvoiceSettings": PERMISSIONS.MANAGE_INVOICE_SETTINGS,
  "manageSettings": PERMISSIONS.MANAGE_SETTINGS,
  
  // Special permissions
  "createServiceRequest": PERMISSIONS.CREATE_SERVICE_REQUEST,
  "isAdmin": PERMISSIONS.IS_ADMIN,
  "manageTeams": PERMISSIONS.MANAGE_TEAMS, // Mapping for Firestore
};

interface PermissionsContextType {
  userPermissions: string[];
  isAdmin: boolean;
  hasPermission: (permission: string) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  canAccessRoute: (route: string) => boolean;
  loading: boolean;
  customPermissions: Record<string, boolean>;
  userName: string | null; // New field for user's name
  userUid: string | null;  // New field for user's UID
  currentUserTeamId: string | null; // New field for current user's team ID
  isCurrentUserTeamLeader: boolean; // New field to check if current user is team leader
}

const PermissionsContext = createContext<PermissionsContextType>({
  userPermissions: [],
  isAdmin: false,
  hasPermission: () => false,
  hasAllPermissions: () => false,
  hasAnyPermission: () => false,
  canAccessRoute: () => false,
  loading: true,
  customPermissions: {},
  userName: null, // Default value for userName
  userUid: null,  // Default value for userUid
  currentUserTeamId: null, // Default value for currentUserTeamId
  isCurrentUserTeamLeader: false, // Default value for isCurrentUserTeamLeader
});

export const usePermissions = () => useContext(PermissionsContext);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useFirebaseAuth();
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState<string | null>(null); // State for user's name
  const [userUid, setUserUid] = useState<string | null>(null);   // State for user's UID
  const [currentUserTeamId, setCurrentUserTeamId] = useState<string | null>(null); // State for current user's team ID
  const [isCurrentUserTeamLeader, setIsCurrentUserTeamLeader] = useState<boolean>(false); // State for team leader status

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      setUserPermissions([]);
      setCustomPermissions({});
      setIsAdmin(false);
      setUserName(null);
      setUserUid(null);
      setCurrentUserTeamId(null);
      setIsCurrentUserTeamLeader(false);
      return; 
    }

    const fetchUserPermissionsAndInfo = async () => {
      // If auth is done loading and there's no user (logged out)
      if (!user) {
        setLoading(false);
        setUserPermissions([]);
        setCustomPermissions({});
        setIsAdmin(false);
        setUserName(null);
        setUserUid(null);
        setCurrentUserTeamId(null);
        setIsCurrentUserTeamLeader(false);
        return; // Exit if no user
      }

      // User is authenticated, start fetching their data
      setLoading(true);
      
      try {
        // Query user document by email (as per original logic)
        // Consider querying by UID if your Firestore 'users' collection uses UIDs as document IDs
        // or if 'uid' is a reliably indexed field: e.g., where("uid", "==", user.uid)
        const q = query(
          collection(db, "users"),
          where("email", "==", user.email),
          limit(1)
        );
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const userDocSnapshot = querySnapshot.docs[0];
          const userDocData = userDocSnapshot.data();
          // Set user name: from 'name' field in Firestore, fallback to Firebase Auth display name
          setUserName((userDocData.name as string) || user.displayName || null);
          
          setUserUid(userDocSnapshot.id || user.uid);
          
          // Fetch and set team information
          const teamId = userDocData.teamId as string | null;
          setCurrentUserTeamId(teamId);

          if (teamId) {
            try {
              const teamDocRef = doc(db, "teams", teamId);
              const teamDocSnap = await getDoc(teamDocRef);
              if (teamDocSnap.exists()) {
                const teamData = teamDocSnap.data();
                setIsCurrentUserTeamLeader(teamData.leaderId === (userDocData.uid as string || user.uid));
              } else {
                console.warn(`Team document with ID ${teamId} not found.`);
                setIsCurrentUserTeamLeader(false);
              }
            } catch (teamError) {
              console.error("Error fetching team document:", teamError);
              setIsCurrentUserTeamLeader(false);
            }
          } else {
            setIsCurrentUserTeamLeader(false);
          }

          let permissions: string[] = [];
          const userCustomPermissions: Record<string, boolean> = {};
          
          const admin = userDocData.permissions?.isAdmin === true || userDocData.isAdmin === true || userDocData.role === "مدير";
          setIsAdmin(admin);
          
          if (admin) {
            permissions = Object.values(PERMISSIONS);
            Object.keys(PERMISSION_MAP).forEach(key => {
              userCustomPermissions[key] = true;
            });
            userCustomPermissions.isAdmin = true; // Assuming 'isAdmin' might be a permission key
          } else if (userDocData.permissions) {
            for (const [key, value] of Object.entries(userDocData.permissions)) {
              if (value === true) {
                const permissionValue = PERMISSION_MAP[key];
                if (permissionValue) {
                  permissions.push(permissionValue);
                  userCustomPermissions[key] = true; // Store Firestore key (camelCase)
                } else {
                  console.warn(`Unknown permission key from Firestore: ${key}`);
                }
              }
            }
          }
          
          setUserPermissions(permissions);
          setCustomPermissions(userCustomPermissions);
        } else {
          // No user document found in Firestore
          console.warn(`No user document found in Firestore for email: ${user.email}`);
          setUserPermissions([]);
          setCustomPermissions({});
          setIsAdmin(false);
          setCurrentUserTeamId(null);
          setIsCurrentUserTeamLeader(false);
          // Fallback to Firebase Auth info if Firestore document is missing
          setUserName(user.displayName || null);
          setUserUid(user.uid); // Use canonical UID from Firebase Auth
        }
      } catch (error) {
        console.error("Error fetching user permissions and info:", error);
        setUserPermissions([]);
        setCustomPermissions({});
        setIsAdmin(false);
        setCurrentUserTeamId(null);
        setIsCurrentUserTeamLeader(false);
        // Attempt to set name/UID from auth user even on error, if user object is available
        setUserName(user?.displayName || null);
        setUserUid(user?.uid || null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserPermissionsAndInfo();
  }, [user, authLoading]); // Dependencies: re-run if user object or authLoading state changes

  const hasPermission = (permission: string) => {
    if (loading || authLoading) return false; // Wait for loading to complete
    if (isAdmin) return true;
    return userPermissions.includes(permission);
  };

  const hasAllPermissions = (permissions: string[]) => {
    if (loading || authLoading) return false;
    if (isAdmin) return true;
    return permissions.every(p => userPermissions.includes(p));
  };

  const hasAnyPermission = (permissions: string[]) => {
    if (loading || authLoading) return false;
    if (isAdmin) return true;
    return permissions.some(p => userPermissions.includes(p));
  };

  const canAccessRoute = (route: string) => {
    if (route === "/dashboard/profile") {
      return true; // Always allow profile access
    }
    if (loading || authLoading) return false; // Deny access while loading permissions
    if (isAdmin) return true; // Admin can access all routes
    
    const requiredPermissions = ROUTE_PERMISSIONS[route as keyof typeof ROUTE_PERMISSIONS];
    if (!requiredPermissions) { // Route not in defined list, default to accessible
        // console.warn(`Route ${route} not found in ROUTE_PERMISSIONS. Allowing access by default.`);
        return true; 
    }
    if (requiredPermissions.length === 0) { // Explicitly no permissions required
        return true;
    }
    return hasAnyPermission(requiredPermissions);
  };

  return (
    <PermissionsContext.Provider
      value={{
        userPermissions,
        isAdmin,
        hasPermission,
        hasAllPermissions,
        hasAnyPermission,
        canAccessRoute,
        loading,
        customPermissions,
        userName, // Provide userName
        userUid,
        currentUserTeamId, // Provide currentUserTeamId
        isCurrentUserTeamLeader, // Provide isCurrentUserTeamLeader
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}