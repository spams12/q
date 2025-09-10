import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { db } from "@/lib/firebase";
import InvoiceDetails from "@/components/InvoiceDetails";
import { Invoice } from "@/lib/types";
import { useTheme } from "@/context/ThemeContext";
import { Pressable } from "react-native";

export default function InvoiceDetailPage() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!id || typeof id !== 'string') {
        setError("Invalid invoice ID");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Use React Native Firebase syntax
        const invoiceRef = db.collection("invoices").doc(id);
        const invoiceSnap = await invoiceRef.get();
        
        if (invoiceSnap.exists) {
          setInvoice({ id: invoiceSnap.id, ...invoiceSnap.data() } as Invoice);
        } else {
          setError("Invoice not found");
        }
      } catch (err) {
        console.error("Error fetching invoice:", err);
        setError("Failed to load invoice");
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={{ marginTop: 10, color: theme.text }}>Loading invoice...</Text>
      </View>
    );
  }

  if (error || !invoice) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background, padding: 20 }}>
        <Feather name="alert-triangle" size={48} color={theme.destructive} />
        <Text style={{ marginTop: 10, color: theme.text, fontSize: 18, textAlign: 'center' }}>
          {error || "Failed to load invoice"}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{ 
            marginTop: 20, 
            padding: 10, 
            backgroundColor: theme.primary, 
            borderRadius: 8,
            flexDirection: 'row',
            alignItems: 'center'
          }}
        >
          <Feather name="arrow-right" size={18} color={theme.white} />
          <Text style={{ color: theme.white, fontWeight: '600', marginLeft: 8 }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <InvoiceDetails 
      invoice={invoice} 
      onClose={() => router.back()} 
    />
  );
}