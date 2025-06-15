import { Feather } from "@expo/vector-icons"; // Using Feather icons
import { Picker } from "@react-native-picker/picker";
import Checkbox from "expo-checkbox";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable, // Changed from TouchableOpacity
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Toast from "react-native-toast-message";
import { v4 as uuidv4 } from "uuid";

import { usePermissions } from "@/context/PermissionsContext";
import useFirebaseAuth from "@/hooks/use-firebase-auth";
import { db } from "@/lib/firebase";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

interface PackageType {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
}

interface CableLength {
  id: string;
  length: number;
  price: number;
  isCustom?: boolean;
  isActive: boolean;
}

interface ConnectorType {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
}

interface DeviceModel {
  id: string;
  name: string;
  price: number;
  type: string; // e.g., "ONU", "ONT"
  isActive: boolean;
}

interface MaintenanceType {
  id: string;
  name: string;
  basePrice: number;
  description: string;
  isActive: boolean;
}

interface InvoiceSettings {
  id: string;
  teamId: string;
  lastUpdated: string;
  packageTypes: PackageType[];
  cableLengths: CableLength[];
  connectorTypes: ConnectorType[];
  deviceModels: DeviceModel[];
  maintenanceTypes: MaintenanceType[];
}

interface InvoiceItem {
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

interface Invoice {
  id: string;
  linkedServiceRequestId: string;
  createdBy: string;
  createdAt: string;
  lastUpdated: string;
  items: InvoiceItem[];
  totalAmount: number;
  status: "draft" | "pending" | "paid" | "cancelled";
  notes?: string;
  customerName?: string;
  creatorName?: string;
  type: "invoice"; // Or other types if applicable
  teamId?: string | null;
  teamCreatorId?: string | null; // Assuming this might exist
  subscriberId?: string | null;
}

interface Comment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
}

interface ServiceRequest {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  title: string;
  description: string;
  type: string; // e.g., "مشكلة", "طلب جديد"
  status: string; // e.g., "مفتوح", "قيد المعالجة", "مغلق"
  priority: string; // e.g., "عالية", "متوسطة", "منخفضة"
  date: string; // Original date, might be ISO string
  createdAt: string; // Firestore timestamp or ISO string
  lastUpdated: string; // Firestore timestamp or ISO string
  assignedTo?: string;
  assignedUsers?: string[];
  attachments?: string[]; // URLs or identifiers
  comments?: Comment[];
  creatorId: string;
  creatorName: string;
  subscribers?: string[]; // IDs of users subscribed to this request
  subscriberId?: string | null;
  invoiceIds?: string[];
}

interface UserStockItem {
  id: string; // Unique ID for this stock item entry
  itemType:
    | "connectorType"
    | "deviceModel"
    | "cable"
    | "hook"
    | "bag"
    | "maintenanceType"
    | string; // Type of item from settings or general
  itemId: string; // ID from InvoiceSettings (e.g., connectorType.id, deviceModel.id) or a generic ID
  itemName: string;
  quantity: number;
  lastUpdated: string;
}

interface UserStock {
  id: string; // User's UID
  userId: string;
  userName?: string | null;
  items: UserStockItem[];
  lastUpdated: string;
}

interface StockTransaction {
  id: string;
  userId: string;
  userName: string;
  itemType:
    | "connectorType"
    | "deviceModel"
    | "cable"
    | "hook"
    | "bag"
    | "maintenanceType"
    | string;
  itemId: string;
  itemName: string;
  quantity: number; // Amount transacted (positive for addition, negative for reduction but here it's absolute)
  type: "invoice" | "adjustment" | "initial" | "transfer";
  sourceId?: string; // e.g., invoice ID, adjustment ID
  sourceName?: string;
  timestamp: string;
  notes?: string;
}
// --- END TYPE DEFINITIONS ---

interface InvoiceFormProps {
  ticketId: string;
  subscriberId?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

function InvoiceForm({
  ticketId,
  subscriberId,
  onCancel,
  onSuccess,
}: InvoiceFormProps) {
  const { user } = useFirebaseAuth();
  const { userName: currentUserDisplayName, currentUserTeamId } =
    usePermissions();

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [currentItem, setCurrentItem] = useState<Partial<InvoiceItem>>({
    type: "maintenance",
    description: "",
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    connectorType: [],
    maintenanceType: undefined,
  });

  const [invoiceSettings, setInvoiceSettings] =
    useState<InvoiceSettings | null>(null);
  const [serviceRequest, setServiceRequest] = useState<ServiceRequest | null>(
    null
  );
  const [customerName, setCustomerName] = useState<string>("");
  const [ticketCollectionName, setTicketCollectionName] =
    useState<string>("serviceRequests");

  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingServiceRequest, setLoadingServiceRequest] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [showItemForm, setShowItemForm] = useState(false);

  const [customCableLength, setCustomCableLength] = useState("");
  const [userStock, setUserStock] = useState<UserStock | null>(null);
  const [loadingUserStock, setLoadingUserStock] = useState(false);

  const [stockCheckFailed, setStockCheckFailed] = useState(false);
  const [missingItems, setMissingItems] = useState<
    { type: string; name: string; required: number; available: number }[]
  >([]);

  // Default settings logic remains unchanged
  const defaultInvoiceSettings = useMemo(
    (): InvoiceSettings => ({
      id: "invoice-settings-default",
      teamId: currentUserTeamId || "default_team",
      lastUpdated: new Date().toISOString(),
      packageTypes: [
        { id: "pkg1", name: "National Fiber 35", price: 35000, isActive: true },
        { id: "pkg2", name: "National Fiber 50", price: 45000, isActive: true },
      ],
      cableLengths: [
        { id: "cl1", length: 30, price: 10000, isActive: true },
        { id: "cl2", length: 50, price: 10000, isActive: true },
        { id: "cl14", length: 0, price: 16000, isCustom: true, isActive: true },
      ],
      connectorTypes: [
        { id: "ct1", name: "Green", price: 3000, isActive: true },
        { id: "ct2", name: "Blue", price: 3000, isActive: true },
      ],
      deviceModels: [
        {
          id: "dm1",
          name: "ONU Model A",
          price: 15000,
          type: "ONU",
          isActive: true,
        },
        {
          id: "dm3",
          name: "ONT Model C",
          price: 25000,
          type: "ONT",
          isActive: true,
        },
      ],
      maintenanceTypes: [
        {
          id: "cableReplacement",
          name: "استبدال كيبل",
          basePrice: 10000,
          description: "استبدال كيبل المشترك",
          isActive: true,
        },
        {
          id: "connectorReplacement",
          name: "استبدال كونيكتر",
          basePrice: 0,
          description: "استبدال كونيكتر المشترك",
          isActive: true,
        },
        {
          id: "deviceReplacement",
          name: "استبدال جهاز",
          basePrice: 0,
          description: "استبدال جهاز استقبال",
          isActive: true,
        },
        {
          id: "customMaintenance",
          name: "صيانة أخرى",
          basePrice: 0,
          description: "صيانة أخرى حسب الطلب",
          isActive: true,
        },
      ],
    }),
    [currentUserTeamId]
  );

  // useEffects for data fetching and setup remain largely unchanged
  useEffect(() => {
    async function fetchServiceRequest() {
      if (!db) {
        console.error("Firestore db instance is not available.");
        setLoadingServiceRequest(false);
        return;
      }
      try {
        setLoadingServiceRequest(true);
        const serviceRequestRef = doc(db, "serviceRequests", ticketId);
        let serviceRequestSnap = await getDoc(serviceRequestRef);

        let collectionName = "serviceRequests";
        if (!serviceRequestSnap.exists()) {
          const newServiceRequestRef = doc(db, "newserviceRequests", ticketId);
          serviceRequestSnap = await getDoc(newServiceRequestRef);
          if (serviceRequestSnap.exists()) {
            collectionName = "newserviceRequests";
          }
        }
        setTicketCollectionName(collectionName);

        if (serviceRequestSnap.exists()) {
          const data = serviceRequestSnap.data() as ServiceRequest;
          const request: ServiceRequest = {
            id: data.id || ticketId,
            customerId: data.customerId || "",
            customerName: data.customerName || "",
            title: data.title || "",
            description: data.description || "",
            type: data.type || "مشكلة",
            status: data.status || "مفتوح",
            priority: data.priority || "متوسطة",
            date: data.date || data.createdAt || "",
            createdAt: data.createdAt,
            lastUpdated:
              data.lastUpdated || data.date || data.createdAt || "",
            creatorId: data.creatorId || "",
            creatorName: data.creatorName || "",
            subscriberId: data.subscriberId || null,
          };

          setServiceRequest(request);
          setCustomerName(request.customerName);
          if (request.customerName && !notes) {
            setNotes(request.customerName);
          }
        }
      } catch (error) {
        console.error("Error fetching service request:", error);
        Toast.show({ type: "error", text1: "Error fetching service request" });
      } finally {
        setLoadingServiceRequest(false);
      }
    }

    async function fetchSettings() {
      if (!db) {
        console.error("Firestore db instance is not available for settings.");
        setInvoiceSettings(defaultInvoiceSettings);
        setLoadingSettings(false);
        return;
      }
      try {
        setLoadingSettings(true);
        const settingsQuery = query(
          collection(db, "invoice-settings"),
          where("teamId", "==", currentUserTeamId)
        );
        const settingsSnap = await getDocs(settingsQuery);

        if (!settingsSnap.empty) {
          const settingsDoc = settingsSnap.docs[0];
          setInvoiceSettings(settingsDoc.data() as InvoiceSettings);
        } else {
          setInvoiceSettings(defaultInvoiceSettings);
        }
      } catch (error) {
        console.error("Error fetching invoice settings:", error);
        setInvoiceSettings(defaultInvoiceSettings);
        Toast.show({ type: "error", text1: "Error fetching settings" });
      } finally {
        setLoadingSettings(false);
      }
    }

    fetchServiceRequest();
    fetchSettings();
  }, [ticketId, currentUserTeamId, defaultInvoiceSettings, notes]);

