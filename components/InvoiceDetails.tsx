"use client";

import { Feather } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Timestamp } from "firebase/firestore";
import React, { useEffect, useState } from "react";
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
import { db } from "@/lib/firebase";
import { Invoice } from "@/lib/types";
import { Image } from "expo-image";

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
  // Ensure zero values are handled correctly for zero-priced invoices
  const formattedPrice = (price || 0).toLocaleString();
  return `${formattedPrice} د.ع`;
};

const InvoiceDetails: React.FC<InvoiceDetailsProps> = ({
  invoice,
  onClose,
}) => {
  const { theme, themeName } = useTheme();
  const styles = getStyles(theme, themeName);
  const [displayCustomerName, setDisplayCustomerName] = useState(invoice.customerName || "غير محدد");
  const [logoUri, setLogoUri] = useState<string>(""); // Add state for logo URI

  // Fetch customer name from linked service request if missing in invoice
  useEffect(() => {
    const fetchCustomerName = async () => {
      if (invoice.customerName) {
        setDisplayCustomerName(invoice.customerName);
        return;
      }

      if (invoice.linkedServiceRequestId) {
        try {
          const serviceRequestRef = db.collection("serviceRequests").doc(invoice.linkedServiceRequestId);
          const serviceRequestSnap = await serviceRequestRef.get();
          if (serviceRequestSnap.exists()) {
            const serviceRequestData = serviceRequestSnap.data();
            const name = serviceRequestData?.customerName || serviceRequestData?.name || "غير محدد";
            setDisplayCustomerName(name);
          }
        } catch (error) {
          console.warn("Could not fetch customer name from service request:", error);
          setDisplayCustomerName("غير محدد");
        }
      } else {
        setDisplayCustomerName("غير محدد");
      }
    };

    const loadLogo = async () => {
      try {
        const logoBase64 = await getLogoBase64();
        setLogoUri(logoBase64);
      } catch (error) {
        console.error("Error loading logo:", error);
        setLogoUri("");
      }
    };

    fetchCustomerName();
    loadLogo();
  }, [invoice.customerName, invoice.linkedServiceRequestId]);

  const getLogoBase64 = async () => {
    try {
      // In a real implementation, you would:
      // 1. Import the logo file
      // 2. Convert it to base64 using a file reading utility
      // For now, using a placeholder that represents a simple logo
      // You can replace this with actual base64 conversion
      return placeholderLogo;
    } catch (error) {
      console.error("Error loading logo:", error);
      return "";
    }
  };

  const generatePdf = async () => {
    // Use the displayCustomerName state which has already been fetched
    const customerNameForPdf = displayCustomerName;

    // Get logo base64 for PDF
    const logoBase64 = await getLogoBase64();

    const subscriberNoticeHtml =
      invoice.type === "newsubscriberinstall"
        ? `
        <div class="subscriber-notice">
          <h3>عزيزي المشترك:-</h3>
          <p>
            ان جهاز الاستلام الذي تم تنصيبه لك ( جهاز الراوتر او التحوله) هو
            ملك خاص لشركة القبس للتجارة الالكترونية والمقاولات العامة وهي
            الشركة المنفذة لوزارة الاتصالات لخدمة الانترنت الضوئي من ايرثلنك
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

    const footerNoticeHtml = `
        <div class="footer-notice">
        </div>
        <div class="arabic-footer">
          <p><strong>عزيزي المشترك في حال تم اخذ منك مبلغ مخالف لتفاصيل الفاتوره اعلاه فيحق لك تقديم شكوى بالاتصال بالوكيل او برقم شركتنا الساخن 6119 للتبليغ عن هذه الحالات التي تخالف القانون الداخلي ولا تمثل رؤية الادارة العليا لوزارة الاتصالات للانترنت</strong></p>
          <p><strong>شكرا لكم على اختياركم الوطني من ايرثلنك ،</strong></p>
        </div>
      `;

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
            .arabic-footer {
              margin-top: 30px;
              padding: 15px;
              border: 1px solid #E5E7EB;
              border-radius: 6px;
              background-color: #F9FAFB;
              text-align: center;
            }
            .arabic-footer p {
              font-size: 12px;
              line-height: 18px;
              color: #374151;
              margin-bottom: 12px;
            }
            .arabic-footer strong {
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="invoice-box">
            <div class="header">
              <div class="company-details">
                <strong>وزارة الاتصالات - قسم الصيانة</strong><br>
              </div>
              <div class="logo">
                <img src="${logoBase64}" alt="Company Logo" style="max-width: 150px; max-height: 75px;" />
              </div>
            </div>
            
            <div class="information">
              <table>
                <tr>
                  <td>
                    العميل: ${customerNameForPdf}<br>
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
                            <br><small style="color: #6B7280;">الباقة: ${item.packageType || ""}</small>
                            ${item.cableLength
                ? `<br><small style="color: #6B7280;">الكيبل المستخدم: ${item.cableLength} </small>`
                : ""
              }
                            ${item.connectorType && item.connectorType.length > 0
                ? `<br><small style="color: #6B7280;">أنواع الكونيكتر: ${item.connectorType.join(', ')}</small>`
                : ""
              }
                            ${item.deviceModel
                ? `<br><small style="color: #6B7280;">جهاز الاستقبال: ${item.deviceModel}</small>`
                : ""
              }
                            ${item.numHooks || item.numHooks === 0
                ? `<br><small style="color: #6B7280;">عدد الهوكات: ${item.numHooks}</small>`
                : ""
              }
                            ${item.numBags || item.numBags === 0
                ? `<br><small style="color: #6B7280;">عدد الشناطات: ${item.numBags}</small>`
                : ""
              }
                        `;
          } else if (
            item.type === "maintenance" &&
            item.maintenanceType
          ) {
            subDetails = `
                            <br><small style="color: #6B7280;">نوع الصيانة: ${item.maintenanceType === "cableReplacement"
                ? "استبدال كيبل"
                : item.maintenanceType === "connectorReplacement"
                  ? "استبدال كونيكتر"
                  : item.maintenanceType === "deviceReplacement"
                    ? "استبدال جهاز"
                    : "صيانة مخصص"
              }</small>
                            ${item.deviceModel
                ? `<br><small style="color: #6B7280;">نوع الجهاز: ${item.deviceModel}</small>`
                : ""
              }
                            ${item.cableLength
                ? `<br><small style="color: #6B7280;">الكيبل المستخدم: ${item.cableLength}</small>`
                : ""
              }
                            ${item.connectorType && item.connectorType.length > 0
                ? `<br><small style="color: #6B7280;">أنواع الكونيكتر: ${item.connectorType.join(', ')}</small>`
                : ""
              }
                        `;
          }

          return `
                        <tr class="item">
                          <td>
                            ${item.description}
                            ${item.additionalNotes
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
    <>

      <ScrollView contentContainerStyle={styles.invoiceContent}>
        {/* Invoice Header with Logo */}
        <View style={styles.invoiceHeader}>
          <Text style={styles.companyName}>
            وزارة الاتصالات - قسم الصيانة
          </Text>
          <View style={styles.logoContainer}>
            {logoUri ? (
              <Image
                source={{ uri: logoUri }}
                alt="Company Logo"
                style={{ maxWidth: 150, maxHeight: 75 }}
              />
            ) : (
              <Text style={styles.logoText}>Loading logo...</Text>
            )}
          </View>
        </View>

        <View style={styles.detailsGrid}>
          <View>
            <Text style={styles.sectionTitle}>فاتورة خدمة</Text>
            <Text style={styles.detailTextSemibold}>
              المستفيد: {displayCustomerName || "بدون اسم"}
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
                    {item.cableLength && <Text style={styles.subDetailText}>الكيبل: {item.cableLength}</Text>}
                    {item.connectorType && item.connectorType.length > 0 && (
                      <Text style={styles.subDetailText}>أنواع الكونيكتر: {item.connectorType.join(', ')}</Text>
                    )}
                    {item.deviceModel && <Text style={styles.subDetailText}>جهاز الاستقبال: {item.deviceModel}</Text>}
                    {(item.numHooks || item.numHooks === 0) && <Text style={styles.subDetailText}>عدد الهوكات: {item.numHooks}</Text>}
                    {(item.numBags || item.numBags === 0) && <Text style={styles.subDetailText}>عدد الشناطات: {item.numBags}</Text>}
                  </View>
                )}
                {
                  item.type === "maintenance" && item.maintenanceType && (
                    <View style={styles.itemSubDetails}>
                      <Text style={styles.subDetailText}>
                        نوع الصيانة: {" "}
                        {item.maintenanceType === "cableReplacement"
                          ? "استبدال كيبل"
                          : item.maintenanceType === "connectorReplacement"
                            ? "استبدال كونيكتر"
                            : item.maintenanceType === "deviceReplacement"
                              ? "استبدال جهاز"
                              : "صيانة مخصص"}
                      </Text>
                      {item.deviceModel && <Text style={styles.subDetailText}>نوع الجهاز: {item.deviceModel}</Text>}
                      {item.cableLength && <Text style={styles.subDetailText}>الكيبل المستخدم: {item.cableLength}</Text>}
                      {item.connectorType && item.connectorType.length > 0 && (
                        <Text style={styles.subDetailText}>أنواع الكونيكتر: {item.connectorType.join(', ')}</Text>
                      )}
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
              لوزارة الاتصالات للأنترنت في محافظة واسط
            </Text>
          </View>
        )}

        {invoice.type === "newsubscriberinstall" && (
          <View style={styles.subscriberNotice}>
            <Text style={styles.subscriberNoticeTitle}>عزيزي المشترك:-</Text>
            <Text style={styles.subscriberNoticeText}>
              ان جهاز الاستلام الذي تم تنصيبه لك ( جهاز الراوتر او التحوله) هو
              ملك خاص لشركة القبس للتجارة الالكترونية والمقاولات العامة وهي
              الشركة المنفذة لوزارة الاتصالات لخدمة الانترنت الضوئي من ايرثلنك
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

        {/* Arabic Footer Text for all invoice types */}
        <View style={styles.arabicFooterContainer}>
          <Text style={styles.arabicFooterTitle}>عزيزي المشترك</Text>
          <Text style={styles.arabicFooterText}>
            في حال تم اخذ منك مبلغ مخالف لتفاصيل الفاتوره اعلاه فيحق لك تقديم شكوى بالاتصال بالوكيل او برقم شركتنا الساخن 6119
            للتبليغ عن هذه الحالات التي تخالف القانون الداخلي ولا تمثل رؤية الادارة العليا لوزارة الاتصالات للانترنت
          </Text>
          <Text style={styles.arabicFooterClosing}>شكرا لكم على اختياركم</Text>
        </View>
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
    </>
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
    logoText: {
      fontSize: 12,
      color: "#6B7280",
      fontStyle: "italic",
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
    // Arabic Footer Styles
    arabicFooterContainer: {
      marginTop: 32,
      padding: 16,
      borderWidth: 1,
      borderColor: "#E5E7EB",
      borderRadius: 8,
      backgroundColor: "#F9FAFB",
    },
    arabicFooterTitle: {
      fontSize: 14,
      fontWeight: "bold",
      color: "#374151",
      textAlign: "center",
      marginBottom: 12,
    },
    arabicFooterText: {
      fontSize: 12,
      color: "#374151",
      lineHeight: 18,
      textAlign: "center",
      marginBottom: 12,
    },
    arabicFooterSignature: {
      fontSize: 12,
      fontWeight: "bold",
      color: "#374151",
      textAlign: "center",
      marginBottom: 4,
    },
    arabicFooterTime: {
      fontSize: 11,
      color: "#6B7280",
      textAlign: "center",
      marginBottom: 8,
    },
    arabicFooterClosing: {
      fontSize: 12,
      fontWeight: "bold",
      color: "#374151",
      textAlign: "center",
    },
  });

export default InvoiceDetails;