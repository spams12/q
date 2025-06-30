import { Feather } from "@expo/vector-icons"; // Using Feather icons
import Checkbox from "expo-checkbox";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { Theme, useTheme } from "@/context/ThemeContext";
import useFirebaseAuth from "@/hooks/use-firebase-auth";
import { db } from "@/lib/firebase";
import {
  CableLength,
  Comment,
  ConnectorType,
  DeviceModel,
  Invoice,
  InvoiceItem,
  InvoiceSettings,
  PackageType,
  ServiceRequest,
  StockTransaction,
  UserStock,
  UserStockItem
} from "@/lib/types";
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
import InvoiceDetails from "./InvoiceDetails";
import CustomDropdown from "./ui/CustomDropdown";

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
  styles: ReturnType<typeof getStyles>;
  theme: Theme;
}

const RenderItemSpecificFields: React.FC<RenderItemSpecificFieldsProps> =
  React.memo(
    ({
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
      theme, // Pass colors down for consistency
    }) => {
      if (!invoiceSettings) return null;

      switch (currentItem.type) {
        case "newCustomerInstallation":
          return (
            <>
              <Text style={styles.label}>نوع الباقة</Text>
              <CustomDropdown
                selectedValue={currentItem.packageType}
                onValueChange={(itemValue) => handlePackageTypeChange(itemValue)}
                placeholder="اختر نوع الباقة..."
                items={invoiceSettings.packageTypes
                  .filter((pt: PackageType) => pt.isActive)
                  .map((pt: PackageType) => ({
                    label: `${pt.name} (${pt.price.toLocaleString()} د.ع)`,
                    value: pt.name,
                  }))}
              />

              <Text style={styles.label}>طول الكيبل المستخدم</Text>
              <CustomDropdown
                selectedValue={currentItem.cableLength?.toString()}
                onValueChange={handleCableLengthChange}
                placeholder="اختر طول الكيبل..."
                items={[
                  ...invoiceSettings.cableLengths
                    .filter((cl: CableLength) => cl.isActive && !cl.isCustom)
                    .map((cl: CableLength) => ({
                      label: `${cl.length} متر`,
                      value: cl.length.toString(),
                    })),
                  ...(invoiceSettings.cableLengths.some(
                    (cl: CableLength) => cl.isCustom && cl.isActive
                  )
                    ? [{ label: "طول مخصص", value: "custom" }]
                    : []),
                ]}
              />
              {currentItem.cableLength === "custom" && (
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="أدخل الطول بالمتر"
                  value={customCableLength}
                  onChangeText={handleCustomCableLengthInputChange}
                  placeholderTextColor={theme.placeholder}
                />
              )}

              <Text style={styles.label}>جهاز الاستقبال</Text>
              <CustomDropdown
                selectedValue={currentItem.deviceModel}
                onValueChange={handleDeviceModelChange}
                placeholder="اختر نوع الجهاز..."
                items={invoiceSettings.deviceModels
                  .filter((dm: DeviceModel) => dm.isActive)
                  .map((dm: DeviceModel) => ({
                    label: dm.name,
                    value: dm.name,
                  }))}
              />

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
                        color={theme.primary}
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
                      setCurrentItem({
                        ...currentItem,
                        numHooks: parseInt(val) || 0,
                      })
                    }
                    placeholderTextColor={theme.placeholder}
                  />
                </View>
                <View style={styles.inlineInput}>
                  <Text style={styles.label}>عدد الشناطات</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={currentItem.numBags?.toString() || "0"}
                    onChangeText={(val) =>
                      setCurrentItem({
                        ...currentItem,
                        numBags: parseInt(val) || 0,
                      })
                    }
                    placeholderTextColor={theme.placeholder}
                  />
                </View>
              </View>
            </>
          );
        case "maintenance":
          return (
            <>
              <Text style={styles.label}>نوع الصيانة</Text>
              <CustomDropdown
                selectedValue={currentItem.maintenanceType}
                onValueChange={handleMaintenanceTypeChange}
                placeholder="اختر نوع الصيانة..."
                items={[
                  { label: "استبدال كابل", value: "cableReplacement" },
                  { label: "استبدال كونيكتر", value: "connectorReplacement" },
                  { label: "استبدال جهاز", value: "deviceReplacement" },
                ]}
              />

              {currentItem.maintenanceType === "cableReplacement" && (
                <>
                  <Text style={styles.label}>طول الكيبل</Text>
                  <CustomDropdown
                    selectedValue={currentItem.cableLength?.toString()}
                    onValueChange={handleCableLengthChange}
                    placeholder="اختر طول الكيبل..."
                    items={[
                      ...invoiceSettings.cableLengths
                        .filter((cl: CableLength) => cl.isActive && !cl.isCustom)
                        .map((cl: CableLength) => ({
                          label: `${
                            cl.length
                          } متر (${cl.price.toLocaleString()} د.ع)`,
                          value: cl.length.toString(),
                        })),
                      ...(invoiceSettings.cableLengths.some(
                        (cl: CableLength) => cl.isCustom && cl.isActive
                      )
                        ? [{ label: "طول مخصص", value: "custom" }]
                        : []),
                    ]}
                  />
                  {currentItem.cableLength === "custom" && (
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      placeholder="أدخل الطول بالمتر"
                      value={customCableLength}
                      onChangeText={handleCustomCableLengthInputChange}
                      placeholderTextColor={theme.placeholder}
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
                            color={theme.primary}
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
                  <CustomDropdown
                    selectedValue={currentItem.deviceModel}
                    onValueChange={handleDeviceModelChange}
                    placeholder="اختر نوع الجهاز..."
                    items={invoiceSettings.deviceModels
                      .filter((dm: DeviceModel) => dm.isActive)
                      .map((dm: DeviceModel) => ({
                        label: `${
                          dm.name
                        } (${dm.price.toLocaleString()} د.ع)`,
                        value: dm.name,
                      }))}
                  />
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
                    placeholderTextColor={theme.placeholder}
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
                    placeholderTextColor={theme.placeholder}
                  />
                </>
              )}
            </>
          );
        case "subscriptionRenewal":
          return (
            <>
              <Text style={styles.label}>نوع الاشتراك</Text>
              <CustomDropdown
                selectedValue={currentItem.packageType}
                onValueChange={handlePackageTypeChange}
                placeholder="اختر نوع الاشتراك..."
                items={invoiceSettings.packageTypes
                  .filter((pt: PackageType) => pt.isActive)
                  .map((pt: PackageType) => ({
                    label: `${pt.name} (${pt.price.toLocaleString()} د.ع)`,
                    value: pt.name,
                  }))}
              />
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
                placeholderTextColor={theme.placeholder}
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
                placeholderTextColor={theme.placeholder}
              />
            </>
          );
        default:
          return null;
      }
    }
  );

RenderItemSpecificFields.displayName = "RenderItemSpecificFields";

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
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);
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
    (
      item: InvoiceItem
    ): { type: string; name: string; required: number; available: number }[] => {
      if (!userStock || !invoiceSettings) return [];
      if (!item) return [];

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

      if (requiredStockItems.length === 0) return [];

      const currentMissing: {
        type: string;
        name: string;
        required: number;
        available: number;
      }[] = [];
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

      return currentMissing;
    },
    [userStock, invoiceSettings, customCableLength]
  );

  const validateUserStock = useCallback((): {
    type: string;
    name: string;
    required: number;
    available: number;
  }[] => {
    if (!userStock || userStock.items.length === 0) {
      if (!loadingUserStock) {
        return [
          {
            type: "general",
            name: "لا يوجد مخزون مخصص أو المستخدم لم يقم بتسجيل الدخول",
            required: 0,
            available: 0,
          },
        ];
      }
      return [];
    }

    const allMissingItems: {
      type: string;
      name: string;
      required: number;
      available: number;
    }[] = [];
    for (const item of items) {
      const missingForThisItem = checkStockForItem(item);
      if (missingForThisItem.length > 0) {
        allMissingItems.push(...missingForThisItem);
      }
    }

    return allMissingItems;
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

    const missingStockItems = validateUserStock();

    if (missingStockItems.length > 0) {
      setMissingItems(missingStockItems);
      setStockCheckFailed(true);

      const isFatalError = missingStockItems.some(
        (item) => item.type === "general"
      );
      if (isFatalError) {
        return; // Abort saving for fatal error (no stock at all)
      }
      // For non-fatal errors (insufficient stock), the modal will show, but we proceed.
    } else {
      setStockCheckFailed(false);
      setMissingItems([]);
    }

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
        isStatusChange:true
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

  // --- REDESIGNED COMPONENT ---
  // This is the main JSX return block for your component.
  // It uses the new styles and maintains all original props and logic hooks.
  const closeMissingItemsDialog = () => {
    setStockCheckFailed(false);
  };

  if (loadingSettings || loadingServiceRequest || loadingUserStock) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingText}>جاري تحميل البيانات...</Text>
      </View>
    );
  }
  if (!invoiceSettings) {
    return (
      <View style={styles.centered}>
        <Feather name="alert-triangle" size={48} color={theme.destructive} />
        <Text style={styles.errorText}>لم نتمكن من تحميل إعدادات الفاتورة.</Text>
        <Text style={styles.errorSubText}>الرجاء المحاولة مرة أخرى.</Text>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.buttonSecondary,
            pressed && styles.buttonSecondaryPressed,
          ]}
          onPress={onCancel}
        >
          <Feather name="arrow-right" size={18} color={theme.white} />
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
      <KeyboardAvoidingView
      style={{flex:1}}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}

      >
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
            {!showItemForm && (
              <Pressable
                onPress={() => setShowItemForm(true)}
                style={({ pressed }) => [
                  styles.button,
                  styles.buttonPrimary,
                  pressed && styles.buttonPrimaryPressed,
                ]}
              >
                <Feather name="plus" size={18} color={theme.white} />
                <Text style={styles.buttonText}>إضافة عنصر</Text>
              </Pressable>
            )}
        </View>
             <View style={styles.footer}>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [
            styles.button,
            styles.buttonSecondary,
            pressed && styles.buttonSecondaryPressed,
          ]}
        >
          <Text style={styles.buttonText}>إلغاء</Text>
        </Pressable>
        <Pressable
          onPress={handleSaveInvoice}
          disabled={items.length === 0 || submitting}
          style={({ pressed }) => [
            styles.button,
            styles.buttonLarge,
            (items.length === 0 || submitting) && styles.buttonDisabled,
            pressed &&
              !(items.length === 0 || submitting) &&
              styles.buttonPrimaryPressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={theme.white} />
          ) : (
            <>
              <Feather name="save" size={20} color={theme.white} />
              <Text style={styles.buttonText}>حفظ الفاتورة</Text>
            </>
          )}
        </Pressable>
      </View>

      {items.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>عناصر الفاتورة</Text>
          </View>

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
                  <Text style={styles.itemDescription}>{item.description}</Text>
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
                  onPress={() => removeItem(item.id)}
                  style={styles.deleteButton}
                >
                  <Feather name="x" size={20} color={theme.placeholder} />
                </Pressable>
              </View>
            ))}
          </View>

          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>المجموع الكلي</Text>
            <Text style={styles.totalValue}>
              {calculateTotal().toLocaleString()} د.ع
            </Text>
          </View>
        </View>
      )}

      {showItemForm && (
        <View style={[styles.card, styles.itemFormCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>إضافة عنصر جديد</Text>
            <Pressable onPress={cancelItemForm} style={styles.cancelButton}>
              <Feather name="x" size={22} color={theme.placeholder} />
            </Pressable>
          </View>
          <Text style={styles.label}>نوع العنصر</Text>
          <CustomDropdown
            selectedValue={currentItem.type}
            onValueChange={(itemValue) => handleItemTypeChange(itemValue)}
            placeholder="اختر نوع العنصر..."
            items={[
              { label: "تنصيب مشترك جديد", value: "newCustomerInstallation" },
              { label: "صيانة مشترك", value: "maintenance" },
              { label: "نقليات", value: "transportationFee" },
              { label: "صرفيات", value: "expenseReimbursement" },
              { label: "تجديد اشتراك", value: "subscriptionRenewal" },
              { label: "عنصر مخصص", value: "customItem" },
            ]}
          />

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
            theme={theme}
          />

          <View style={styles.formActions}>
            <Pressable
              onPress={addItem}
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
                color={theme.white}
              />
              <Text style={styles.buttonText}>إضافة العنصر للفاتورة</Text>
            </Pressable>
          </View>
        </View>
      )}
     </ScrollView>


      </KeyboardAvoidingView>

     

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
              <Feather name="alert-triangle" size={28} color={theme.destructive} />
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
              onPress={closeMissingItemsDialog}
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
const getStyles = (theme: Theme, themeName: "light" | "dark") =>
  StyleSheet.create({
    // --- Layout & Structure ---
    container: {
      flex: 1,
      backgroundColor: theme.background,
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
      backgroundColor: theme.background,
    },
    footer: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      alignItems: "center",
      borderTopColor: theme.border,
      gap:5,
      marginBottom:15
    },

    // --- Header ---
    header: {
      marginBottom: 5,
    },
    headerTitle: {
      fontSize: 32,
      fontWeight: "bold",
      color: theme.text,
      textAlign: "right",
    },
    headerSubtitle: {
      fontSize: 17,
      color: theme.textSecondary,
      textAlign: "right",
      marginTop: 4,
    },

    // --- Card ---
    card: {
      backgroundColor: theme.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 20,
      ...(themeName === "dark"
        ? {
            borderWidth: 1,
            borderColor: theme.border,
          }
        : {
            shadowColor: theme.black,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 12,
            elevation: 3,
          }),
    },
    itemFormCard: {
      borderColor: theme.primary,
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
      color: theme.text,
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
      backgroundColor:"green"
    },
    buttonFullWidth: {
      width: "100%",
    },
    buttonText: {
      color: theme.white,
      fontSize: 16,
      fontWeight: "600",
    },
    buttonPrimary: { backgroundColor: theme.primary },
    buttonPrimaryPressed: { opacity: 0.8 },
    buttonSecondary: { backgroundColor: theme.textSecondary },
    buttonSecondaryPressed: { opacity: 0.8 },
    buttonDisabled: { backgroundColor: theme.placeholder, opacity: 0.7 },
    cancelButton: { padding: 4 },
    deleteButton: { padding: 8 },

    // --- Forms & Inputs ---
    label: {
      fontSize: 15,
      fontWeight: "500",
      color: theme.textSecondary,
      marginBottom: 8,
      marginTop: 12,
      textAlign: "right",
    },
    input: {
      backgroundColor: theme.inputBackground,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === "android" ? 12 : 14,
      fontSize: 16,
      color: theme.text,
      textAlign: "right",
    },
    textArea: {
      minHeight: 100,
      textAlignVertical: "top",
    },
    pickerContainer: {
      flexDirection: "row-reverse",
      alignItems: "center",
      backgroundColor: theme.inputBackground,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
    },
    picker: {
      flex: 1,
      color: theme.text,
      borderWidth: 0, // Hide default borders
      backgroundColor: "transparent",
      height: 50,
    },
    pickerItem: {
      fontSize: 16,
      color: theme.text,
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
      color: theme.text,
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
      borderBottomColor: theme.border,
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
      color: theme.text,
      textAlign: "right",
    },
    itemMeta: {
      fontSize: 13,
      color: theme.textSecondary,
      textAlign: "right",
      marginTop: 4,
    },
    itemDetail: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: "right",
      marginBottom: 4,
    },
    itemTotal: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.text,
      minWidth: 90,
      textAlign: "left",
    },
    itemContainer: {
      backgroundColor: theme.inputBackground,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: theme.border,
    },
    totalContainer: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 16,
      marginTop: 16,
    },
    totalLabel: {
      fontSize: 17,
      fontWeight: "bold",
      color: theme.text,
    },
    totalValue: {
      fontSize: 20,
      fontWeight: "bold",
      color: theme.primary,
    },

    // --- Empty State & Loaders ---
    emptyStateContainer: {
      alignItems: "center",
      paddingVertical: 40,
    },
    emptyStateText: {
      fontSize: 17,
      color: theme.textSecondary,
      marginTop: 16,
      fontWeight: "500",
    },
    emptyStateSubText: {
      fontSize: 14,
      color: theme.placeholder,
      marginTop: 6,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: theme.textSecondary,
    },
    errorText: {
      fontSize: 20,
      fontWeight: "600",
      color: theme.text,
      textAlign: "center",
      marginTop: 16,
    },
    errorSubText: {
      fontSize: 16,
      color: theme.placeholder,
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
      backgroundColor: theme.card,
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
      color: theme.text,
    },
    modalText: {
      textAlign: "right",
      fontSize: 16,
      color: theme.textSecondary,
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
      backgroundColor: theme.background,
      borderRadius: 10,
      padding: 12,
      marginBottom: 10,
    },
    missingItemName: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
      textAlign: "right",
      marginBottom: 6,
    },
    missingItemDetails: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
    },
    missingItemDetail: {
      fontSize: 14,
      color: theme.placeholder,
    },
  });