  useEffect(() => {
    if (
      currentItem.type === "maintenance" &&
      currentItem.maintenanceType === undefined &&
      currentItem.description === "" &&
      !loadingSettings &&
      invoiceSettings &&
      invoiceSettings.maintenanceTypes.length > 0
    ) {
      const defaultMaintenanceId = "cableReplacement";
      const maintenanceTypeSetting = invoiceSettings.maintenanceTypes.find(
        (mt) => mt.id === defaultMaintenanceId
      );
      if (maintenanceTypeSetting) {
        setCurrentItem((prev) => ({
          ...prev,
          maintenanceType: defaultMaintenanceId,
          description: "صيانة مشترك",
          unitPrice: maintenanceTypeSetting.basePrice,
          totalPrice: maintenanceTypeSetting.basePrice * (prev.quantity || 1),
        }));
      }
    }
  }, [
    loadingSettings,
    invoiceSettings,
    currentItem.type,
    currentItem.description,
    currentItem.maintenanceType,
  ]);

  const resetItemForm = useCallback(() => {
    let initialItemState: Partial<InvoiceItem> = {
      type: "maintenance",
      description: "",
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      connectorType: [],
      maintenanceType: undefined,
    };

    if (invoiceSettings) {
      const defaultMaintenanceId = "cableReplacement";
      const maintenanceTypeSetting = invoiceSettings.maintenanceTypes.find(
        (mt) => mt.id === defaultMaintenanceId
      );
      if (maintenanceTypeSetting) {
        initialItemState = {
          ...initialItemState,
          description: "صيانة مشترك",
          maintenanceType: defaultMaintenanceId,
          unitPrice: maintenanceTypeSetting.basePrice,
          totalPrice:
            maintenanceTypeSetting.basePrice * (initialItemState.quantity || 1),
        };
      }
    }
    setCurrentItem(initialItemState);
    setCustomCableLength("");
  }, [invoiceSettings]);

  const handleCustomCableLengthInputChange = (inputValue: string) => {
    if (!invoiceSettings) return;
    if (currentItem.type === "newCustomerInstallation") {
      setCustomCableLength(inputValue);
      setCurrentItem({
        ...currentItem,
        cableLength: "custom",
      });
      return;
    }
    let price = 0;
    const customCableSetting = invoiceSettings.cableLengths.find(
      (cl) => cl.isCustom
    );
    if (customCableSetting) {
      price = customCableSetting.price;
    }
    setCustomCableLength(inputValue);
    setCurrentItem({
      ...currentItem,
      cableLength: "custom",
      unitPrice: price,
      totalPrice: price * (currentItem.quantity || 1),
    });
  };

  const handleItemTypeChange = (value: InvoiceItem["type"]) => {
    if (!invoiceSettings) return;
    let newDescription = "";
    let newUnitPrice = 0;
    let newMaintenanceType: string | undefined = undefined;

    switch (value) {
      case "newCustomerInstallation":
        newDescription = "تنصيب مشترك جديد";
        break;
      case "maintenance":
        newDescription = "صيانة مشترك";
        const defaultMaintenanceId = "cableReplacement";
        const maintenanceTypeSetting = invoiceSettings.maintenanceTypes.find(
          (mt) => mt.id === defaultMaintenanceId
        );
        if (maintenanceTypeSetting) {
          newMaintenanceType = defaultMaintenanceId;
          newUnitPrice = maintenanceTypeSetting.basePrice;
        }
        break;
      case "transportationFee":
        newDescription = "نقليات";
        break;
      case "expenseReimbursement":
        newDescription = "صرفيات";
        break;
      case "customItem":
        newDescription = "";
        break;
      case "subscriptionRenewal":
        newDescription = "تجديد اشتراك";
        break;
    }

    setCustomCableLength("");

    setCurrentItem((prev) => ({
      ...prev,
      type: value,
      description: newDescription,
      unitPrice: newUnitPrice,
      totalPrice: newUnitPrice * (prev.quantity || 1),
      maintenanceType: newMaintenanceType,
      packageType:
        value === "newCustomerInstallation" || value === "subscriptionRenewal"
          ? prev.packageType
          : undefined,
      cableLength: undefined,
      deviceModel: undefined,
      connectorType: [],
    }));
  };

  const handlePackageTypeChange = (value: string) => {
    if (!invoiceSettings) return;
    const packageType = invoiceSettings.packageTypes.find(
      (pt) => pt.name === value
    );
    let price = packageType?.price || 0;
    let finalDescription = currentItem.description;

    if (currentItem.type === "subscriptionRenewal" && packageType) {
      finalDescription = `تجديد اشتراك - ${packageType.name}`;
    }

    setCurrentItem({
      ...currentItem,
      packageType: value,
      unitPrice: price,
      totalPrice: price * (currentItem.quantity || 1),
      description: finalDescription,
    });
  };

  const handleCableLengthChange = (value: string) => {
    if (!invoiceSettings) return;
    if (currentItem.type === "newCustomerInstallation") {
      setCurrentItem({ ...currentItem, cableLength: value });
      return;
    }
    let price = 0;
    if (value === "custom") {
      setCurrentItem({ ...currentItem, cableLength: value });
      const customCableSetting = invoiceSettings.cableLengths.find(
        (cl) => cl.isCustom
      );
      price = customCableSetting?.price || 0;
    } else {
      const cableLengthSetting = invoiceSettings.cableLengths.find(
        (cl) => cl.length.toString() === value
      );
      if (cableLengthSetting) {
        price = cableLengthSetting.price;
      }
    }
    setCurrentItem({
      ...currentItem,
      cableLength: value,
      unitPrice: price,
      totalPrice: price * (currentItem.quantity || 1),
    });
  };

  const handleDeviceModelChange = (value: string) => {
    if (!invoiceSettings) return;
    if (currentItem.type === "newCustomerInstallation") {
      setCurrentItem({ ...currentItem, deviceModel: value });
      return;
    }
    const deviceModelSetting = invoiceSettings.deviceModels.find(
      (dm) => dm.name === value
    );
    let price = deviceModelSetting?.price || 0;
    setCurrentItem({
      ...currentItem,
      deviceModel: value,
      unitPrice: price,
      totalPrice: price * (currentItem.quantity || 1),
    });
  };

  const handleMaintenanceTypeChange = (value: string) => {
    if (!invoiceSettings) return;
    const maintenanceTypeSetting = invoiceSettings.maintenanceTypes.find(
      (mt) => mt.id === value
    );
    let price = maintenanceTypeSetting?.basePrice || 0;
    let description = currentItem.description || "صيانة مشترك";

    setCurrentItem((prev) => ({
      ...prev,
      maintenanceType: value,
      description,
      unitPrice: price,
      totalPrice: price * (prev.quantity || 1),
    }));
  };

