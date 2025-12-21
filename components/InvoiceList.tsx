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
  BatchUsed,
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

// --- HELPERS ---

// Helper to look up Purchase & Selling Price from Main Inventory (Settings)
// This is used when the user has no stock, so we can estimate the cost and selling price.
const getFallbackPrice = (type: string, id: string, settings: InvoiceSettings & { bags?: any[], hooks?: any[] }): { purchase: number, selling: number } => {
  let collection: any[] = [];
  const s = settings as any;

  // Map invoice item types to settings arrays
  if (type === 'bag') collection = s.bags || [];
  else if (type === 'hook') collection = s.hooks || [];
  else if (type === 'cableLength') collection = s.cableLengths || [];
  else if (type === 'connectorType') collection = s.connectorTypes || [];
  else if (type === 'deviceModel') collection = s.deviceModels || [];
  else if (type === 'packageType') collection = s.packageTypes || [];

  // Find the specific item definition - try exact match first
  let itemDef = collection.find((i: any) => i.id === id || i.name === id);

  // For hooks and bags with generic IDs (STANDARD_HOOK_UNIT, BAG_ITEM_UNIT), 
  // fall back to first available item if no exact match
  if (!itemDef && (type === 'hook' || type === 'bag') && collection.length > 0) {
    // Use the first active item with batches that has a price
    itemDef = collection.find((i: any) =>
      i.isActive !== false &&
      i.batches?.length > 0 &&
      i.batches.some((b: any) => Number(b.purchasePrice) > 0)
    ) || collection[0]; // Fall back to first item if none have prices
  }

  if (!itemDef) return { purchase: 0, selling: 0 };

  // Strategy: 
  // 1. Get price from the oldest batch in main inventory that has positive quantity (> 0)
  if (itemDef.batches && Array.isArray(itemDef.batches) && itemDef.batches.length > 0) {

    // 1. Active Stock Check
    const availableBatches = itemDef.batches.filter((b: any) => Number(b.quantity) > 0);

    // Sort batches by dateAdded ascending (Oldest first)
    if (availableBatches.length > 0) {
      availableBatches.sort((a: any, b: any) =>
        new Date(a.dateAdded || 0).getTime() - new Date(b.dateAdded || 0).getTime()
      );
      const price = Number(availableBatches[0].purchasePrice);
      if (price > 0) {
        return {
          purchase: price,
          selling: Number(availableBatches[0].sellingPrice) || 0
        };
      }
    }

    // 2. History Check (if no active stock or active stock has 0 price for some reason)
    // Find the MOST RECENT batch that had a price
    const batchesWithPrice = itemDef.batches.filter((b: any) => Number(b.purchasePrice) > 0);
    if (batchesWithPrice.length > 0) {
      // Sort descending (Newest first) to get latest cost
      batchesWithPrice.sort((a: any, b: any) =>
        new Date(b.dateAdded || 0).getTime() - new Date(a.dateAdded || 0).getTime()
      );
      return {
        purchase: Number(batchesWithPrice[0].purchasePrice),
        selling: Number(batchesWithPrice[0].sellingPrice) || 0
      };
    }
  }

  // Fallback: If no batches exist or no batches have positive quantity, use root price
  return {
    purchase: Number(itemDef.purchasePrice) || Number(itemDef.price) || 0,
    selling: Number(itemDef.sellingPrice) || 0
  };
};

