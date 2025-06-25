"use client";

import { Feather } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Timestamp } from "firebase/firestore";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { Theme, useTheme } from "@/context/ThemeContext";
import { Invoice } from "@/lib/types";

interface InvoiceDetailsProps {
  invoice: Invoice;
  onClose: () => void;
}

const formatTimestamp = (timestamp: string | Timestamp | any) => {
  let date: Date;

  if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else if (timestamp instanceof Timestamp) {
    date = timestamp.toDate();
  } else if (
    timestamp &&
    typeof timestamp === "object" &&
    "toDate" in timestamp &&
    typeof timestamp.toDate === "function"
  ) {
    try {
      date = timestamp.toDate();
    } catch (e) {
      console.error("Error converting timestamp:", e);
      return String(timestamp);
    }
  } else {
    return String(timestamp);
  }

  return date.toLocaleDateString("ar-IQ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatPrice = (price: number) => {
  return `${price.toLocaleString()} د.ع`;
};

const InvoiceDetails: React.FC<InvoiceDetailsProps> = ({
  invoice,
  onClose,
}) => {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);

  const generatePdf = async () => {
    // TODO: Replace placeholder with a base64 encoded logo
    const logoBase64 = "https://via.placeholder.com/150x75.png?text=Logo";

    const subscriberNoticeHtml =
      invoice.type === "newsubscriberinstall"
        ? `
        <div class="subscriber-notice">
          <h3>عزيزي المشترك:-</h3>
          <p>
            ان جهاز الاستلام الذي تم تنصيبه لك ( جهاز الراوتر او التحوله) هو
            ملك خاص لشركة القبس للتجارة الالكترونية والمقاولات العامة وهي
            الشركة المنفذة للمشروع الوطني لخدمة الانترنت الضوئي من ايرثلنك
            والوكيل الحصري في محافظة واسط . ان اي تلف للجهاز او سوء استخدم او
            اهمال او ضياع يعرضك لتعويض مبلغ قيمته 25 الف دينار عراقي
          </p>
          <p>
            ملاحظة:- ان اي خلل مصنعي في الجهاز يتم استبدال مجاناً خلال الشهر
            الاول من الاستخدام
          </p>
          <p>
            ملاحظة :- تتحول ملكية اجهزة الاستلام من ملكية الشركة الى ملكية
            المشترك في حال قيام المشترك بتفعيل 6 اشتراك واكثر ولا يحق للشركة
            المطالبة بعد تلك الفترة بالتعويض وفي حال لم يتم ذلك يحق للشركة سحب
            الجهاز
          </p>
          <div class="contact-info">
            <strong>للمزيد من المعلومات تواصل معنا</strong><br>
            www.alqabastechnolgy.com<br>
            هاتف: 07779515041<br>
            Facebook: AlQabasTechnology<br>
            Instagram: alqabas_technology
          </div>
        </div>
      `
        : "";

    const footerNoticeHtml =
      invoice.type === "newsubscriberinstall"
        ? `
        <div class="footer-notice">
          <p><strong>شكراً لتعاملكم معنا</strong></p>
          <p>
            القبس تكنلوجي للتجارة الالكترونية والمقاولات العامة الشركة المنفذة
            للمشروع الوطني للأنترنت في محافظة واسط
          </p>
        </div>
      `
        : "";

    const htmlContent = `
      <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
            body {
              font-family: 'Cairo', sans-serif;
              direction: rtl;
              text-align: right;
              background-color: #f9f9f9;
              color: #333;
            }
            .invoice-box {
              max-width: 800px;
              margin: auto;
              padding: 30px;
              border: 1px solid #eee;
              box-shadow: 0 0 10px rgba(0, 0, 0, .15);
              font-size: 16px;
              line-height: 24px;
              background-color: #fff;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #eee;
              padding-bottom: 20px;
              margin-bottom: 20px;
            }
            .header .company-details {
              text-align: left;
            }
            .header .logo {
              max-width: 150px;
              max-height: 75px;
            }
            .invoice-box table {
              width: 100%;
              line-height: inherit;
              text-align: right;
              border-collapse: collapse;
            }
            .invoice-box table td {
              padding: 10px;
              vertical-align: top;
            }
            .invoice-box table tr.heading td {
              background: #f2f2f2;
              border-bottom: 1px solid #ddd;
              font-weight: bold;
            }
            .invoice-box table tr.item td{
              border-bottom: 1px solid #eee;
            }
            .invoice-box table tr.item.last td {
              border-bottom: none;
            }
            .invoice-box table tr.total td:nth-child(2) {
              border-top: 2px solid #eee;
              font-weight: bold;
            }
            .information {
                margin-bottom: 40px;
            }
            .subscriber-notice {
              margin-top: 30px;
              padding: 15px;
              border: 1px solid #E5E7EB;
              border-radius: 6px;
              background-color: #F9FAFB;
            }
            .subscriber-notice h3 {
                font-size: 16px;
                margin-bottom: 8px;
            }
            .subscriber-notice p {
                font-size: 12px;
                line-height: 18px;
                margin-bottom: 12px;
            }
            .contact-info {
                margin-top: 16px;
            }
            .footer-notice {
              margin-top: 30px;
              text-align: center;
              font-size: 14px;
              color: #6B7280;
            }
          </style>
        </head>
        <body>
          <div class="invoice-box">
            <div class="header">
              <img src="${logoBase64}" alt="Company Logo" class="logo" />
              <div class="company-details">
                <strong>المشروع الوطني للانترنت - فرع واسط</strong><br>
                هاتف: 07779515041
              </div>
            </div>
            
            <div class="information">
              <table>
                <tr>
                  <td>
                    العميل: ${invoice.customerName || "N/A"}<br>
                    بواسطة: ${invoice.creatorName || "N/A"}
                  </td>
                  <td style="text-align: left;">
                    فاتورة رقم: ${invoice.id.substring(0, 8)}<br>
                    تاريخ الإنشاء: ${formatTimestamp(invoice.createdAt)}
                  </td>
                </tr>
              </table>
            </div>

            <table>
              <tr class="heading">
                <td>العنصر</td>
                <td style="text-align: center;">الكمية</td>
                <td style="text-align: center;">السعر الفردي</td>
                <td style="text-align: left;">المجموع</td>
              </tr>
              ${invoice.items
                .map((item) => {
                  let subDetails = "";
                  if (item.type === "newCustomerInstallation") {
                    subDetails = `
                            <br><small style="color: #6B7280;">الباقة: ${
                              item.packageType
                            }</small>
                            ${
                              item.cableLength
                                ? `<br><small style="color: #6B7280;">طول الكيبل: ${item.cableLength} متر</small>`
                                : ""
                            }
                            ${
                              item.connectorType
                                ? `<br><small style="color: #6B7280;">نوع الكونيكتر: ${item.connectorType}</small>`
                                : ""
                            }
                            ${
                              item.receiverDevice
                                ? `<br><small style="color: #6B7280;">جهاز الاستقبال: ${item.receiverDevice}</small>`
                                : ""
                            }
                            ${
                              item.numHooks || item.numHooks === 0
                                ? `<br><small style="color: #6B7280;">عدد الهوكات: ${item.numHooks}</small>`
                                : ""
                            }
                            ${
                              item.numBags || item.numBags === 0
                                ? `<br><small style="color: #6B7280;">عدد الشناطات: ${item.numBags}</small>`
                                : ""
                            }
                        `;
                  } else if (
                    item.type === "maintenance" &&
                    item.maintenanceType
                  ) {
                    subDetails = `
                            <br><small style="color: #6B7280;">نوع الصيانة: ${
                              item.maintenanceType === "cableReplacement"
                                ? "استبدال كيبل"
                                : item.maintenanceType === "connectorReplacement"
                                ? "استبدال كونيكتر"
                                : item.maintenanceType === "deviceReplacement"
                                ? "استبدال جهاز"
                                : "صيانة أخرى"
                            }</small>
                            ${
                              item.deviceModel
                                ? `<br><small style="color: #6B7280;">نوع الجهاز: ${item.deviceModel}</small>`
                                : ""
                            }
                        `;
                  }

                  return `
                        <tr class="item">
                          <td>
                            ${item.description}
                            ${
                              item.additionalNotes
                                ? `<br><small style="color: #6B7280;">${item.additionalNotes}</small>`
                                : ""
                            }
                            ${subDetails}
                          </td>
                          <td style="text-align: center;">${item.quantity}</td>
                          <td style="text-align: center;">${formatPrice(
                            item.unitPrice
                          )}</td>
                          <td style="text-align: left;">${formatPrice(
                            item.totalPrice
                          )}</td>
                        </tr>
                      `;
                })
                .join("")}
              <tr class="total">
                <td colspan="3" style="text-align: left; font-weight: bold;">الإجمالي</td>
                <td style="text-align: left; font-weight: bold;">${formatPrice(
                  invoice.totalAmount
                )}</td>
              </tr>
            </table>
            ${
              invoice.notes
                ? `<div style="margin-top: 20px;"><strong>ملاحظات:</strong><br>${invoice.notes}</div>`
                : ""
            }
            ${subscriberNoticeHtml}
            ${footerNoticeHtml}
          </div>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      if (Platform.OS === "ios") {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "تصدير الفاتورة",
        });
      } else {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "تصدير الفاتورة",
        });
      }
    } catch (error) {
      Alert.alert("خطأ", "لم نتمكن من إنشاء ملف PDF.");
      console.error("Error generating PDF:", error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>تفاصيل الفاتورة</Text>
        <Pressable onPress={onClose}>
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.invoiceContent}>
        {/* Invoice Header with Logo */}
        <View style={styles.invoiceHeader}>
          <View style={styles.logoContainer}>
         
          </View>
          <Text style={styles.companyName}>
            المشروع الوطني للانترنت - فرع واسط
          </Text>
          <Text style={styles.companyContact}>هاتف: 07779515041</Text>
        </View>

        <View style={styles.detailsGrid}>
          <View>
            <Text style={styles.sectionTitle}>فاتورة خدمة</Text>
            <Text style={styles.detailTextSemibold}>
              المستفيد: {invoice.customerName || "بدون اسم"}
            </Text>
            <Text style={styles.detailText}>
              رقم الفاتورة: #{invoice.id.substring(0, 8)}
            </Text>
            <Text style={styles.detailText}>
              تم إنشاءها في: {formatTimestamp(invoice.createdAt)}
            </Text>
            {invoice.creatorName && (
              <Text style={styles.detailText}>
                تم إنشاءها بواسطة: {invoice.creatorName}
              </Text>
            )}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text>
              <Text style={{ fontWeight: "bold" }}>الحالة: </Text>
              {invoice.status === "draft"
                ? "مسودة"
                : invoice.status === "submitted"
                  ? "مقدم"
                  : invoice.status === "approved"
                    ? "موافق عليه"
                    : invoice.status === "paid"
                      ? "مدفوع"
                      : invoice.status}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          {/* Table Header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.th, { flex: 3 }]}>الوصف</Text>
            <Text style={[styles.tableCell, styles.th, { flex: 1, textAlign: "center" }]}>الكمية</Text>
            <Text style={[styles.tableCell, styles.th, { flex: 2, textAlign: "center" }]}>السعر الفردي</Text>
            <Text style={[styles.tableCell, styles.th, { flex: 2, textAlign: "center" }]}>المجموع</Text>
          </View>
          {/* Table Body */}
          {invoice.items.map((item) => (
            <View key={item.id} style={styles.tableRow}>
              <View style={[styles.tableCell, { flex: 3 }]}>
                <Text style={{ fontWeight: "500" }}>{item.description}</Text>
                {item.additionalNotes && (
                  <Text style={styles.notesText}>{item.additionalNotes}</Text>
                )}
                {item.type === "newCustomerInstallation" && (
                  <View style={styles.itemSubDetails}>
                    <Text style={styles.subDetailText}>الباقة: {item.packageType}</Text>
                    {item.cableLength && <Text style={styles.subDetailText}>طول الكيبل: {item.cableLength} متر</Text>}
                    {item.connectorType && <Text style={styles.subDetailText}>نوع الكونيكتر: {item.connectorType}</Text>}
                    {item.receiverDevice && <Text style={styles.subDetailText}>جهاز الاستقبال: {item.receiverDevice}</Text>}
                    {(item.numHooks || item.numHooks === 0) && <Text style={styles.subDetailText}>عدد الهوكات: {item.numHooks}</Text>}
                    {(item.numBags || item.numBags === 0) && <Text style={styles.subDetailText}>عدد الشناطات: {item.numBags}</Text>}
                  </View>
                )}
                {item.type === "maintenance" && item.maintenanceType && (
                  <View style={styles.itemSubDetails}>
                    <Text style={styles.subDetailText}>
                      نوع الصيانة:{" "}
                      {item.maintenanceType === "cableReplacement"
                        ? "استبدال كيبل"
                        : item.maintenanceType === "connectorReplacement"
                          ? "استبدال كونيكتر"
                          : item.maintenanceType === "deviceReplacement"
                            ? "استبدال جهاز"
                            : "صيانة أخرى"}
                    </Text>
                    {item.deviceModel && <Text style={styles.subDetailText}>نوع الجهاز: {item.deviceModel}</Text>}
                  </View>
                )}
              </View>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "center" }]}>{item.quantity}</Text>
              <Text style={[styles.tableCell, { flex: 2, textAlign: "center" }]}>{formatPrice(item.unitPrice)}</Text>
              <Text style={[styles.tableCell, { flex: 2, textAlign: "center" }]}>{formatPrice(item.totalPrice)}</Text>
            </View>
          ))}
          {/* Table Footer */}
          <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.tableCell, { flex: 6, textAlign: "left", fontWeight: "bold" }]}>المجموع الكلي</Text>
            <Text style={[styles.tableCell, { flex: 2, textAlign: "center", fontWeight: "bold" }]}>{formatPrice(invoice.totalAmount)}</Text>
          </View>
        </View>

        {invoice.type === "newsubscriberinstall" && (
          <View style={styles.footerNotice}>
            <Text style={{ textAlign: "center", fontWeight: "bold" }}>
              شكراً لتعاملكم معنا
            </Text>
            <Text style={styles.footerNoticeText}>
              القبس تكنلوجي للتجارة الالكترونية والمقاولات العامة الشركة المنفذة
              للمشروع الوطني للأنترنت في محافظة واسط
            </Text>
          </View>
        )}

        {invoice.type === "newsubscriberinstall" && (
          <View style={styles.subscriberNotice}>
            <Text style={styles.subscriberNoticeTitle}>عزيزي المشترك:-</Text>
            <Text style={styles.subscriberNoticeText}>
              ان جهاز الاستلام الذي تم تنصيبه لك ( جهاز الراوتر او التحوله) هو
              ملك خاص لشركة القبس للتجارة الالكترونية والمقاولات العامة وهي
              الشركة المنفذة للمشروع الوطني لخدمة الانترنت الضوئي من ايرثلنك
              والوكيل الحصري في محافظة واسط . ان اي تلف للجهاز او سوء استخدم او
              اهمال او ضياع يعرضك لتعويض مبلغ قيمته 25 الف دينار عراقي
            </Text>
            <Text style={styles.subscriberNoticeText}>
              ملاحظة:- ان اي خلل مصنعي في الجهاز يتم استبدال مجاناً خلال الشهر
              الاول من الاستخدام
            </Text>
            <Text style={styles.subscriberNoticeText}>
              ملاحظة :- تتحول ملكية اجهزة الاستلام من ملكية الشركة الى ملكية
              المشترك في حال قيام المشترك بتفعيل 6 اشتراك واكثر ولا يحق للشركة
              المطالبة بعد تلك الفترة بالتعويض وفي حال لم يتم ذلك يحق للشركة سحب
              الجهاز
            </Text>
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontWeight: "bold", color: "#1F2937" }}>
                للمزيد من المعلومات تواصل معنا
              </Text>
              <Text style={styles.contactInfo}>www.alqabastechnolgy.com</Text>
              <Text style={styles.contactInfo}>هاتف: 07779515041</Text>
              <Text style={styles.contactInfo}>Facebook: AlQabasTechnology</Text>
              <Text style={styles.contactInfo}>Instagram: alqabas_technology</Text>
            </View>
          </View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          onPress={generatePdf}
          style={({ pressed }) => [
            styles.button,
            styles.buttonPrimary,
            pressed && styles.buttonPrimaryPressed,
          ]}
        >
          <Feather name="share" size={20} color={theme.white} />
          <Text style={styles.buttonText}>تصدير كـ PDF</Text>
        </Pressable>
      </View>
    </View>
  );
};

const getStyles = (theme: Theme, themeName: "light" | "dark") =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerBar: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: theme.text,
    },
    invoiceContent: {
      padding: 32,
      backgroundColor: "#fff",
    },
    invoiceHeader: {
      alignItems: "center",
      borderBottomWidth: 2,
      borderColor: "#E5E7EB",
      paddingBottom: 16,
      marginBottom: 16,
    },
    logoContainer: {
      width: 128,
      height: 64,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 8,
      marginBottom: 8,
    },
    logo: {
      width: 100,
      height: 100,
    },
    companyName: {
      fontSize: 20,
      fontWeight: "bold",
    },
    companyContact: {
      fontSize: 14,
      color: "#6B7280",
    },
    detailsGrid: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 4,
    },
    detailText: {
      fontSize: 14,
      marginBottom: 2,
    },
    detailTextSemibold: {
      fontSize: 14,
      fontWeight: "600",
      marginTop: 4,
    },
    table: {
      width: "100%",
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: 8,
      overflow: "hidden",
    },
    tableRow: {
      flexDirection: "row-reverse",
      borderBottomWidth: 1,
      borderBottomColor: "#E5E7EB",
    },
    tableHeader: {
      backgroundColor: "#F9FAFB",
    },
    tableCell: {
      padding: 8,
      textAlign: "right",
    },
    th: {
      fontWeight: "bold",
    },
    notesText: {
      fontSize: 12,
      color: "#6B7280",
      marginTop: 4,
    },
    itemSubDetails: {
      marginTop: 4,
    },
    subDetailText: {
      fontSize: 12,
      color: "#6B7280",
    },
    footerNotice: {
      marginTop: 48,
      paddingTop: 16,
      textAlign: "center",
    },
    footerNoticeText: {
      fontSize: 14,
      color: "#6B7280",
      marginTop: 8,
      textAlign: "center",
    },
    subscriberNotice: {
      marginTop: 32,
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: 6,
      backgroundColor: "#F9FAFB",
      padding: 16,
    },
    subscriberNoticeTitle: {
      fontWeight: "bold",
      fontSize: 16,
      marginBottom: 8,
    },
    subscriberNoticeText: {
      fontSize: 12,
      lineHeight: 18,
      color: "#374151",
      marginBottom: 12,
    },
    contactInfo: {
      marginTop: 4,
    },
    footer: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.card,
    },
    button: {
      flexDirection: "row-reverse",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      gap: 8,
    },
    buttonPrimary: {
      backgroundColor: theme.primary,
    },
    buttonPrimaryPressed: {
      opacity: 0.8,
    },
    buttonText: {
      color: theme.white,
      fontSize: 16,
      fontWeight: "600",
    },
  });

export default InvoiceDetails;