interface InvoiceListProps {
  invoiceIds: string[];
  ticketId: string;
  subscriberId?: string;
  onInvoiceAdded: () => void;
}

const getStatusStyle = (
  status: string,
  theme: Theme,
  themeName: "light" | "dark"
) => {
  switch (status) {
    case "paid":
      return {
        color: theme.success,
        backgroundColor:
          themeName === "dark"
            ? "rgba(48, 209, 88, 0.2)"
            : "rgba(48, 209, 88, 0.1)",
        borderColor: theme.success,
      };
    case "pending":
      return {
        color: theme.statusInProgress,
        backgroundColor:
          themeName === "dark"
            ? "rgba(255, 204, 0, 0.2)"
            : "rgba(255, 204, 0, 0.1)",
        borderColor: theme.statusInProgress,
      };
    default:
      return {
        color: theme.textSecondary,
        backgroundColor: theme.inputBackground,
        borderColor: theme.border,
      };
  }
};

const InvoiceList: React.FC<InvoiceListProps> = ({
  invoiceIds,
  ticketId,
  subscriberId,
  onInvoiceAdded,
}) => {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

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

  if (selectedInvoice) {
    return (
      <Modal
        visible={!!selectedInvoice}
        animationType="slide"
        onRequestClose={() => setSelectedInvoice(null)}
      >
        <InvoiceDetails
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      </Modal>
    );
  }

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
        <ActivityIndicator size="large" color={theme.primary} />
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
          color={theme.destructive}
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
      onPress={() => setShowInvoiceForm(true)}
    >
      <Feather
        name="plus-circle"
        size={20}
        color={theme.white}
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
          color={theme.placeholder}
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
    <View style={styles.container}>
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
        {invoices.map((invoice) => {
          const statusStyle = getStatusStyle(invoice.status, theme, themeName);
          return (
            <Pressable
              key={invoice.id}
              onPress={() => setSelectedInvoice(invoice)}
              style={({ pressed }) => [
                styles.card,
                pressed && { opacity: 0.8 },
              ]}
            >
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
                    fontWeight: "bold",
                    fontSize: 14,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6,
                    overflow: "hidden",
                    borderWidth: 1,
                    ...statusStyle,
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
                  color: theme.primary,
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
                      {
                        backgroundColor: theme.inputBackground,
                        padding: 10,
                        borderRadius: 6,
                      },
                    ]}
                  >
                    {invoice.notes}
                  </Text>
                </>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

export { InvoiceForm, InvoiceList };