// Helper to calculate stock requirements for an invoice item
const getRequiredStockItems = (item: InvoiceItem, settings: InvoiceSettings & { bags?: any[], hooks?: any[] }) => {
  const reqs: { type: string, id: string, name: string, quantity: number }[] = [];
  const qty = Number(item.quantity) || 1;
  const isInstall = item.type === "newCustomerInstallation";
  const isMaint = item.type === "maintenance";

  // Connectors
  if ((isInstall || (isMaint && item.maintenanceType === "connectorReplacement")) && Array.isArray(item.connectorType)) {
    item.connectorType.forEach(n => {
      const d = settings.connectorTypes.find(c => c.name === n);
      if (d) reqs.push({ type: "connectorType", id: d.id, name: d.name, quantity: qty });
    });
  }
  // Devices
  if ((isInstall || (isMaint && item.maintenanceType === "deviceReplacement")) && item.deviceModel) {
    const d = settings.deviceModels.find(m => m.name === item.deviceModel);
    if (d) reqs.push({ type: "deviceModel", id: d.id, name: d.name, quantity: qty });
  }
  // Cables
  if ((isInstall || (isMaint && item.maintenanceType === "cableReplacement")) && item.cableLength) {
    const s = String(item.cableLength);
    const d = s.includes("مخصص")
      ? settings.cableLengths.find(c => c.isCustom || c.name === "مخصص")
      : settings.cableLengths.find(c => c.name === s);
    if (d) reqs.push({ type: "cableLength", id: d.id, name: `كيبل - ${d.name}`, quantity: qty });
  }
  // Hooks & Bags (Installation only)
  if (isInstall) {
    const s = settings as any;
    if (item.numHooks) {
      // Look up the first active hook from settings
      const hookItem = (s.hooks || []).find((h: any) => h.isActive !== false);
      if (hookItem) {
        reqs.push({ type: "hook", id: hookItem.id, name: hookItem.name, quantity: qty * Number(item.numHooks) });
      }
    }
    if (item.numBags) {
      // Look up the first active bag from settings
      const bagItem = (s.bags || []).find((b: any) => b.isActive !== false);
      if (bagItem) {
        reqs.push({ type: "bag", id: bagItem.id, name: bagItem.name, quantity: qty * Number(item.numBags) });
      }
    }
  }
  return reqs;
};

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
  // Use the same style shape as InvoiceForm's getStyles (no cableInfo here)
  styles: {
    container: any;
    contentContainer: any;
    centered: any;
    footer: any;
    header: any;
    headerTitle: any;
    headerSubtitle: any;
    card: any;
    itemFormCard: any;
    cardHeader: any;
    cardTitle: any;
    button: any;
    buttonLarge: any;
    buttonFullWidth: any;
    buttonText: any;
    buttonPrimary: any;
    buttonPrimaryPressed: any;
    buttonSecondary: any;
    buttonSecondaryPressed: any;
    buttonDisabled: any;
    cancelButton: any;
    deleteButton: any;
    label: any;
    input: any;
    textArea: any;
    pickerContainer: any;
    picker: any;
    pickerItem: any;
    pickerIcon: any;
    inlineInputContainer: any;
    inlineInput: any;
    checkboxGroupContainer: any;
    checkboxWrapper: any;
    checkboxBase: any;
    checkboxLabel: any;
    formActions: any;
    itemListContainer: any;
    itemRow: any;
    itemRowLast: any;
    itemRowDetails: any;
    itemDescription: any;
    itemMeta: any;
    itemDetail: any;
    itemTotal: any;
    itemContainer: any;
    totalContainer: any;
    totalLabel: any;
    totalValue: any;
    emptyStateContainer: any;
    emptyStateText: any;
    emptyStateSubText: any;
    loadingText: any;
    errorText: any;
    errorSubText: any;
    modalBackdrop: any;
    modalView: any;
    modalHeader: any;
    modalTitle: any;
    modalText: any;
    missingItemsScroll: any;
    missingItemCard: any;
    missingItemName: any;
    missingItemDetails: any;
    missingItemDetail: any;
  };
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
                    label: `${pt.name} (${((pt as any).firstMonthPrice || pt.price || 0).toLocaleString()} د.ع - أول شهر)`,
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
              {/* Primary maintenance kind (simple vs connector/device/cable/custom list) */}
              <Text style={styles.label}>نوع الصيانة</Text>
              <CustomDropdown
                selectedValue={currentItem.maintenanceType}
                onValueChange={handleMaintenanceTypeChange}
                placeholder="اختر نوع الصيانة..."
                items={[
                  { label: "استبدال كابل", value: "cableReplacement" },
                  { label: "استبدال كونيكتر", value: "connectorReplacement" },
                  { label: "استبدال جهاز", value: "deviceReplacement" },
                  { label: "صيانة مخصصة من القائمة", value: "customMaintenanceFromList" },
                  { label: "صيانة مخصصة يدوية", value: "customMaintenanceManual" },
                ]}
              />

              {/* When selecting from predefined maintenanceTypes list */}
              {currentItem.maintenanceType === "customMaintenanceFromList" && (
                <>
                  <Text style={styles.label}>اختر نوع الصيانة المخصصة</Text>
                  <CustomDropdown
                    selectedValue={currentItem.customMaintenanceId as any}
                    onValueChange={(value) => {
                      if (!invoiceSettings) return;
                      const mt = invoiceSettings.maintenanceTypes.find(
                        (m) => m.id === value
                      );
                      const price = mt?.basePrice || 0;
                      const description =
                        mt?.name || currentItem.description || "صيانة مخصصة";

                      setCurrentItem((prev) => ({
                        ...prev,
                        customMaintenanceId: value,
                        description,
                        unitPrice: price,
                        totalPrice: price * (prev.quantity || 1),
                      }));
                    }}
                    placeholder="اختر من أنواع الصيانة المضافة في الإعدادات..."
                    items={invoiceSettings.maintenanceTypes
                      .filter((mt) => mt.isActive)
                      .map((mt) => ({
                        label: `${mt.name} (${(mt.basePrice || 0).toLocaleString()} د.ع)`,
                        value: mt.id,
                      }))}
                  />
                </>
              )}

              {/* Existing built-in behaviors */}

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
                            `${cl.length} متر (${(cl.price || 0).toLocaleString()} د.ع)`,
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
                            } (${(ct.price || 0).toLocaleString()} د.ع)`}</Text>
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
                          } (${(dm.price || 0).toLocaleString()} د.ع)`,
                        value: dm.name,
                      }))}
                  />
                </>
              )}

              {/* Manual custom maintenance: free text + price - ALLOWING ZERO PRICING */}
              {currentItem.maintenanceType === "customMaintenanceManual" && (
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
                  <Text style={styles.label}>السعر (د.ع) - مسموح بالصفر</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={currentItem.unitPrice?.toString() || "0"}
                    onChangeText={(text) => {
                      const price = parseFloat(text) || 0;
                      setCurrentItem((prev) => ({
                        ...prev,
                        unitPrice: price,
                        totalPrice: price * (prev.quantity || 1),
                      }));
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
                    label: `${pt.name} (${(pt.price || 0).toLocaleString()} د.ع)`,
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
              <Text style={styles.label}>السعر (د.ع) - مسموح بالصفر</Text>
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
  const { userName: currentUserDisplayName, currentUserTeamId, userdoc } =
    usePermissions();

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [currentItem, setCurrentItem] = useState<
    Partial<InvoiceItem> & { customMaintenanceId?: string }
  >({
    type: "maintenance",
    description: "",
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    connectorType: [],
    maintenanceType: undefined,
    customMaintenanceId: undefined,
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
      lastUpdated: firestore.Timestamp.now(),
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
    let initialItemState: Partial<InvoiceItem> & { customMaintenanceId?: string } = {
      type: "maintenance",
      description: "",
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      connectorType: [],
      maintenanceType: undefined,
      customMaintenanceId: undefined,
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

    // Use firstMonthPrice for new customer installation, regular price for subscription renewal
    let price = packageType?.price || 0;
    let finalDescription = currentItem.description;

    if (currentItem.type === "newCustomerInstallation" && packageType) {
      // Use first month price if available, otherwise fall back to regular price
      price = (packageType as any).firstMonthPrice || packageType.price || 0;
      finalDescription = `تنصيب جديد - ${packageType.name}`;
    } else if (currentItem.type === "subscriptionRenewal" && packageType) {
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
    if (!invoiceSettings) {
      setCurrentItem((prev) => ({ ...prev, maintenanceType: value }));
      return;
    }

    // For manual custom, clear auto values and let user type
    if (value === "customMaintenanceManual") {
      setCurrentItem((prev) => ({
        ...prev,
        maintenanceType: value,
        customMaintenanceId: undefined,
        description: "",
        unitPrice: 0,
        totalPrice: 0,
      }));
      return;
    }

    // For list-based custom, do not resolve here; handled by second dropdown
    if (value === "customMaintenanceFromList") {
      setCurrentItem((prev) => ({
        ...prev,
        maintenanceType: value,
        // keep existing description/price until user chooses specific maintenance item
      }));
      return;
    }

    // For other maintenance types (including when you directly select an id from older data)
    const maintenanceTypeSetting = invoiceSettings.maintenanceTypes.find(
      (mt) => mt.id === value
    );
    const price = maintenanceTypeSetting?.basePrice || 0;
    const description =
      maintenanceTypeSetting?.name ||
      currentItem.description ||
      "صيانة مشترك";

    setCurrentItem((prev) => ({
      ...prev,
      maintenanceType: value,
      customMaintenanceId:
        value === "cableReplacement" ||
          value === "connectorReplacement" ||
          value === "deviceReplacement"
          ? undefined
          : prev.customMaintenanceId,
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
        // Use first month price if available for new customer installation
        unitPrice = (packageType as any)?.firstMonthPrice || packageType?.price || 0;
        totalPrice = unitPrice * (currentItem.quantity || 1);
      }

      // CRITICAL FIX: Complete removal of all price-based restrictions
      // Zero-priced invoices are now fully supported - no price validation
      // Users can create invoices with ANY total amount including 0
      console.log("DEBUG: Creating item with price:", { unitPrice, totalPrice });

      // Preserve cableLength exactly as selected/stored in the UI.
      // It is used for:
      //  - display in invoice
      //  - lookup by name in stock reduction (reduceUserStock)
      // Parsing to number here breaks that mapping and caused inconsistencies.
      let finalCableLength: number | string | undefined = currentItem.cableLength;

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
        let lastUpdated = firestore.Timestamp.now();

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
          lastUpdated: firestore.Timestamp.now(),
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

    // Allow invoice creation even without stock - stock will go negative
    if (!userStock || userStock.items.length === 0) {
      console.log("DEBUG: No user stock found or user stock is empty - allowing invoice creation");
      // Return empty array to allow invoice creation
      // The handleSaveInvoice will create negative stock entries as needed
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
      const timestamp = firestore.Timestamp.now();

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
          // Cable for newCustomerInstallation: treat cableLength as a NAME string and
          // reduce ONE unit of the selected cable type (to mirror checkStockForItem).
          if (item.cableLength) {
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
            userId: userdoc?.id || user.uid,
            userName:
              currentUserDisplayName || user.displayName || "N/A",
            itemType: required.type,
            itemId: required.id,
            itemName: required.name,
            quantity: required.quantity,
            type: "invoice",
            sourceId: invoice.id,
            sourceName: `فاتورة #${invoice.id}`,
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
        (prev) => {
          if (!prev) return null;
          // Convert existing lastUpdated to Timestamp if it's a string
          const updatedLastUpdated = typeof prev.lastUpdated === 'string'
            ? firestore.Timestamp.fromDate(new Date(prev.lastUpdated))
            : prev.lastUpdated;

          return {
            ...prev,
            items: updatedStockItems,
            lastUpdated: updatedLastUpdated
          };
        }
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

    console.log("DEBUG: Invoice total amount:", calculateTotal());

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
      // Deep clone user stock to work with
      const newStock = JSON.parse(JSON.stringify(userStock?.items || [])) as UserStockItem[];
      const stockTransactions: StockTransaction[] = [];
      const timestamp = new Date().toISOString();
      const ts = firestore.Timestamp.now();
      const finalItems: InvoiceItem[] = [];
      let totalPurchasePrice = 0;

      // Process each invoice item
      for (const item of items) {
        // Initialize the processed item with new fields
        const procItem: InvoiceItem = {
          id: item.id,
          type: item.type,
          description: item.description || "",
          quantity: Number(item.quantity) || 1,
          unitPrice: Number(item.unitPrice) || 0,
          totalPrice: Number(item.totalPrice) || 0,
          purchasePrice: 0,
          batchesUsed: [] as BatchUsed[],
          hasPendingStock: false,
        };

        // Copy optional fields
        if (item.packageType !== undefined) procItem.packageType = item.packageType;
        if (item.cableLength !== undefined) procItem.cableLength = item.cableLength;
        if (item.connectorType !== undefined) procItem.connectorType = item.connectorType;
        if (item.numHooks !== undefined) procItem.numHooks = Number(item.numHooks) || 0;
        if (item.numBags !== undefined) procItem.numBags = Number(item.numBags) || 0;
        if (item.maintenanceType !== undefined) procItem.maintenanceType = item.maintenanceType;
        if (item.deviceModel !== undefined) procItem.deviceModel = item.deviceModel;
        if (item.additionalNotes !== undefined) procItem.additionalNotes = item.additionalNotes;

        // Get required stock items using the helper
        const extendedSettings = invoiceSettings as InvoiceSettings & { bags?: any[], hooks?: any[] };
        const reqs = getRequiredStockItems(item, extendedSettings);
        let itemCost = 0;

        for (const req of reqs) {
          // Find item in user stock
          let sIdx = newStock.findIndex(si =>
            (req.type === 'hook' || req.type === 'bag')
              ? si.itemType === req.type
              : (si.itemType === req.type && si.itemId === req.id)
          );

          // If not in user stock list, add it (initially 0 quantity)
          if (sIdx === -1) {
            newStock.push({
              id: uuidv4(),
              itemType: req.type as any,
              itemId: req.id,
              name: req.name,
              itemName: req.name,
              quantity: 0,
              lastUpdated: timestamp,
              batches: []
            });
            sIdx = newStock.length - 1;
          }

          const sItem = newStock[sIdx];
          let qtyNeeded = req.quantity;

          // Handle Packages (Simple Qty - no batches)
          if (sItem.itemType === "packageType") {
            const available = Number(sItem.quantity) || 0;
            const fallbackPrices = getFallbackPrice(req.type, req.id, extendedSettings);
            const costPerUnit = (sItem as any).purchasePrice || fallbackPrices.purchase;

            sItem.quantity = available - qtyNeeded; // Allow negative
            itemCost += costPerUnit * qtyNeeded;

            if (available < qtyNeeded) {
              procItem.hasPendingStock = true;
            }
          } else {
            // Handle Batched Items (Complex Qty)
            if (!sItem.batches) sItem.batches = [];

            // Sort oldest to newest (FIFO)
            sItem.batches.sort((a, b) =>
              new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime()
            );

            // 1. Consume existing positive batches
            for (let i = 0; i < sItem.batches.length && qtyNeeded > 0; i++) {
              const b = sItem.batches[i];
              const avail = Number(b.quantity) || 0;

              if (avail > 0) {
                const take = Math.min(avail, qtyNeeded);
                b.quantity = avail - take;
                qtyNeeded -= take;

                const batchCost = Number(b.purchasePrice) || 0;
                itemCost += take * batchCost;

                procItem.batchesUsed?.push({
                  stockItemId: sItem.itemId,
                  stockItemName: req.name,
                  batchId: b.batchId || b.id,
                  quantity: take,
                  purchasePriceAtTime: batchCost
                });
              }
            }

            // 2. Handle Deficit (If still need quantity)
            if (qtyNeeded > 0) {
              const fallbackDetails = getFallbackPrice(req.type, req.id, extendedSettings);
              const fallbackPrice = fallbackDetails.purchase;
              const fallbackSellingPrice = fallbackDetails.selling;

              itemCost += qtyNeeded * fallbackPrice;

              procItem.batchesUsed?.push({
                stockItemId: sItem.itemId,
                stockItemName: req.name,
                batchId: "PENDING_ASSIGNMENT",
                isEstimated: true,
                quantity: qtyNeeded,
                purchasePriceAtTime: fallbackPrice
              });

              procItem.hasPendingStock = true;

              // Create/Update "DEFICIT" batch so user sees negative stock
              const deficitBatch = sItem.batches.find(b => b.batchId === "DEFICIT");
              if (deficitBatch) {
                deficitBatch.quantity = (Number(deficitBatch.quantity) || 0) - qtyNeeded;
                // Track which invoices contributed to this deficit (update notes)
                deficitBatch.notes = `عجز تلقائي - آخر تحديث: ${timestamp} - ${ticketId.substring(0, 6)}`;
              } else {
                sItem.batches.push({
                  id: uuidv4(),
                  batchId: "DEFICIT",
                  dateAdded: timestamp,
                  quantity: -qtyNeeded,
                  purchasePrice: fallbackPrice, // Store the estimated price for reference
                  sellingPrice: fallbackSellingPrice,
                  notes: `عجز تلقائي - فاتورة: ${ticketId.substring(0, 6)}`
                });
              }
            }
          }

          // Log transaction
          stockTransactions.push({
            id: uuidv4(),
            userId: userdoc?.id || user?.uid || "",
            userName: currentUserDisplayName || user?.displayName || "N/A",
            itemType: req.type as any,
            itemId: req.id,
            itemName: req.name,
            quantity: req.quantity,
            type: "invoice",
            timestamp: ts,
            notes: `فاتورة للتذكرة ${ticketId.substring(0, 6)}`
          });
        }

        // Set the calculated cost
        procItem.purchasePrice = itemCost;

        // Build final item without undefined values (Firestore doesn't accept undefined)
        const cleanItem: InvoiceItem = {
          id: procItem.id,
          type: procItem.type,
          description: procItem.description,
          quantity: procItem.quantity,
          unitPrice: procItem.unitPrice,
          totalPrice: procItem.totalPrice,
          purchasePrice: procItem.purchasePrice,
          batchesUsed: procItem.batchesUsed || [],
          hasPendingStock: procItem.hasPendingStock || false,
          connectorType: procItem.connectorType || [],
          numHooks: procItem.numHooks || 0,
          numBags: procItem.numBags || 0,
          subscriberId: procItem.subscriberId || null,
        };

        // Only add optional fields if they have values
        if (procItem.packageType) cleanItem.packageType = procItem.packageType;
        if (procItem.cableLength) cleanItem.cableLength = procItem.cableLength;
        if (procItem.maintenanceType) cleanItem.maintenanceType = procItem.maintenanceType;
        if (procItem.deviceModel) cleanItem.deviceModel = procItem.deviceModel;
        if (procItem.additionalNotes) cleanItem.additionalNotes = procItem.additionalNotes;

        finalItems.push(cleanItem);
        totalPurchasePrice += itemCost;
      }

      const invId = uuidv4();
      const invoiceNeedsStockAssignment = finalItems.some(i => i.hasPendingStock === true);

      const newInvoice: Invoice = {
        id: invId,
        linkedServiceRequestId: ticketId,
        createdBy: user?.uid || "",
        createdAt: ts,
        lastUpdated: ts,
        items: finalItems,
        totalAmount: items.reduce((s, i) => s + i.totalPrice, 0),
        purchasePrice: totalPurchasePrice,
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
        needsStockAssignment: invoiceNeedsStockAssignment,
      };

      console.log("DEBUG: Created new invoice with purchase price:", totalPurchasePrice);

      // Update user stock in database
      if (user?.uid) {
        const userQueryRef = firestore().collection("users")
          .where("uid", "==", user.uid);
        const querySnapshot = await userQueryRef.get();

        if (!querySnapshot.empty) {
          await querySnapshot.docs[0].ref.update({
            stockItems: newStock,
            lastUpdated: timestamp,
          });
          console.log("DEBUG: Successfully updated user stock in database");
        }
      }

      // Create stock transactions
      for (const transaction of stockTransactions) {
        await firestore().collection("stockTransactions").doc(transaction.id).set(transaction);
      }

      // Save invoice
      const invoiceRef = firestore().collection("invoices").doc(newInvoice.id);
      await invoiceRef.set(newInvoice);

      // Update ticket
      const ticketRef = firestore().collection(ticketCollectionName).doc(ticketId);
      await ticketRef.update({
        invoiceIds: firestore.FieldValue.arrayUnion(newInvoice.id),
        lastUpdated: firestore.Timestamp.now(),
      });

      // Add comment
      const comment: Comment = {
        id: `comment_${Date.now()}`,
        userId: user?.uid || "",
        userName: currentUserDisplayName || user?.displayName || "",
        content: `تم إنشاء فاتورة جديدة بقيمة ${(newInvoice.totalAmount || 0).toLocaleString()} دينار عراقي.`,
        timestamp: firestore.Timestamp.now(),
        isStatusChange: true
      };
      await ticketRef.update({ comments: firestore.FieldValue.arrayUnion(comment) });

      // Update local state
      setUserStock(
        (prev) => {
          if (!prev) return null;
          return {
            ...prev,
            items: newStock,
            lastUpdated: firestore.Timestamp.now()
          };
        }
      );

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

  // CRITICAL FIX: Complete removal of all price-based validation restrictions
  // Zero-priced invoices are now fully supported with complete flexibility
  const isAddItemDisabled =
    !currentItem.description ||
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
                          }  ·  السعر: ${(item.unitPrice || 0).toLocaleString()} د.ع`}
                      </Text>
                      {/* Display cable info by name if present */}
                      {item.cableLength && (
                        <Text>
                          {item.cableLength}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.itemTotal}>
                      {(item.totalPrice || 0).toLocaleString()} د.ع
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
              {(missingItems && missingItems.some((item) => item.type === "general"))
                ? "لا يوجد لديك مخزون مسجل أو المستخدم لم يقم بتسجيل الدخول. سيتم إنشاء عناصر مخزون بالسالب تلقائيًا عند خصم المواد من الفاتورة."
                : "لا يتوفر لديك مخزون كافٍ لبعض العناصر. سيتم المتابعة وإنشاء أو تحديث عناصر المخزون بالسالب لتسجيل هذا النقص."}
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
    cableInfo: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: "right",
      marginTop: 2,
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
          .filter((snap) => {
            // Only include invoices that exist AND have valid data
            if (!snap.exists) return false;
            const data = snap.data();
            // Ensure the invoice has meaningful data (at least an id or items)
            return data && (data.items || data.totalAmount !== undefined);
          })
          .map((snap) => ({ id: snap.id, ...snap.data() } as Invoice));
        setInvoices(
          invoicesData.sort(
            (a, b) => {
              let dateA: Date, dateB: Date;

              // Handle React Native Firebase Timestamp
              if (a.createdAt && typeof a.createdAt === 'object' && 'toDate' in a.createdAt) {
                dateA = (a.createdAt as any).toDate();
              } else {
                dateA = new Date(a.createdAt);
              }

              if (b.createdAt && typeof b.createdAt === 'object' && 'toDate' in b.createdAt) {
                dateB = (b.createdAt as any).toDate();
              } else {
                dateB = new Date(b.createdAt);
              }

              return dateB.getTime() - dateA.getTime();
            }
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

                </Text>
              </View>
              <Text style={styles.itemDetail}>
                العميل: {invoice.customerName || "N/A"}
              </Text>
              <Text style={styles.itemDetail}>
                تاريخ الإنشاء:{" "}
                {(() => {
                  let date: Date;
                  if (invoice.createdAt && typeof invoice.createdAt === 'object' && 'toDate' in invoice.createdAt) {
                    date = (invoice.createdAt as any).toDate();
                  } else {
                    date = new Date(invoice.createdAt);
                  }
                  return date.toLocaleDateString("ar-IQ");
                })()}
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
                الإجمالي: {(invoice.totalAmount || 0).toLocaleString()} د.ع
              </Text>

              <Text
                style={[styles.label, { marginTop: 16, marginBottom: 8, fontSize: 16 }]}
              >
                العناصر:
              </Text>
              {(invoice.items || []).map((item, index) => (
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
                      سعر الوحدة: {(item.unitPrice || 0).toLocaleString()} د.ع
                    </Text>
                  </View>
                  {/* Display cable info by name if present */}
                  {item.cableLength && (
                    <Text style={styles.cableInfo}>
                      نوع الكيبل: {item.cableLength}
                    </Text>
                  )}
                  <Text
                    style={[styles.itemDetail, { fontWeight: "bold", textAlign: "left" }]}
                  >
                    إجمالي العنصر: {(item.totalPrice || 0).toLocaleString()} د.ع
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