  const addItem = () => {
    if (!invoiceSettings) {
      Toast.show({ type: "error", text1: "الإعدادات غير محملة" });
      return;
    }
    try {
      if (!currentItem.type || !currentItem.description) {
        Alert.alert("خطأ", "الرجاء إدخال نوع العنصر والوصف");
        return;
      }
      let unitPrice = currentItem.unitPrice || 0;
      let totalPrice = currentItem.totalPrice || 0;

      if (currentItem.type === "newCustomerInstallation") {
        const packageType = invoiceSettings.packageTypes.find(
          (pt) => pt.name === currentItem.packageType
        );
        unitPrice = packageType?.price || 0;
        totalPrice = unitPrice * (currentItem.quantity || 1);
      }

      if (totalPrice === 0 && currentItem.type !== "newCustomerInstallation") {
        if (
          currentItem.type === "maintenance" &&
          currentItem.maintenanceType === "connectorReplacement" &&
          (currentItem.connectorType?.length ?? 0) > 0
        ) {
          // Price is handled by useEffect for connectorType, can be 0.
        } else if (
          currentItem.type === "maintenance" &&
          currentItem.maintenanceType === "customMaintenance"
        ) {
          // Allow 0 for custom maintenance if explicitly set.
        } else if (currentItem.type !== "maintenance") {
          Alert.alert(
            "خطأ",
            "الرجاء إدخال سعر العنصر أو التأكد من تفاصيل الصيانة"
          );
          return;
        }
      }

      let finalCableLength: number | string | undefined = currentItem.cableLength;
      if (currentItem.cableLength === "custom" && customCableLength) {
        const numValue = parseInt(customCableLength);
        finalCableLength = isNaN(numValue) ? customCableLength : numValue;
      } else if (
        typeof currentItem.cableLength === "string" &&
        currentItem.cableLength !== "custom"
      ) {
        const numValue = parseInt(currentItem.cableLength);
        finalCableLength = isNaN(numValue)
          ? currentItem.cableLength
          : numValue;
      }

      const newItem: InvoiceItem = {
        id: uuidv4(),
        type: currentItem.type as InvoiceItem["type"],
        description: currentItem.description || "",
        quantity: currentItem.quantity || 1,
        unitPrice,
        totalPrice,
        packageType: currentItem.packageType,
        cableLength: finalCableLength,
        connectorType: Array.isArray(currentItem.connectorType)
          ? currentItem.connectorType
          : undefined,
        numHooks: currentItem.numHooks,
        numBags: currentItem.numBags,
        maintenanceType: currentItem.maintenanceType,
        deviceModel: currentItem.deviceModel,
        additionalNotes: currentItem.additionalNotes,
      };
      setItems([...items, newItem]);
      resetItemForm();
      setShowItemForm(false);
    } catch (error) {
      console.error("Error adding item:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء إضافة العنصر");
    }
  };

