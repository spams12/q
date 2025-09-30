import { User } from "@/lib/types"; // Assuming this type definition is still valid
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import useFirebaseAuth from "../hooks/use-firebase-auth"; // Assuming this hook is adapted for react-native-firebase/auth

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
  ASSIGN_TICKETS: "ticket_assigner",
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
  userName: string | null;
  userUid: string | null;
  currentUserTeamId: string | null;
  isCurrentUserTeamLeader: boolean;
  userdoc: User | null;
  refreshUser: () => Promise<void>;
  setUserdoc: (user: User | null) => void;
  realuserUid: string | null;
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
  userName: null,
  userUid: null,
  currentUserTeamId: null,
  isCurrentUserTeamLeader: false,
  userdoc: null,
  refreshUser: async () => { },
  setUserdoc: () => { },
  realuserUid: null,
});

export const usePermissions = () => useContext(PermissionsContext);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useFirebaseAuth();
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userUid, setUserUid] = useState<string | null>(null);
  const [currentUserTeamId, setCurrentUserTeamId] = useState<string | null>(null);
  const [isCurrentUserTeamLeader, setIsCurrentUserTeamLeader] = useState<boolean>(false);
  const [userdoc, setUserDoc] = useState<User | null>(null);
  const [realuserUid, setrealuserUid] = useState<string | null>(null);
  const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null); // ✨ Added unsubscribe function

  const fetchUserPermissionsAndInfo = async () => {
    if (!user) {
      setLoading(false);
      setUserPermissions([]);
      setCustomPermissions({});
      setIsAdmin(false);
      setUserName(null);
      setUserUid(null);
      setCurrentUserTeamId(null);
      setIsCurrentUserTeamLeader(false);
      return;
    }

    setLoading(true);

    try {
      // MODIFIED: Switched to react-native-firebase query syntax
      const querySnapshot = await firestore()
        .collection('users')
        .where('email', '==', user.email)
        .limit(1)
        .get();

      if (!querySnapshot.empty) {
        const userDocSnapshot = querySnapshot.docs[0];
        const userDocData = userDocSnapshot.data();
        const docId = userDocSnapshot.id;
        setUserName((userDocData.name as string) || user.displayName || null);
        setUserDoc({ ...userDocData, id: docId } as User);
        setUserUid(docId || user.uid);
        setrealuserUid(user.uid);

        const teamId = userDocData.teamId as string | null;
        setCurrentUserTeamId(teamId);

        if (teamId) {
          try {
            // MODIFIED: Switched to react-native-firebase doc fetching
            const teamDocRef = firestore().collection('teams').doc(teamId);
            const teamDocSnap = await teamDocRef.get();

            // MODIFIED: Changed .exists() to .exists
            if (teamDocSnap.exists) {
              const teamData = teamDocSnap.data();
              if (teamData) {
                setIsCurrentUserTeamLeader(teamData.leaderId === (userDocData.uid as string || user.uid));
              } else {
                setIsCurrentUserTeamLeader(false);
              }
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
          userCustomPermissions.isAdmin = true;
        } else if (userDocData.permissions) {
          for (const [key, value] of Object.entries(userDocData.permissions)) {
            if (value === true) {
              const permissionValue = PERMISSION_MAP[key];
              if (permissionValue) {
                permissions.push(permissionValue);
                userCustomPermissions[key] = true;
              } else {
                console.warn(`Unknown permission key from Firestore: ${key}`);
              }
            }
          }
        }

        setUserPermissions(permissions);
        setCustomPermissions(userCustomPermissions);
      } else {
        console.warn(`No user document found in Firestore for email: ${user.email}`);
        setUserPermissions([]);
        setCustomPermissions({});
        setIsAdmin(false);
        setCurrentUserTeamId(null);
        setIsCurrentUserTeamLeader(false);
        setUserName(user.displayName || null);
        setUserUid(user.uid);
      }
    } catch (error) {
      console.error("Error fetching user permissions and info:", error);
      setUserPermissions([]);
      setCustomPermissions({});
      setIsAdmin(false);
      setCurrentUserTeamId(null);
      setIsCurrentUserTeamLeader(false);
      setUserName(user?.displayName || null);
      setUserUid(user?.uid || null);
    } finally {
      setLoading(false);
    }
  };

  // ✨ Added real-time listener for user document
  const subscribeToUserDocument = () => {
    if (!user) {
      return null;
    }

    const unsubscribeListener = firestore()
      .collection('users')
      .where('email', '==', user.email)
      .limit(1)
      .onSnapshot(
        (querySnapshot) => {
          if (!querySnapshot.empty) {
            const userDocSnapshot = querySnapshot.docs[0];
            const userDocData = userDocSnapshot.data();
            const docId = userDocSnapshot.id;

            // Check if user is inactive and sign them out
            if (userDocData.status === "غير نشط") {
              auth().signOut();
              return;
            }

            setUserName((userDocData.name as string) || user.displayName || null);
            setUserDoc({ ...userDocData, id: docId } as User);

            // Update other state variables as needed
            setUserUid(docId || user.uid);
            setrealuserUid(user.uid);

            const teamId = userDocData.teamId as string | null;
            setCurrentUserTeamId(teamId);
          }
        },
        (error) => {
          console.error("Error subscribing to user document:", error);
        }
      );

    return unsubscribeListener;
  };

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

    // Clean up previous subscription
    if (unsubscribe) {
      unsubscribe();
      setUnsubscribe(null);
    }

    fetchUserPermissionsAndInfo();

    // Set up real-time listener
    const newUnsubscribe = subscribeToUserDocument();
    if (newUnsubscribe) {
      setUnsubscribe(() => newUnsubscribe);
    }
  }, [user, authLoading]);

  const refreshUser = async () => {
    try {
      await fetchUserPermissionsAndInfo();
    } catch (error) {
      console.error("Error refreshing user data:", error);
      // Re-throw the error so it can be handled by the caller
      throw error;
    }
  };

  const hasPermission = (permission: string) => {
    if (loading || authLoading) return false;
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
      return true;
    }
    if (loading || authLoading) return false;
    if (isAdmin) return true;

    const requiredPermissions = ROUTE_PERMISSIONS[route as keyof typeof ROUTE_PERMISSIONS];
    if (!requiredPermissions) {
      return true;
    }
    if (requiredPermissions.length === 0) {
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
        userName,
        userUid,
        currentUserTeamId,
        isCurrentUserTeamLeader,
        userdoc,
        refreshUser,
        setUserdoc: setUserDoc,
        realuserUid,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}