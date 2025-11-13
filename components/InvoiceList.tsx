import { Feather } from "@expo/vector-icons"; // Using Feather icons
import { Checkbox } from "expo-checkbox";
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
import firestore from "@react-native-firebase/firestore";
import { useRouter } from 'expo-router'; // Add this import
import CustomDropdown from "./ui/CustomDropdown";

// --- HELPER FUNCTION & CONSTANTS ---
// This function is part of the UI layer as it directly renders UI elements.
// It is modified to use the new design system styles and component structures.
interface RenderItemSpecificFieldsProps {
  currentItem: Partial<InvoiceItem>;
  setCurrentItem: React.Dispatch<React.SetStateAction<Partial<InvoiceItem>>>;
  invoiceSettings: InvoiceSettings;
  // customCableLength removed
  // handleCustomCableLengthInputChange removed
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

              <Text style={styles.label}>نوع الكيبل المستخدم</Text>
              <CustomDropdown
                selectedValue={
                  typeof currentItem.cableLength === "string"
                    ? currentItem.cableLength
                    : undefined
                }
                onValueChange={handleCableLengthChange}
                placeholder="اختر نوع الكيبل..."
                items={[
                  ...invoiceSettings.cableLengths
                    .filter((cl: CableLength) => cl.isActive && !cl.isCustom)
                    .map((cl: CableLength) => ({
                      label: cl.name || `${cl.length} متر`,
                      value: cl.name || `${cl.length} متر`,
                    })),
                ]}
              />
              {/* Custom cable length input removed */}
 
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
                  <Text style={styles.label}>نوع الكيبل</Text>
                  <CustomDropdown
                    selectedValue={
                      typeof currentItem.cableLength === "string"
                        ? currentItem.cableLength
                        : undefined
                    }
                    onValueChange={handleCableLengthChange}
                    placeholder="اختر نوع الكيبل..."
                    items={[
                      ...invoiceSettings.cableLengths
                        .filter((cl: CableLength) => cl.isActive && !cl.isCustom)
                        .map((cl: CableLength) => ({
                          label:
                            cl.name ||
                            `${cl.length} متر (${cl.price.toLocaleString()} د.ع)`,
                          value: cl.name || `${cl.length} متر`,
                        })),
                    ]}
                  />
                  {/* Custom cable length input removed */}
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
                          <Text style={styles.checkboxLabel}>{`${ct.name
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
                        label: `${dm.name
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

interface InvoiceListProps {
  invoiceIds?: string[];
  ticketId: string;
  subscriberId?: string;
  onInvoiceAdded: () => void;
}

function InvoiceForm({
  ticketId,
  subscriberId: propSubscriberId,
  onCancel,
  onSuccess,
}: InvoiceFormProps) {
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
        gap: 5,
        marginBottom: 15
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
        backgroundColor: "green"
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

  // const [customCableLength, setCustomCableLength] = useState(""); // Removed custom cable length
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
        { id: "cl1", name: "كيبل 30 متر", length: 30, price: 10000, isActive: true },
        { id: "cl2", name: "كيبل 50 متر", length: 50, price: 10000, isActive: true },
        { id: "cl14", name: "كيبل مخصص", length: 0, price: 16000, isCustom: true, isActive: true },
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
        const serviceRequestRef = firestore().collection("serviceRequests").doc(ticketId);
        let serviceRequestSnap = await serviceRequestRef.get();

        let collectionName = "serviceRequests";
        if (!serviceRequestSnap.exists()) {
          const newServiceRequestRef = firestore().collection("newserviceRequests").doc(ticketId);
          serviceRequestSnap = await newServiceRequestRef.get();
          if (serviceRequestSnap.exists()) {
            collectionName = "newserviceRequests";
          }
        }
        setTicketCollectionName(collectionName);

        if (serviceRequestSnap.exists()) {
          const data = serviceRequestSnap.data() as ServiceRequest;
          const request: ServiceRequest = {
            onLocation: data.onLocation || false,
            id: data.id || ticketId,
            customerId: data.customerId || "",
            customerName: data.customerName || "",
            customerEmail: data.customerEmail || "",
            customerPhone: data.customerPhone || "",
            title: data.title || "",
            description: data.description || "",
            type: data.type || "مشكلة",
            status: data.status || "مفتوح",
            priority: data.priority || "متوسطة",
            date: data.date || (data.createdAt ? data.createdAt.toDate().toISOString() : "") || "",
            createdAt: data.createdAt,
            lastUpdated:
              data.lastUpdated || (data.createdAt ? data.createdAt.toDate().toISOString() : "") || data.date || "",
            assignedUsers: data.assignedUsers || [],
            attachments: data.attachments || [],
            comments: data.comments || [],
            creatorId: data.creatorId || "",
            creatorName: data.creatorName || "",
            subscribers: data.subscribers || [],
            subscriberId: data.subscriberId || null,
            invoiceIds: data.invoiceIds || [],
            userResponses: data.userResponses || [],
            completionTimestamp: data.completionTimestamp,
            onLocationTimestamp: data.onLocationTimestamp,
            estimatedTime: data.estimatedTime,
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
        const settingsQuery = firestore().collection("invoice-settings")
          .where("teamId", "==", currentUserTeamId);
        const settingsSnap = await settingsQuery.get();

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
          maintenanceType: defaultMaintenanceId,
          description: "صيانة مشترك",
          unitPrice: maintenanceTypeSetting.basePrice,
          totalPrice: maintenanceTypeSetting.basePrice,
        };
      }
    }

    setCurrentItem(initialItemState);
  }, [invoiceSettings]);