  const removeItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => total + item.totalPrice, 0);
  };

  useEffect(() => {
    async function fetchUserStock() {
      if (!user?.uid || !db) {
        setUserStock(null);
        setLoadingUserStock(false);
        return;
      }
      setLoadingUserStock(true);
      try {
        const usersCollectionRef = collection(db, "users");
        const userQuery = query(usersCollectionRef, where("uid", "==", user.uid));
        const querySnapshot = await getDocs(userQuery);

        let userNameFromDB;
        let foundStockItems: UserStockItem[] = [];
        let lastUpdated = new Date().toISOString();

        if (!querySnapshot.empty && querySnapshot.docs.length > 0) {
          const userDocSnapshot = querySnapshot.docs[0];
          const userData = userDocSnapshot.data();
          userNameFromDB = userData.name;
          if (userData && Array.isArray(userData.stockItems)) {
            foundStockItems = userData.stockItems as UserStockItem[];
            lastUpdated = userData.lastUpdated || lastUpdated;
          }
        }
        setUserStock({
          id: user.uid,
          userId: user.uid,
          userName:
            userNameFromDB ||
            user.displayName ||
            user.email?.split("@")[0] ||
            "User",
          items: foundStockItems,
          lastUpdated: lastUpdated,
        });
      } catch (error) {
        console.error("DEBUG: fetchUserStock - Error fetching user stock:", error);
        Toast.show({ type: "error", text1: "Error fetching user stock" });
        setUserStock({
          id: user!.uid,
          userId: user!.uid,
          userName:
            user!.displayName || user!.email?.split("@")[0] || "User",
          items: [],
          lastUpdated: new Date().toISOString(),
        });
      } finally {
        setLoadingUserStock(false);
      }
    }
    fetchUserStock();
  }, [user]);

  const checkStockForItem = useCallback(
    (item: InvoiceItem): boolean => {
      if (!userStock || !invoiceSettings) return false;
      if (!item) return true;

      let requiredStockItems: {
        type: string;
        id: string;
        name: string;
        quantity: number;
      }[] = [];
      const itemQty = item.quantity || 1;

      if (item.type === "newCustomerInstallation") {
        if (item.connectorType && Array.isArray(item.connectorType)) {
          item.connectorType.forEach((connName) => {
            const connDetail = invoiceSettings.connectorTypes.find(
              (c) => c.name === connName
            );
            if (connDetail)
              requiredStockItems.push({
                type: "connectorType",
                id: connDetail.id,
                name: connDetail.name,
                quantity: itemQty,
              });
          });
        }
        if (item.deviceModel) {
          const deviceDetail = invoiceSettings.deviceModels.find(
            (d) => d.name === item.deviceModel
          );
          if (deviceDetail)
            requiredStockItems.push({
              type: "deviceModel",
              id: deviceDetail.id,
              name: deviceDetail.name,
              quantity: itemQty,
            });
        }
        if (item.numHooks && item.numHooks > 0) {
          requiredStockItems.push({
            type: "hook",
            id: "STANDARD_HOOK_UNIT",
            name: "خطاف",
            quantity: item.numHooks * itemQty,
          });
        }
        if (item.numBags && item.numBags > 0) {
          requiredStockItems.push({
            type: "bag",
            id: "BAG_ITEM_UNIT",
            name: "شنطات",
            quantity: item.numBags * itemQty,
          });
        }
        if (
          item.cableLength &&
          typeof item.cableLength === "number" &&
          item.cableLength > 0
        ) {
          requiredStockItems.push({
            type: "cable",
            id: "FIBER_CABLE_METERS",
            name: `كيبل فايبر`,
            quantity: item.cableLength * itemQty,
          });
        } else if (item.cableLength === "custom" && customCableLength) {
          const length = parseInt(customCableLength);
          if (!isNaN(length) && length > 0) {
            requiredStockItems.push({
              type: "cable",
              id: "FIBER_CABLE_METERS",
              name: `كيبل فايبر (مخصص)`,
              quantity: length * itemQty,
            });
          }
        }
      } else if (item.type === "maintenance") {
        if (
          item.maintenanceType === "connectorReplacement" &&
          item.connectorType &&
          Array.isArray(item.connectorType)
        ) {
          item.connectorType.forEach((connName) => {
            const connDetail = invoiceSettings.connectorTypes.find(
              (c) => c.name === connName
            );
            if (connDetail)
              requiredStockItems.push({
                type: "connectorType",
                id: connDetail.id,
                name: connDetail.name,
                quantity: itemQty,
              });
          });
        }
        if (
          item.maintenanceType === "deviceReplacement" &&
          item.deviceModel
        ) {
          const deviceDetail = invoiceSettings.deviceModels.find(
            (d) => d.name === item.deviceModel
          );
          if (deviceDetail)
            requiredStockItems.push({
              type: "deviceModel",
              id: deviceDetail.id,
              name: deviceDetail.name,
              quantity: itemQty,
            });
        }
        if (
          item.maintenanceType === "cableReplacement" &&
          item.cableLength &&
          typeof item.cableLength === "number" &&
          item.cableLength > 0
        ) {
          requiredStockItems.push({
            type: "cable",
            id: "FIBER_CABLE_METERS",
            name: `كيبل فايبر`,
            quantity: item.cableLength * itemQty,
          });
        } else if (
          item.maintenanceType === "cableReplacement" &&
          item.cableLength === "custom" &&
          customCableLength
        ) {
          const length = parseInt(customCableLength);
          if (!isNaN(length) && length > 0) {
            requiredStockItems.push({
              type: "cable",
              id: "FIBER_CABLE_METERS",
              name: `كيبل فايبر (مخصص)`,
              quantity: length * itemQty,
            });
          }
        }
      }
      if (requiredStockItems.length === 0) return true;

      const currentMissing: typeof missingItems = [];
      for (const required of requiredStockItems) {
        const stockItem = userStock.items.find(
          (si) => si.itemType === required.type && si.itemId === required.id
        );
        const available = stockItem ? stockItem.quantity : 0;
        if (available < required.quantity) {
          currentMissing.push({
            type: required.type,
            name: required.name,
            required: required.quantity,
            available,
          });
        }
      }

      if (currentMissing.length > 0) {
        setMissingItems((prev) => [...prev, ...currentMissing]); // This correctly appends to missingItems state
      }
      return currentMissing.length === 0;
    },
    [userStock, invoiceSettings, customCableLength]
  );

  const validateUserStock = useCallback((): boolean => {
    setMissingItems([]); // Reset missing items before validation
    if (!userStock || userStock.items.length === 0) {
      if (!loadingUserStock) {
        // Create a temporary list for the modal, this should be set to state if we want to show it.
        const tempMissing = [
          {
            type: "general",
            name: "لا يوجد مخزون مخصص أو المستخدم لم يقم بتسجيل الدخول",
            required: 0,
            available: 0,
          },
        ];
        setMissingItems(tempMissing);
        setStockCheckFailed(true);
      }
      return false; // Stock check fails if no user stock and not loading
    }

    let allItemsSufficient = true;
    const localMissingItems: typeof missingItems = []; // Accumulate missing items locally

    for (const item of items) {
      // Temporarily reset global missing items for checkStockForItem
      setMissingItems([]);
      if (!checkStockForItem(item)) {
        allItemsSufficient = false;
        // checkStockForItem updates global missingItems, so capture them here
        localMissingItems.push(...missingItems);
      }
    }
    // After checking all items, set the final list of missing items
    setMissingItems(localMissingItems);

    if (!allItemsSufficient || localMissingItems.length > 0) {
      setStockCheckFailed(true);
      return false; // Stock validation fails
    } else {
      setStockCheckFailed(false);
      return true; // Stock validation passes
    }
  }, [items, userStock, checkStockForItem, loadingUserStock]);

  const reduceUserStock = async (invoice: Invoice): Promise<boolean> => {
    if (!userStock || !user?.uid || !invoiceSettings || !db) return false;
    try {
      const updatedStockItems: UserStockItem[] = JSON.parse(
        JSON.stringify(userStock.items)
      );
      const stockTransactions: StockTransaction[] = [];
      const timestamp = new Date().toISOString();

      for (const item of invoice.items) {
        if (
          [
            "transportationFee",
            "expenseReimbursement",
            "customItem",
            "subscriptionRenewal",
          ].includes(item.type)
        ) {
          continue;
        }

        const invoiceItemQuantity = item.quantity || 1;
        let requiredStockDetails: {
          type: UserStockItem["itemType"];
          id: string;
          name: string;
          quantity: number;
        }[] = [];

        if (item.type === "newCustomerInstallation") {
          if (item.connectorType) {
            item.connectorType.forEach((name) => {
              const detail = invoiceSettings.connectorTypes.find(
                (ct) => ct.name === name
              );
              if (detail)
                requiredStockDetails.push({
                  type: "connectorType",
                  id: detail.id,
                  name: detail.name,
                  quantity: invoiceItemQuantity,
                });
            });
          }
          if (item.deviceModel) {
            const detail = invoiceSettings.deviceModels.find(
              (dm) => dm.name === item.deviceModel
            );
            if (detail)
              requiredStockDetails.push({
                type: "deviceModel",
                id: detail.id,
                name: detail.name,
                quantity: invoiceItemQuantity,
              });
          }
          if (item.numHooks && item.numHooks > 0) {
            requiredStockDetails.push({
              type: "hook",
              id: "STANDARD_HOOK_UNIT",
              name: "خطاف",
              quantity: item.numHooks * invoiceItemQuantity,
            });
          }
          if (item.numBags && item.numBags > 0) {
            requiredStockDetails.push({
              type: "bag",
              id: "BAG_ITEM_UNIT",
              name: "شنطات",
              quantity: item.numBags * invoiceItemQuantity,
            });
          }
          let cableLengthToReduce = 0;
          if (typeof item.cableLength === "number")
            cableLengthToReduce = item.cableLength;
          else if (item.cableLength === "custom" && customCableLength)
            cableLengthToReduce = parseInt(customCableLength) || 0;
          if (cableLengthToReduce > 0) {
            requiredStockDetails.push({
              type: "cable",
              id: "FIBER_CABLE_METERS",
              name: "كيبل فايبر",
              quantity: cableLengthToReduce * invoiceItemQuantity,
            });
          }
        } else if (item.type === "maintenance") {
          if (
            item.maintenanceType === "connectorReplacement" &&
            item.connectorType
          ) {
            item.connectorType.forEach((name) => {
              const detail = invoiceSettings.connectorTypes.find(
                (ct) => ct.name === name
              );
              if (detail)
                requiredStockDetails.push({
                  type: "connectorType",
                  id: detail.id,
                  name: detail.name,
                  quantity: invoiceItemQuantity,
                });
            });
          }
          if (
            item.maintenanceType === "deviceReplacement" &&
            item.deviceModel
          ) {
            const detail = invoiceSettings.deviceModels.find(
              (dm) => dm.name === item.deviceModel
            );
            if (detail)
              requiredStockDetails.push({
                type: "deviceModel",
                id: detail.id,
                name: detail.name,
                quantity: invoiceItemQuantity,
              });
          }
          if (item.maintenanceType === "cableReplacement") {
            let cableLengthToReduce = 0;
            if (typeof item.cableLength === "number")
              cableLengthToReduce = item.cableLength;
            else if (item.cableLength === "custom" && customCableLength)
              cableLengthToReduce = parseInt(customCableLength) || 0;

            if (cableLengthToReduce > 0) {
              requiredStockDetails.push({
                type: "cable",
                id: "FIBER_CABLE_METERS",
                name: "كيبل فايبر",
                quantity: cableLengthToReduce * invoiceItemQuantity,
              });
            }
          }
        }

        for (const required of requiredStockDetails) {
          const existingItemIndex = updatedStockItems.findIndex(
            (si) =>
              si.itemType === required.type && si.itemId === required.id
          );
          if (existingItemIndex !== -1) {
            updatedStockItems[existingItemIndex].quantity -= required.quantity;
            updatedStockItems[existingItemIndex].lastUpdated = timestamp;
          } else {
            // This case should ideally not happen if stock validation passed,
            // but if it does, it implies an item not in stock is being "reduced"
            console.warn(
              `Attempting to reduce non-existent stock item: ${required.name} (ID: ${required.id})`
            );
            // Create it with negative quantity, or handle as error
            // For now, let's assume validation should prevent this.
            // If we proceed, it implies creating a negative stock entry.
            // updatedStockItems.push({
            //     id: uuidv4(), itemType: required.type, itemId: required.id, itemName: required.name,
            //     quantity: -required.quantity, lastUpdated: timestamp
            // });
          }
          stockTransactions.push({
            id: uuidv4(),
            userId: user.uid,
            userName:
              currentUserDisplayName || user.displayName || "N/A",
            itemType: required.type,
            itemId: required.id,
            itemName: required.name,
            quantity: required.quantity,
            type: "invoice",
            sourceId: invoice.id,
            sourceName: `فاتورة #${invoice.id.substring(0, 8)}`,
            timestamp,
            notes: `تم استخدام في فاتورة للعميل ${
              invoice.customerName || "غير معروف"
            } (تذكرة #${invoice.linkedServiceRequestId.substring(0, 6)})`,
          });
        }
      }

      if (stockTransactions.length > 0) {
        const usersCollectionRef = collection(db, "users");
        const userQueryRef = query(
          usersCollectionRef,
          where("uid", "==", user.uid)
        );
        const querySnapshot = await getDocs(userQueryRef);

        if (!querySnapshot.empty) {
          await updateDoc(querySnapshot.docs[0].ref, {
            stockItems: updatedStockItems,
            lastUpdated: timestamp,
          });
        } else {
          console.warn(
            `User document not found for UID: ${user.uid}. Stock not updated.`
          );
        }

        for (const transaction of stockTransactions) {
          await setDoc(doc(db, "stockTransactions", transaction.id), transaction);
        }
      }

      setUserStock(
        (prev) =>
          prev ? { ...prev, items: updatedStockItems, lastUpdated: timestamp } : null
      );
      return true;
    } catch (error) {
      console.error("Error reducing user stock:", error);
      Toast.show({
        type: "error",
        text1: "خطأ في تحديث المخزون",
        text2: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  useEffect(() => {
    if (
      !invoiceSettings ||
      !currentItem ||
      currentItem.type !== "maintenance" ||
      currentItem.maintenanceType !== "connectorReplacement" ||
      !Array.isArray(currentItem.connectorType)
    ) {
      return;
    }

    const connectorCount = currentItem.connectorType.length;
    let price = 0;
    if (connectorCount > 0) {
      price = currentItem.connectorType.reduce((total, ctName) => {
        const connectorSetting = invoiceSettings.connectorTypes.find(
          (ct) => ct.name === ctName
        );
        return total + (connectorSetting?.price || 0);
      }, 0);
    }

    setCurrentItem((prev) => ({
      ...prev,
      unitPrice: price,
      totalPrice: price * (prev.quantity || 1),
    }));
  }, [
    currentItem.connectorType,
    currentItem.maintenanceType,
    currentItem.type,
    currentItem.quantity,
    invoiceSettings,
  ]);

  const handleSaveInvoice = async () => {
    if (!db) {
      Toast.show({ type: "error", text1: "Database not configured" });
      return;
    }
    if (items.length === 0) {
      Toast.show({
        type: "error",
        text1: "خطأ",
        text2: "الرجاء إضافة عناصر للفاتورة",
      });
      return;
    }

    // Perform stock validation. If it fails (returns false), it means there are critical stock issues.
    // The validateUserStock function now sets stockCheckFailed and missingItems state internally.
    // If it returns false, it means we should not proceed.
    if (!validateUserStock()) {
      // stockCheckFailed is true, modal will show. Don't proceed with saving.
      // It might be redundant to setSubmitting(false) here if it's not true yet,
      // but ensure we don't proceed.
      return;
    }
    // If validateUserStock returns true, it means either stock is sufficient,
    // OR there are non-critical issues (e.g., general "no stock assigned") and stockCheckFailed is true,
    // allowing the user to "understand" and proceed (current modal logic).
    // The key is: does validateUserStock() returning true *always* mean it's okay to proceed,
    // or does it mean "validation ran, check stockCheckFailed state"?
    // Let's assume: if stockCheckFailed is true *after* validateUserStock, the modal *will* show,
    // but the save process should continue if the user dismisses the modal.
    // This implies that the initial `validateUserStock()` check above might be better as:
    // `const isStockSufficient = validateUserStock();`
    // `if (stockCheckFailed && !isStockSufficient) { /* don't submit yet, wait for modal interaction */ }`
    // However, the current logic is: validate, if `stockCheckFailed` is true, show modal.
    // The modal's "Fahimt" button just closes it. The form submission logic continues.
    // This means the user can acknowledge stock issues and proceed.

    setSubmitting(true);

    try {
      const serializedItems: InvoiceItem[] = items.map((item) => {
        const serializedItem: InvoiceItem = {
          id: item.id,
          type: item.type,
          description: item.description || "",
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          totalPrice: Number(item.totalPrice) || 0,
        };

        if (item.packageType !== undefined)
          serializedItem.packageType = item.packageType;
        if (item.cableLength !== undefined) {
          if (
            typeof item.cableLength === "string" &&
            item.cableLength !== "custom"
          ) {
            serializedItem.cableLength = parseInt(item.cableLength) || 0;
          } else {
            serializedItem.cableLength = item.cableLength;
          }
        }
        if (item.connectorType !== undefined)
          serializedItem.connectorType = item.connectorType;
        if (item.numHooks !== undefined)
          serializedItem.numHooks = Number(item.numHooks) || 0;
        if (item.numBags !== undefined)
          serializedItem.numBags = Number(item.numBags) || 0;
        if (item.maintenanceType !== undefined)
          serializedItem.maintenanceType = item.maintenanceType;
        if (item.deviceModel !== undefined)
          serializedItem.deviceModel = item.deviceModel;
        return serializedItem;
      });

      const newInvoice: Invoice = {
        id: uuidv4(),
        linkedServiceRequestId: ticketId,
        createdBy: user?.uid || "",
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        items: serializedItems,
        totalAmount: calculateTotal(),
        status: "draft",
        notes: notes.trim(),
        customerName: customerName || serviceRequest?.customerName || "",
        creatorName: currentUserDisplayName || user?.displayName || "",
        type: "invoice",
        teamId: currentUserTeamId || null,
        subscriberId:
          typeof subscriberId === "string"
            ? subscriberId
            : serviceRequest?.subscriberId || serviceRequest?.customerId,
      };

      const stockReduced = await reduceUserStock(newInvoice);
      // If stock reduction failed (e.g., due to an unexpected error during the process,
      // not due to initial validation which might allow proceeding with warning), then stop.
      if (!stockReduced) {
        setSubmitting(false);
        // Toast message is shown within reduceUserStock on error
        return;
      }

      const invoiceRef = doc(db, "invoices", newInvoice.id);
      await setDoc(invoiceRef, newInvoice);

      const ticketRef = doc(db, ticketCollectionName, ticketId);
      await updateDoc(ticketRef, {
        invoiceIds: arrayUnion(newInvoice.id),
        lastUpdated: new Date().toISOString(),
      });

      const comment: Comment = {
        id: `comment_${Date.now()}`,
        userId: user?.uid || "",
        userName: currentUserDisplayName || user?.displayName || "",
        content: `تم إنشاء فاتورة جديدة بقيمة ${calculateTotal().toLocaleString()} دينار عراقي.`,
        timestamp: new Date().toISOString(),
      };
      await updateDoc(ticketRef, { comments: arrayUnion(comment) });

      Toast.show({
        type: "success",
        text1: "نجاح",
        text2: "تم إنشاء الفاتورة بنجاح وتحديث المخزون",
      });
      onSuccess();
    } catch (error) {
      console.error("Error saving invoice:", error);
      Toast.show({
        type: "error",
        text1: "خطأ",
        text2:
          "حدث خطأ أثناء حفظ الفاتورة: " +
          (error instanceof Error ? error.message : "خطأ غير معروف"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelItemForm = () => {
    resetItemForm();
    setShowItemForm(false);
  };

  // --- HELPER FUNCTION & CONSTANTS ---
  // This function is part of the UI layer as it directly renders UI elements.
  // It is modified to use the new design system styles and component structures.
  interface RenderItemSpecificFieldsProps {
    currentItem: Partial<InvoiceItem>;
    setCurrentItem: React.Dispatch<React.SetStateAction<Partial<InvoiceItem>>>;
    invoiceSettings: InvoiceSettings;
    customCableLength: string;
    handleCustomCableLengthInputChange: (text: string) => void;
    handlePackageTypeChange: (value: string) => void;
    handleCableLengthChange: (value: string) => void;
    handleDeviceModelChange: (value: string) => void;
    handleMaintenanceTypeChange: (value: string) => void;
    styles: typeof styles;
    COLORS: typeof COLORS;
  }

  const RenderItemSpecificFields: React.FC<RenderItemSpecificFieldsProps> = ({
    currentItem,
    setCurrentItem,
    invoiceSettings,
    customCableLength,
    handleCustomCableLengthInputChange,
    handlePackageTypeChange,
    handleCableLengthChange,
    handleDeviceModelChange,
    handleMaintenanceTypeChange,
    styles, // Pass styles down to use the new design system
    COLORS, // Pass colors down for consistency
  }) => {
    if (!invoiceSettings) return null;

    // A common wrapper for Pickers to give them a consistent, modern look
    const ModernPicker: React.FC<{
      selectedValue: any;
      onValueChange: (value: any) => void;
      children: React.ReactNode;
      placeholder: string;
    }> = ({ selectedValue, onValueChange, children, placeholder }) => (
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedValue}
          onValueChange={onValueChange}
          style={styles.picker}
          itemStyle={styles.pickerItem}
        >
          <Picker.Item
            label={placeholder}
            value={undefined}
            color={COLORS.muted}
          />
          {children}
        </Picker>
        <Feather
          name="chevron-down"
          size={20}
          color={COLORS.muted}
          style={styles.pickerIcon}
        />
      </View>
    );

    switch (currentItem.type) {
      case "newCustomerInstallation":
        return (
          <>
            <Text style={styles.label}>نوع الباقة</Text>
            <ModernPicker
              selectedValue={currentItem.packageType}
              onValueChange={(itemValue) => handlePackageTypeChange(itemValue)}
              placeholder="اختر نوع الباقة..."
            >
              {invoiceSettings.packageTypes
                .filter((pt: PackageType) => pt.isActive)
                .map((pt: PackageType) => (
                  <Picker.Item
                    key={pt.id}
                    label={`${
                      pt.name
                    } (${pt.price.toLocaleString()} د.ع)`}
                    value={pt.name}
                  />
                ))}
            </ModernPicker>

            <Text style={styles.label}>طول الكيبل المستخدم</Text>
            <ModernPicker
              selectedValue={currentItem.cableLength?.toString()}
              onValueChange={handleCableLengthChange}
              placeholder="اختر طول الكيبل..."
            >
              {invoiceSettings.cableLengths
                .filter((cl: CableLength) => cl.isActive && !cl.isCustom)
                .map((cl: CableLength) => (
                  <Picker.Item
                    key={cl.id}
                    label={`${cl.length} متر`}
                    value={cl.length.toString()}
                  />
                ))}
              {invoiceSettings.cableLengths.some(
                (cl: CableLength) => cl.isCustom && cl.isActive
              ) && <Picker.Item label="طول مخصص" value="custom" />}
            </ModernPicker>
            {currentItem.cableLength === "custom" && (
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                placeholder="أدخل الطول بالمتر"
                value={customCableLength}
                onChangeText={handleCustomCableLengthInputChange}
                placeholderTextColor={COLORS.muted}
              />
            )}

            <Text style={styles.label}>جهاز الاستقبال</Text>
            <ModernPicker
              selectedValue={currentItem.deviceModel}
              onValueChange={handleDeviceModelChange}
              placeholder="اختر نوع الجهاز..."
            >
              {invoiceSettings.deviceModels
                .filter((dm: DeviceModel) => dm.isActive)
                .map((dm: DeviceModel) => (
                  <Picker.Item key={dm.id} label={dm.name} value={dm.name} />
                ))}
            </ModernPicker>

            <Text style={styles.label}>المواد المستخدمة</Text>
            <View style={styles.checkboxGroupContainer}>
              {invoiceSettings.connectorTypes
                .filter((ct: ConnectorType) => ct.isActive)
                .map((ct: ConnectorType) => (
                  <View key={ct.id} style={styles.checkboxWrapper}>
                    <Checkbox
                      value={
                        Array.isArray(currentItem.connectorType) &&
                        currentItem.connectorType.includes(ct.name)
                      }
                      onValueChange={(checked) => {
                        setCurrentItem((prev: Partial<InvoiceItem>) => ({
                          ...prev,
                          connectorType: checked
                            ? [...(prev.connectorType || []), ct.name]
                            : (prev.connectorType || []).filter(
                                (t: string) => t !== ct.name
                              ),
                        }));
                      }}
                      color={COLORS.primary}
                      style={styles.checkboxBase}
                    />
                    <Text style={styles.checkboxLabel}>{ct.name}</Text>
                  </View>
                ))}
            </View>

            <View style={styles.inlineInputContainer}>
              <View style={styles.inlineInput}>
                <Text style={styles.label}>عدد الهوكات</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={currentItem.numHooks?.toString() || "0"}
                  onChangeText={(val) =>
                    setCurrentItem({ ...currentItem, numHooks: parseInt(val) || 0 })
                  }
                  placeholderTextColor={COLORS.muted}
                />
              </View>
              <View style={styles.inlineInput}>
                <Text style={styles.label}>عدد الشناطات</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={currentItem.numBags?.toString() || "0"}
                  onChangeText={(val) =>
                    setCurrentItem({ ...currentItem, numBags: parseInt(val) || 0 })
                  }
                  placeholderTextColor={COLORS.muted}
                />
              </View>
            </View>
          </>
        );
      case "maintenance":
        return (
          <>
            <Text style={styles.label}>نوع الصيانة</Text>
            <ModernPicker
              selectedValue={currentItem.maintenanceType}
              onValueChange={handleMaintenanceTypeChange}
              placeholder="اختر نوع الصيانة..."
            >
              <Picker.Item label="استبدال كابل" value="cableReplacement" />
              <Picker.Item label="استبدال كونيكتر" value="connectorReplacement" />
              <Picker.Item label="استبدال جهاز" value="deviceReplacement" />
            </ModernPicker>

            {currentItem.maintenanceType === "cableReplacement" && (
              <>
                <Text style={styles.label}>طول الكيبل</Text>
                <ModernPicker
                  selectedValue={currentItem.cableLength?.toString()}
                  onValueChange={handleCableLengthChange}
                  placeholder="اختر طول الكيبل..."
                >
                  {invoiceSettings.cableLengths
                    .filter((cl: CableLength) => cl.isActive && !cl.isCustom)
                    .map((cl: CableLength) => (
                      <Picker.Item
                        key={cl.id}
                        label={`${
                          cl.length
                        } متر (${cl.price.toLocaleString()} د.ع)`}
                        value={cl.length.toString()}
                      />
                    ))}
                  {invoiceSettings.cableLengths.some(
                    (cl: CableLength) => cl.isCustom && cl.isActive
                  ) && <Picker.Item label="طول مخصص" value="custom" />}
                </ModernPicker>
                {currentItem.cableLength === "custom" && (
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="أدخل الطول بالمتر"
                    value={customCableLength}
                    onChangeText={handleCustomCableLengthInputChange}
                    placeholderTextColor={COLORS.muted}
                  />
                )}
              </>
            )}

            {currentItem.maintenanceType === "connectorReplacement" && (
              <>
                <Text style={styles.label}>نوع الكونيكتر</Text>
                <View style={styles.checkboxGroupContainer}>
                  {invoiceSettings.connectorTypes
                    .filter((ct: ConnectorType) => ct.isActive)
                    .map((ct: ConnectorType) => (
                      <View key={ct.id} style={styles.checkboxWrapper}>
                        <Checkbox
                          value={
                            Array.isArray(currentItem.connectorType) &&
                            currentItem.connectorType.includes(ct.name)
                          }
                          onValueChange={(checked) => {
                            setCurrentItem((prev: Partial<InvoiceItem>) => ({
                              ...prev,
                              connectorType: checked
                                ? [...(prev.connectorType || []), ct.name]
                                : (prev.connectorType || []).filter(
                                    (t: string) => t !== ct.name
                                  ),
                            }));
                          }}
                          color={COLORS.primary}
                          style={styles.checkboxBase}
                        />
                        <Text style={styles.checkboxLabel}>{`${
                          ct.name
                        } (${ct.price.toLocaleString()} د.ع)`}</Text>
                      </View>
                    ))}
                </View>
              </>
            )}

            {currentItem.maintenanceType === "deviceReplacement" && (
              <>
                <Text style={styles.label}>نوع الجهاز</Text>
                <ModernPicker
                  selectedValue={currentItem.deviceModel}
                  onValueChange={handleDeviceModelChange}
                  placeholder="اختر نوع الجهاز..."
                >
                  {invoiceSettings.deviceModels
                    .filter((dm: DeviceModel) => dm.isActive)
                    .map((dm: DeviceModel) => (
                      <Picker.Item
                        key={dm.id}
                        label={`${
                          dm.name
                        } (${dm.price.toLocaleString()} د.ع)`}
                        value={dm.name}
                      />
                    ))}
                </ModernPicker>
              </>
            )}

            {currentItem.maintenanceType === "customMaintenance" && (
              <>
                <Text style={styles.label}>وصف الصيانة</Text>
                <TextInput
                  style={styles.input}
                  value={currentItem.description}
                  onChangeText={(text) =>
                    setCurrentItem({ ...currentItem, description: text })
                  }
                  placeholder="أدخل وصف الصيانة..."
                  placeholderTextColor={COLORS.muted}
                />
                <Text style={styles.label}>السعر (د.ع)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={currentItem.unitPrice?.toString() || "0"}
                  onChangeText={(text) => {
                    const price = parseFloat(text) || 0;
                    setCurrentItem({
                      ...currentItem,
                      unitPrice: price,
                      totalPrice: price * (currentItem.quantity || 1),
                    });
                  }}
                  placeholder="0"
                  placeholderTextColor={COLORS.muted}
                />
              </>
            )}
          </>
        );
      case "subscriptionRenewal":
        return (
          <>
            <Text style={styles.label}>نوع الاشتراك</Text>
            <ModernPicker
              selectedValue={currentItem.packageType}
              onValueChange={handlePackageTypeChange}
              placeholder="اختر نوع الاشتراك..."
            >
              {invoiceSettings.packageTypes
                .filter((pt: PackageType) => pt.isActive)
                .map((pt: PackageType) => (
                  <Picker.Item
                    key={pt.id}
                    label={`${
                      pt.name
                    } (${pt.price.toLocaleString()} د.ع)`}
                    value={pt.name}
                  />
                ))}
            </ModernPicker>
          </>
        );
      case "transportationFee":
      case "expenseReimbursement":
      case "customItem":
        return (
          <>
            <Text style={styles.label}>الوصف</Text>
            <TextInput
              style={styles.input}
              value={currentItem.description}
              onChangeText={(text) =>
                setCurrentItem({ ...currentItem, description: text })
              }
              placeholder="أدخل وصف العنصر..."
              placeholderTextColor={COLORS.muted}
            />
            <Text style={styles.label}>السعر (د.ع)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={currentItem.unitPrice?.toString() || "0"}
              onChangeText={(text) => {
                const price = parseFloat(text) || 0;
                setCurrentItem({
                  ...currentItem,
                  unitPrice: price,
                  totalPrice: price * (currentItem.quantity || 1),
                });
              }}
              placeholder="0"
              placeholderTextColor={COLORS.muted}
            />
          </>
        );
      default:
        return null;
    }
  };

  // --- REDESIGNED COMPONENT ---
  // This is the main JSX return block for your component.
  // It uses the new styles and maintains all original props and logic hooks.
  const closeMissingItemsDialog = () => {
    setStockCheckFailed(false);
  };

  if (loadingSettings || loadingServiceRequest || loadingUserStock) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>جاري تحميل البيانات...</Text>
      </View>
    );
  }
  if (!invoiceSettings) {
    return (
      <View style={styles.centered}>
        <Feather name="alert-triangle" size={48} color={COLORS.danger} />
        <Text style={styles.errorText}>لم نتمكن من تحميل إعدادات الفاتورة.</Text>
        <Text style={styles.errorSubText}>الرجاء المحاولة مرة أخرى.</Text>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.buttonSecondary,
            pressed && styles.buttonSecondaryPressed,
          ]}
          onPressIn={onCancel}
        >
          <Feather name="arrow-right" size={18} color={COLORS.white} />
          <Text style={styles.buttonText}>العودة</Text>
        </Pressable>
      </View>
    );
  }

  const isAddItemDisabled =
    !currentItem.description ||
    (currentItem.type !== "maintenance" &&
      (currentItem.unitPrice ?? 0) <= 0 &&
      currentItem.type !== "newCustomerInstallation") ||
    (currentItem.type === "maintenance" &&
      currentItem.maintenanceType !== "connectorReplacement" &&
      currentItem.maintenanceType !== "customMaintenance" &&
      (currentItem.unitPrice ?? 0) <= 0) ||
    (currentItem.type === "maintenance" &&
      currentItem.maintenanceType === "customMaintenance" &&
      (currentItem.unitPrice ?? 0) < 0) ||
    (currentItem.type === "newCustomerInstallation" && !currentItem.packageType);

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>إنشاء فاتورة</Text>
          <Text style={styles.headerSubtitle}>
            للتذكرة #{ticketId.substring(0, 6)}
          </Text>
        </View>

        {/* --- Items Card --- */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>عناصر الفاتورة</Text>
            {!showItemForm && (
              <Pressable
                onPressIn={() => setShowItemForm(true)}
                style={({ pressed }) => [
                  styles.button,
                  styles.buttonPrimary,
                  pressed && styles.buttonPrimaryPressed,
                ]}
              >
                <Feather name="plus" size={18} color={COLORS.white} />
                <Text style={styles.buttonText}>إضافة عنصر</Text>
              </Pressable>
            )}
          </View>

          {items.length > 0 ? (
            <View style={styles.itemListContainer}>
              {items.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.itemRow,
                    index === items.length - 1 && styles.itemRowLast,
                  ]}
                >
                  <View style={styles.itemRowDetails}>
                    <Text style={styles.itemDescription}>
                      {item.description}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {`الكمية: ${
                        item.quantity
                      }  ·  السعر: ${item.unitPrice.toLocaleString()} د.ع`}
                    </Text>
                  </View>
                  <Text style={styles.itemTotal}>
                    {item.totalPrice.toLocaleString()} د.ع
                  </Text>
                  <Pressable
                    onPressIn={() => removeItem(item.id)}
                    style={styles.deleteButton}
                  >
                    <Feather name="x" size={20} color={COLORS.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            !showItemForm && (
              <View style={styles.emptyStateContainer}>
                <Feather name="file-text" size={48} color={COLORS.border} />
                <Text style={styles.emptyStateText}>لا توجد عناصر بعد</Text>
                <Text style={styles.emptyStateSubText}>
                  إضغط على &apos;إضافة عنصر&apos; للبدء
                </Text>
              </View>
            )
          )}

          {items.length > 0 && (
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>المجموع الكلي</Text>
              <Text style={styles.totalValue}>
                {calculateTotal().toLocaleString()} د.ع
              </Text>
            </View>
          )}
        </View>

        {/* --- Add Item Form (appears inside a card) --- */}
        {showItemForm && (
          <View style={[styles.card, styles.itemFormCard]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>إضافة عنصر جديد</Text>
              <Pressable onPressIn={cancelItemForm} style={styles.cancelButton}>
                <Feather name="x" size={22} color={COLORS.muted} />
              </Pressable>
            </View>
            <Text style={styles.label}>نوع العنصر</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={currentItem.type}
                onValueChange={(itemValue) => handleItemTypeChange(itemValue)}
                style={styles.picker}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item
                  label="اختر نوع العنصر..."
                  value={undefined}
                  color={COLORS.muted}
                />
                <Picker.Item
                  label="تنصيب مشترك جديد"
                  value="newCustomerInstallation"
                />
                <Picker.Item label="صيانة مشترك" value="maintenance" />
                <Picker.Item label="نقليات" value="transportationFee" />
                <Picker.Item label="صرفيات" value="expenseReimbursement" />
                <Picker.Item label="تجديد اشتراك" value="subscriptionRenewal" />
                <Picker.Item label="عنصر مخصص" value="customItem" />
              </Picker>
              <Feather
                name="chevron-down"
                size={20}
                color={COLORS.muted}
                style={styles.pickerIcon}
              />
            </View>

            <RenderItemSpecificFields
              currentItem={currentItem}
              setCurrentItem={setCurrentItem}
              invoiceSettings={invoiceSettings!}
              customCableLength={customCableLength}
              handleCustomCableLengthInputChange={
                handleCustomCableLengthInputChange
              }
              handlePackageTypeChange={handlePackageTypeChange}
              handleCableLengthChange={handleCableLengthChange}
              handleDeviceModelChange={handleDeviceModelChange}
              handleMaintenanceTypeChange={handleMaintenanceTypeChange}
              styles={styles}
              COLORS={COLORS}
            />

            <View style={styles.formActions}>
              <Pressable
                onPressIn={addItem}
                disabled={isAddItemDisabled}
                style={({ pressed }) => [
                  styles.button,
                  styles.buttonPrimary,
                  styles.buttonFullWidth,
                  isAddItemDisabled && styles.buttonDisabled,
                  pressed &&
                    !isAddItemDisabled &&
                    styles.buttonPrimaryPressed,
                ]}
              >
                <Feather
                  name="plus-circle"
                  size={20}
                  color={COLORS.white}
                />
                <Text style={styles.buttonText}>إضافة العنصر للفاتورة</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* --- Notes Card --- */}
        <View style={styles.card}>
          <Text style={styles.label}>ملاحظات الفاتورة (اختياري)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="أدخل أي تفاصيل إضافية هنا..."
            placeholderTextColor={COLORS.muted}
            multiline
          />
        </View>
      </ScrollView>

      {/* --- Floating Action Footer --- */}
      <View style={styles.footer}>
        <Pressable
          onPressIn={onCancel}
          style={({ pressed }) => [
            styles.button,
            styles.buttonSecondary,
            pressed && styles.buttonSecondaryPressed,
          ]}
        >
          <Text style={styles.buttonText}>إلغاء</Text>
        </Pressable>
        <Pressable
          onPressIn={handleSaveInvoice}
          disabled={items.length === 0 || submitting}
          style={({ pressed }) => [
            styles.button,
            styles.buttonPrimary,
            styles.buttonLarge,
            (items.length === 0 || submitting) && styles.buttonDisabled,
            pressed &&
              !(items.length === 0 || submitting) &&
              styles.buttonPrimaryPressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Feather name="save" size={20} color={COLORS.white} />
              <Text style={styles.buttonText}>حفظ الفاتورة</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* --- Stock Check Modal --- */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={stockCheckFailed}
        onRequestClose={closeMissingItemsDialog}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalView}>
            <View style={styles.modalHeader}>
              <Feather name="alert-triangle" size={28} color={COLORS.danger} />
              <Text style={styles.modalTitle}>نقص في المخزون</Text>
            </View>
            <Text style={styles.modalText}>
              {missingItems.some((item) => item.type === "general")
                ? "لا يوجد لديك مخزون مخصص أو المستخدم لم يقم بتسجيل الدخول. لا يمكن المتابعة بدون مخزون أولي."
                : "لا يتوفر لديك مخزون كافٍ لبعض العناصر. يمكنك المتابعة وسيتم تسجيل النقص في حال توفر المخزون الأساسي لهذه العناصر."}
            </Text>
            {missingItems.filter((item) => item.type !== "general").length >
              0 && (
              <ScrollView
                style={styles.missingItemsScroll}
                nestedScrollEnabled={true}
              >
                {missingItems
                  .filter((item) => item.type !== "general")
                  .map((item, index) => (
                    <View key={index} style={styles.missingItemCard}>
                      <Text style={styles.missingItemName}>{item.name}</Text>
                      <View style={styles.missingItemDetails}>
                        <Text style={styles.missingItemDetail}>
                          المطلوب: {item.required}
                        </Text>
                        <Text style={styles.missingItemDetail}>
                          المتوفر: {item.available}
                        </Text>
                      </View>
                    </View>
                  ))}
              </ScrollView>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.buttonPrimary,
                styles.buttonFullWidth,
                pressed && styles.buttonPrimaryPressed,
                missingItems.some((item) => item.type === "general") &&
                  styles.buttonDisabled,
              ]}
              onPressIn={closeMissingItemsDialog}
              disabled={missingItems.some((item) => item.type === "general")}
            >
              <Text style={styles.buttonText}>فهمت</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

// --- NEW DESIGN SYSTEM STYLES ---

const COLORS = {
  primary: "#007AFF",
  primaryPressed: "#0056B3",
  secondary: "#6C757D",
  secondaryPressed: "#5A6268",
  white: "#FFFFFF",
  background: "#F2F2F7",
  card: "#FFFFFF",
  textPrimary: "#1C1C1E",
  textSecondary: "#3A3A3C",
  muted: "#8E8E93",
  border: "#E5E5EA",
  danger: "#FF3B30",
  success: "#34C759",
};

const styles = StyleSheet.create({
  // --- Layout & Structure ---
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100, // Space for floating footer
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: COLORS.background,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  // --- Header ---
  header: {
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    textAlign: "right",
  },
  headerSubtitle: {
    fontSize: 17,
    color: COLORS.muted,
    textAlign: "right",
    marginTop: 4,
  },

  // --- Card ---
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  itemFormCard: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.textPrimary,
    textAlign: "right",
  },

  // --- Buttons ---
  button: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
  },
  buttonLarge: {
    flex: 1,
    paddingVertical: 14,
  },
  buttonFullWidth: {
    width: "100%",
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
  },
  buttonPrimary: { backgroundColor: COLORS.primary },
  buttonPrimaryPressed: { backgroundColor: COLORS.primaryPressed },
  buttonSecondary: { backgroundColor: COLORS.secondary },
  buttonSecondaryPressed: { backgroundColor: COLORS.secondaryPressed },
  buttonDisabled: { backgroundColor: COLORS.muted, opacity: 0.7 },
  cancelButton: { padding: 4 },
  deleteButton: { padding: 8 },

  // --- Forms & Inputs ---
  label: {
    fontSize: 15,
    fontWeight: "500",
    color: COLORS.textSecondary,
    marginBottom: 8,
    marginTop: 12,
    textAlign: "right",
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "android" ? 12 : 14,
    fontSize: 16,
    color: COLORS.textPrimary,
    textAlign: "right",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  pickerContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
  },
  picker: {
    flex: 1,
    color: COLORS.textPrimary,
    borderWidth: 0, // Hide default borders
    backgroundColor: "transparent",
    height: 50,
  },
  pickerItem: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  pickerIcon: {
    paddingHorizontal: 14,
  },
  inlineInputContainer: {
    flexDirection: "row-reverse",
    gap: 16,
    marginTop: 12,
  },
  inlineInput: {
    flex: 1,
  },

  // --- Checkbox ---
  checkboxGroupContainer: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 20,
    marginTop: 8,
  },
  checkboxWrapper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  checkboxBase: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  checkboxLabel: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  formActions: {
    marginTop: 24,
  },

  // --- Item List ---
  itemListContainer: {
    marginTop: 8,
  },
  itemRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  itemRowLast: {
    borderBottomWidth: 0,
  },
  itemRowDetails: {
    flex: 1,
    marginRight: 12,
  },
  itemDescription: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.textPrimary,
    textAlign: "right",
  },
  itemMeta: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: "right",
    marginTop: 4,
  },
  itemDetail: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "right",
    marginBottom: 4,
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
    minWidth: 90,
    textAlign: "left",
  },
  itemContainer: {
    backgroundColor: "#F8F9FA",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  totalContainer: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
    marginTop: 16,
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: "bold",
    color: COLORS.textPrimary,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.primary,
  },

  // --- Empty State & Loaders ---
  emptyStateContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 17,
    color: COLORS.textSecondary,
    marginTop: 16,
    fontWeight: "500",
  },
  emptyStateSubText: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 6,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  errorText: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.textPrimary,
    textAlign: "center",
    marginTop: 16,
  },
  errorSubText: {
    fontSize: 16,
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },

  // --- Modal ---
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalView: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "85%",
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  modalHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.textPrimary,
  },
  modalText: {
    textAlign: "right",
    fontSize: 16,
    color: COLORS.textSecondary,
    lineHeight: 24,
    width: "100%",
    marginBottom: 20,
  },
  missingItemsScroll: {
    width: "100%",
    maxHeight: 250,
    marginBottom: 20,
  },
  missingItemCard: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  missingItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    textAlign: "right",
    marginBottom: 6,
  },
  missingItemDetails: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  missingItemDetail: {
    fontSize: 14,
    color: COLORS.muted,
  },
});