  // Custom cable length input handler removed

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

    // We now treat cableLength as a NAME/label string, not numeric length.
    const cable = invoiceSettings.cableLengths.find(
      (cl) => cl.name === value
    );

    // For new customer installation:
    // - Store the selected cable NAME only (no price logic here).
    if (currentItem.type === "newCustomerInstallation") {
      setCurrentItem((prev) => ({
        ...prev,
        cableLength: cable?.name || value,
      }));
      return;
    }

    // For maintenance cable replacement:
    // - Use cable NAME for cableLength (for display/record),
    // - Use cable.basePrice (if available) for unitPrice/totalPrice.
    if (currentItem.type === "maintenance") {
      let unitPrice = currentItem.unitPrice || 0;
      if (cable) {
        unitPrice = cable.price || 0;
      }

      setCurrentItem((prev) => ({
        ...prev,
        cableLength: cable?.name || value,
        unitPrice,
        totalPrice: unitPrice * (prev.quantity || 1),
      }));
      return;
    }

    // Default fallback (other types should not normally use cable):
    setCurrentItem((prev) => ({
      ...prev,
      cableLength: cable?.name || value,
    }));
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
    console.log("DEBUG: Adding item to invoice...");

    if (!invoiceSettings) {
      Toast.show({ type: "error", text1: "الإعدادات غير محملة" });
      return;
    }
    try {
      if (!currentItem.type || !currentItem.description) {
        Alert.alert("خطأ", "الرجاء إدخال نوع العنصر والوصف");
        return;
      }

      console.log("DEBUG: Current item to add:", currentItem);

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
      if (typeof currentItem.cableLength === "string") {
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

      console.log("DEBUG: Created new invoice item:", newItem);
      setItems([...items, newItem]);
      resetItemForm();
      setShowItemForm(false);

      console.log("DEBUG: Item added successfully. Current items:", [...items, newItem]);
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
      console.log("DEBUG: Fetching user stock...");

      if (!user?.uid || !db) {
        console.log("DEBUG: No user or db instance, setting userStock to null");
        setUserStock(null);
        setLoadingUserStock(false);
        return;
      }

      setLoadingUserStock(true);
      try {
        const userQuery = firestore().collection("users").where("uid", "==", user.uid);
        const querySnapshot = await userQuery.get();

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
          console.log("DEBUG: Found user stock items:", foundStockItems);
        } else {
          console.log("DEBUG: No user document found for UID:", user.uid);
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

    // Only fetch if user object has a stable uid
    if (user?.uid) {
      fetchUserStock();
    }
  }, [user?.uid]); // Depend only on user.uid, not the entire user object

  const checkStockForItem = useCallback(
    (
      item: InvoiceItem
    ): { type: string; name: string; required: number; available: number }[] => {
      if (!userStock || !invoiceSettings) return [];
      if (!item) return [];

      console.log("DEBUG: Checking stock for item:", item);
      console.log("DEBUG: Current user stock items:", userStock.items);

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
        // Cable: reduce ONE unit of the specific selected cable for this item.
        if (item.cableLength && typeof item.cableLength === "string") {
          const cableByName = invoiceSettings.cableLengths.find(
            (cl) => cl.name === item.cableLength
          );
          if (cableByName) {
            requiredStockItems.push({
              type: "cableLength",
              id: cableByName.id,
              name: cableByName.name || "كيبل",
              quantity: 1,
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
          typeof item.cableLength === "string"
        ) {
          // Maintenance cable replacement: require ONE unit of the selected cable length
          const cableByName = invoiceSettings.cableLengths.find(
            (cl) => cl.name === item.cableLength
          );
          if (cableByName) {
            requiredStockItems.push({
              type: "cableLength",
              id: cableByName.id,
              name: cableByName.name || "كيبل",
              quantity: 1,
            });
          }
        }
      }

      if (requiredStockItems.length === 0) {
        console.log("DEBUG: No required stock items for this item");
        return [];
      }

      console.log("DEBUG: Required stock items for comparison:", requiredStockItems);

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

        console.log(`DEBUG: Comparing ${required.name} - Required: ${required.quantity}, Available: ${available}`);

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
    [userStock, invoiceSettings]
  );

  const validateUserStock = useCallback((): {
    type: string;
    name: string;
    required: number;
    available: number;
  }[] => {
    console.log("DEBUG: Validating user stock...");

    if (!userStock || userStock.items.length === 0) {
      console.log("DEBUG: No user stock found or user stock is empty");

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

    console.log("DEBUG: User stock found, validating items...");
    console.log("DEBUG: Current invoice items:", items);

    const allMissingItems: {
      type: string;
      name: string;
      required: number;
      available: number;
    }[] = [];

    for (const item of items) {
      console.log("DEBUG: Validating item:", item);
      const missingForThisItem = checkStockForItem(item);
      console.log("DEBUG: Missing items for this item:", missingForThisItem);

      if (missingForThisItem.length > 0) {
        allMissingItems.push(...missingForThisItem);
      }
    }

    console.log("DEBUG: All missing items:", allMissingItems);
    return allMissingItems;
  }, [items, userStock, checkStockForItem, loadingUserStock]);

  const reduceUserStock = async (invoice: Invoice): Promise<boolean> => {
    console.log("DEBUG: Reducing user stock for invoice:", invoice);

    if (!userStock || !user?.uid || !invoiceSettings || !db) {
      console.log("DEBUG: Missing required data for stock reduction");
      console.log("DEBUG: userStock:", !!userStock, "user?.uid:", !!user?.uid, "invoiceSettings:", !!invoiceSettings, "db:", !!db);
      return false;
    }

    try {
      const updatedStockItems: UserStockItem[] = JSON.parse(
        JSON.stringify(userStock.items)
      );
      const stockTransactions: StockTransaction[] = [];
      const timestamp = new Date().toISOString();

      console.log("DEBUG: Current stock items before reduction:", updatedStockItems);

      for (const item of invoice.items) {
        console.log("DEBUG: Processing invoice item for stock reduction:", item);

        if (
          [
            "transportationFee",
            "expenseReimbursement",
            "customItem",
            "subscriptionRenewal",
          ].includes(item.type)
        ) {
          console.log("DEBUG: Skipping stock reduction for item type:", item.type);
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
          if (typeof item.cableLength === "number") {
            cableLengthToReduce = item.cableLength;
          }
          if (cableLengthToReduce > 0) {
            // Reduce ONE unit of the specific cable length selected for this item.
            const cableLengthSetting = invoiceSettings.cableLengths.find(
              (cl) => cl.length === cableLengthToReduce
            );
            const cableId = cableLengthSetting?.id || "FIBER_CABLE_METERS";
            const cableName = cableLengthSetting?.name || "كيبل";
            requiredStockDetails.push({
              type: "cableLength",
              id: cableId,
              name: cableName,
              quantity: 1,
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
          // CableReplacement: reduce ONE unit of the specific selected cable
          if (
            item.maintenanceType === "cableReplacement" &&
            item.cableLength &&
            typeof item.cableLength === "string"
          ) {
            const cableByName = invoiceSettings.cableLengths.find(
              (cl) => cl.name === item.cableLength
            );
            if (cableByName) {
            requiredStockDetails.push({
              type: "cableLength",
              id: cableByName.id,
              name: cableByName.name || "كيبل",
              quantity: 1,
            });
          }
          }
        }

        for (const required of requiredStockDetails) {
          console.log("DEBUG: Reducing stock for:", required);

          const existingItemIndex = updatedStockItems.findIndex(
            (si) =>
              si.itemType === required.type && si.itemId === required.id
          );

          if (existingItemIndex !== -1) {
            console.log(`DEBUG: Found item in stock. Current quantity: ${updatedStockItems[existingItemIndex].quantity}`);
            // Allow stock to go negative when consuming more than available
            updatedStockItems[existingItemIndex].quantity -= required.quantity;
            updatedStockItems[existingItemIndex].lastUpdated = timestamp;
            console.log(`DEBUG: New quantity: ${updatedStockItems[existingItemIndex].quantity}`);
          } else {
            // If no existing stock item, create one starting from negative quantity.
            console.warn(
              `No stock item found for ${required.name} (ID: ${required.id}). Creating negative stock entry.`
            );
            updatedStockItems.push({
              id: uuidv4(),
              itemType: required.type,
              itemId: required.id,
              itemName: required.name,
              quantity: -required.quantity,
              lastUpdated: timestamp,
            });
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
            notes: `تم استخدام في فاتورة للعميل ${invoice.customerName || "غير معروف"
              } (تذكرة #${invoice.linkedServiceRequestId.substring(0, 6)})`,
          });
        }
      }

      console.log("DEBUG: Updated stock items after reduction:", updatedStockItems);
      console.log("DEBUG: Stock transactions to be created:", stockTransactions);

      if (stockTransactions.length > 0) {
        const userQueryRef = firestore().collection("users")
          .where("uid", "==", user.uid);
        const querySnapshot = await userQueryRef.get();

        if (!querySnapshot.empty) {
          await querySnapshot.docs[0].ref.update({
            stockItems: updatedStockItems,
            lastUpdated: timestamp,
          });
          console.log("DEBUG: Successfully updated user stock in database");
        } else {
          console.warn(
            `User document not found for UID: ${user.uid}. Stock not updated.`
          );
        }

        for (const transaction of stockTransactions) {
          await firestore().collection("stockTransactions").doc(transaction.id).set(transaction);
        }
        console.log("DEBUG: Successfully created stock transactions");
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
    // Add guards to prevent unnecessary updates
    if (
      !invoiceSettings ||
      !currentItem ||
      currentItem.type !== "maintenance" ||
      currentItem.maintenanceType !== "connectorReplacement" ||
      !Array.isArray(currentItem.connectorType) ||
      currentItem.connectorType.length === 0
    ) {
      return;
    }

    const connectorCount = currentItem.connectorType.length;
    let price = 0;

    // Calculate price only if needed
    if (connectorCount > 0) {
      price = currentItem.connectorType.reduce((total, ctName) => {
        const connectorSetting = invoiceSettings.connectorTypes.find(
          (ct) => ct.name === ctName
        );
        return total + (connectorSetting?.price || 0);
      }, 0);
    }

    // Only update if the price actually changed
    if (currentItem.unitPrice !== price) {
      setCurrentItem((prev) => ({
        ...prev,
        unitPrice: price,
        totalPrice: price * (prev.quantity || 1),
      }));
    }
  }, [
    currentItem?.type,
    currentItem?.maintenanceType,
    currentItem?.connectorType?.length,
    invoiceSettings
  ]);

  const handleSaveInvoice = async () => {
    console.log("DEBUG: Saving invoice...");

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

    console.log("DEBUG: Validating user stock...");
    const missingStockItems = validateUserStock();
    console.log("DEBUG: Stock validation result:", missingStockItems);

    if (missingStockItems.length > 0) {
      setMissingItems(missingStockItems);
      setStockCheckFailed(true);

      const isFatalError = missingStockItems.some(
        (item) => item.type === "general"
      );

      if (isFatalError) {
        console.log("DEBUG: Fatal stock error, aborting save");
        return; // Abort saving for fatal error (no stock at all)
      }
      // For non-fatal errors (insufficient stock), the modal will show, but we proceed.
      console.log("DEBUG: Non-fatal stock error, proceeding with save");
    } else {
      setStockCheckFailed(false);
      setMissingItems([]);
      console.log("DEBUG: Stock validation passed");
    }

    setSubmitting(true);

    try {
      console.log("DEBUG: Serializing invoice items...");
      const serializedItems: InvoiceItem[] = items.map((item) => {
        console.log("DEBUG: Processing item:", item);

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

        console.log("DEBUG: Serialized item:", serializedItem);
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
          typeof propSubscriberId === "string"
            ? propSubscriberId
            : serviceRequest?.subscriberId || serviceRequest?.customerId,
      };

      console.log("DEBUG: Created new invoice:", newInvoice);

      const stockReduced = await reduceUserStock(newInvoice);
      // If stock reduction failed (e.g., due to an unexpected error during the process,
      // not due to initial validation which might allow proceeding with warning), then stop.
      if (!stockReduced) {
        setSubmitting(false);
        // Toast message is shown within reduceUserStock on error
        console.log("DEBUG: Stock reduction failed, aborting invoice save");
        return;
      }

      console.log("DEBUG: Stock reduction successful, saving invoice to database");

      const invoiceRef = firestore().collection("invoices").doc(newInvoice.id);
      await invoiceRef.set(newInvoice);

      const ticketRef = firestore().collection(ticketCollectionName).doc(ticketId);
      await ticketRef.update({
        invoiceIds: firestore.FieldValue.arrayUnion(newInvoice.id),
        lastUpdated: new Date().toISOString(),
      });

      const comment: Comment = {
        id: `comment_${Date.now()}`,
        userId: user?.uid || "",
        userName: currentUserDisplayName || user?.displayName || "",
        content: `تم إنشاء فاتورة جديدة بقيمة ${calculateTotal().toLocaleString()} دينار عراقي.`,
        timestamp: new Date().toISOString(),
        isStatusChange: true
      };
      await ticketRef.update({ comments: firestore.FieldValue.arrayUnion(comment) });

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
        style={{ flex: 1 }}
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
                    key={item.id || `form-item-${index}`}
                    style={[
                      styles.itemRow,
                      index === items.length - 1 && styles.itemRowLast,
                    ]}
                  >
                    <View style={styles.itemRowDetails}>
                      <Text style={styles.itemDescription}>{item.description}</Text>
                      <Text style={styles.itemMeta}>
                        {`الكمية: ${item.quantity
                          }  ·  السعر: ${item.unitPrice.toLocaleString()} د.ع`}
                      </Text>
                      {/* Display cable info by name if present */}
                      {item.cableLength && (
                        <Text style={styles.itemDetail}>
                          نوع الكيبل: {item.cableLength}
                        </Text>
                      )}
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
        statusBarTranslucent={Platform.OS === 'android'}

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
                      <View key={`${item.type}-${item.name}-${index}`} style={styles.missingItemCard}>
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
              ]}
              onPress={closeMissingItemsDialog}
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
      gap: 5,
      marginBottom: 15
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
      backgroundColor: "green"
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
  invoiceIds?: string[];
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

const InvoiceList: React.FC<InvoiceListProps> = ({ ticketId, subscriberId, onInvoiceAdded, invoiceIds = [] }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);
  const { userdoc } = usePermissions();
  const router = useRouter(); // Add router hook

  useEffect(() => {
    const fetchInvoices = async () => {
      const ids = invoiceIds || [];
      if (ids.length === 0) {
        setInvoices([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const invoicePromises = ids.map((id) =>
          firestore().collection("invoices").doc(id).get()
        );
        const invoiceSnaps = await Promise.all(invoicePromises);
        const invoicesData = invoiceSnaps
          .filter((snap) => snap.exists)
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
              // Update the onPress handler to navigate to the new invoice details page
              onPress={() => router.push(`/invoices/${invoice.id}` as any)}
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
                <View key={item.id || `item-${index}`} style={styles.itemContainer}>
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
                  {/* Display cable info by name if present */}
                  {item.cableLength && (
                    <Text style={styles.itemDetail}>
                      نوع الكيبل: {item.cableLength}
                    </Text>
                  )}
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