interface InvoiceListProps {
  invoiceIds: string[];
  ticketId: string;
  subscriberId?: string;
  onInvoiceAdded: () => void;
}

const InvoiceList: React.FC<InvoiceListProps> = ({
  invoiceIds,
  ticketId,
  subscriberId,
  onInvoiceAdded,
}) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);


  useEffect(() => {
    const fetchInvoices = async () => {
      if (!invoiceIds || invoiceIds.length === 0) {
        setInvoices([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const invoicePromises = invoiceIds.map((id) =>
          getDoc(doc(db, "invoices", id))
        );
        const invoiceSnaps = await Promise.all(invoicePromises);
        const invoicesData = invoiceSnaps
          .filter((snap) => snap.exists())
          .map((snap) => ({ id: snap.id, ...snap.data() } as Invoice));
        setInvoices(
          invoicesData.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        ); // Sort by newest first
      } catch (e) {
        console.error("Error fetching invoices:", e);
        setError("Failed to fetch invoices.");
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, [invoiceIds]);

  if (showInvoiceForm) {
    return (
      <InvoiceForm
        ticketId={ticketId}
        subscriberId={subscriberId}
        onCancel={() => setShowInvoiceForm(false)}
        onSuccess={() => {
          onInvoiceAdded();
          setShowInvoiceForm(false);
        }}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>جاري تحميل الفواتير...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Feather
          name="alert-triangle"
          size={48}
          color={COLORS.danger}
          style={{ marginBottom: 16 }}
        />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const AddInvoiceButton = () => (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        styles.buttonPrimary,
        { marginVertical: 16, alignSelf: "flex-end" },
        pressed && styles.buttonPrimaryPressed,
      ]}
      onPressIn={() => setShowInvoiceForm(true)}
    >
      <Feather
        name="plus-circle"
        size={20}
        color="white"
        style={{ marginRight: 10 }}
      />
      <Text style={styles.buttonText}>إضافة فاتورة جديدة</Text>
    </Pressable>
  );

  if (invoices.length === 0) {
    return (
      <View style={styles.centered}>
        <Feather
          name="file-plus"
          size={64}
          color={COLORS.muted}
          style={{ marginBottom: 20 }}
        />
        <Text style={styles.emptyStateText}>لا توجد فواتير لهذه التذكرة.</Text>
        <Text style={styles.emptyStateSubText}>يمكنك إنشاء فاتورة جديدة.</Text>
        <View style={{ marginTop: 20 }}>
          <AddInvoiceButton />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: styles.container.backgroundColor }}>
      <View style={{ paddingHorizontal: styles.contentContainer.padding }}>
        <AddInvoiceButton />
      </View>
      <ScrollView
        style={{ flex: 1 }} // Ensure ScrollView takes remaining space
        contentContainerStyle={{
          paddingBottom: styles.contentContainer.padding,
          paddingHorizontal: styles.contentContainer.padding,
        }}
      >
        {invoices.map((invoice) => (
          <View key={invoice.id} style={styles.card}>
            <View
              style={{
                flexDirection: "row-reverse",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <Text style={[styles.cardTitle, { marginBottom: 0, fontSize: 18 }]}>
                فاتورة رقم: {invoice.id.substring(0, 8)}
              </Text>
              <Text
                style={{
                  ...styles.itemDetail,
                  color:
                    invoice.status === "paid"
                      ? "#28A745"
                      : invoice.status === "pending"
                      ? "#FFC107"
                      : COLORS.muted,
                  fontWeight: "bold",
                  fontSize: 14,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor:
                    invoice.status === "paid"
                      ? "rgba(40, 167, 69, 0.1)"
                      : invoice.status === "pending"
                      ? "rgba(255, 193, 7, 0.1)"
                      : "rgba(108, 117, 125, 0.1)",
                  overflow: "hidden", // For borderRadius on text background on Android
                  borderColor:
                    invoice.status === "paid"
                      ? "#28A745"
                      : invoice.status === "pending"
                      ? "#FFC107"
                      : COLORS.muted,
                  borderWidth: 1,
                }}
              >
                {invoice.status.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.itemDetail}>
              العميل: {invoice.customerName || "N/A"}
            </Text>
            <Text style={styles.itemDetail}>
              تاريخ الإنشاء:{" "}
              {new Date(invoice.createdAt).toLocaleDateString("ar-IQ")}
            </Text>
            <Text style={styles.itemDetail}>
              بواسطة: {invoice.creatorName || "N/A"}
            </Text>
            <Text
              style={{
                ...styles.itemDetail,
                fontWeight: "bold",
                fontSize: 18,
                color: COLORS.primary,
                marginTop: 10,
                marginBottom: 8,
              }}
            >
              الإجمالي: {invoice.totalAmount.toLocaleString()} د.ع
            </Text>

            <Text
              style={[styles.label, { marginTop: 16, marginBottom: 8, fontSize: 16 }]}
            >
              العناصر:
            </Text>
            {invoice.items.map((item, index) => (
              <View key={item.id || index} style={styles.itemContainer}>
                <Text style={styles.itemDescription}>{item.description}</Text>
                <View
                  style={{
                    flexDirection: "row-reverse",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={styles.itemDetail}>الكمية: {item.quantity}</Text>
                  <Text style={styles.itemDetail}>
                    سعر الوحدة: {item.unitPrice.toLocaleString()} د.ع
                  </Text>
                </View>
                <Text
                  style={[styles.itemDetail, { fontWeight: "bold", textAlign: "left" }]}
                >
                  إجمالي العنصر: {item.totalPrice.toLocaleString()} د.ع
                </Text>
              </View>
            ))}
            {invoice.notes && (
              <>
                <Text
                  style={[
                    styles.label,
                    { marginTop: 16, marginBottom: 4, fontSize: 16 },
                  ]}
                >
                  ملاحظات:
                </Text>
                <Text
                  style={[
                    styles.itemDetail,
                    { backgroundColor: "#F8F9FA", padding: 10, borderRadius: 6 },
                  ]}
                >
                  {invoice.notes}
                </Text>
              </>
            )}


          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export { InvoiceForm, InvoiceList };

