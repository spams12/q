# Invoice Page Navigation Fix Design

## Overview
This document outlines the changes needed to fix the invoice details page navigation issue. Currently, when users try to view invoice details, they encounter a "page not found" error because the InvoiceDetails component is implemented as a modal rather than a dedicated page. This design will convert the modal implementation to a proper page-based navigation.

## Current Implementation Issues
1. InvoiceDetails component is implemented as a modal within InvoiceList.tsx
2. Navigation to the invoice details page results in a "page not found" error
3. The router.push("/InvoiceDetails") call doesn't map to an actual route in the file-based routing system

## Proposed Solution
Convert the modal-based implementation to a proper page-based implementation using Expo Router's file-based routing system:

1. Create a dedicated invoice details page in the app directory
2. Modify the InvoiceList component to navigate to the new page
3. Remove the modal implementation from InvoiceList
4. Pass the invoice data through navigation parameters

## Architecture Changes

### Current Flow
```
InvoiceList (component) 
  → Modal with InvoiceDetails
  → router.push("/InvoiceDetails") (fails)
```

### New Flow
```
InvoiceList (page) 
  → router.push("/invoices/[id]") (navigates to dedicated page)
  → InvoiceDetails (page at app/invoices/[id].tsx)
```

## Implementation Details

### 1. Create New Invoice Details Page
Create a new file at `app/invoices/[id].tsx` that will:
- Use `useLocalSearchParams()` to get the invoice ID
- Fetch the invoice data from Firestore
- Display the invoice details using the existing InvoiceDetails component

The new page will have this implementation:

```typescript
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
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
        const invoiceRef = doc(db, "invoices", id);
        const invoiceSnap = await getDoc(invoiceRef);
        
        if (invoiceSnap.exists()) {
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
```

### 2. Modify InvoiceList Component
Update `components/InvoiceList.tsx` to:
- Remove the modal implementation
- Remove the selectedInvoice state
- Navigate to the new invoice details page using `router.push('/invoices/' + invoice.id)`
- Remove the conditional rendering for selectedInvoice

The key changes in the InvoiceList component will be:

1. Remove these state variables:
```typescript
const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
```

2. Replace this navigation logic:
```typescript
if (selectedInvoice) {
  router.push("/InvoiceDetails");
  setSelectedInvoice(null);
}
```

With direct navigation in the item onPress handler:
```typescript
onPress={() => router.push(`/invoices/${invoice.id}`)}
```

### 3. Update Navigation Flow
Replace the current navigation approach:
```javascript
// Current (problematic) approach
if (selectedInvoice) {
  router.push("/InvoiceDetails");
  setSelectedInvoice(null);
}

// New approach
router.push(`/invoices/${invoice.id}`);
```

## Component Structure

### InvoiceList Component Changes
- Remove modal-related state (`selectedInvoice`, `showInvoiceForm`)
- Remove modal JSX
- Update onPress handler to navigate to the new page
- Keep the InvoiceForm modal for creating new invoices

### New Invoice Details Page
- File path: `app/invoices/[id].tsx`
- Uses `useLocalSearchParams()` to get invoice ID
- Fetches invoice data from Firestore
- Renders the InvoiceDetails component with the fetched data

## Data Flow

### Before Fix
```
InvoiceList Component
  ↓ (state management)
InvoiceDetails Component (as modal)
```

### After Fix
```
InvoiceList Page
  ↓ (navigation with ID)
invoices/[id] Page
  ↓ (fetch data by ID)
InvoiceDetails Component
```

## File Modifications

### 1. Create app/invoices/[id].tsx
Create new page with:
- Route parameter extraction using `useLocalSearchParams()`
- Firestore data fetching using `getDoc()`
- Error handling for invalid or missing invoices
- Loading states during data fetch
- InvoiceDetails component rendering with fetched data
- Back navigation support

### 2. Modify components/InvoiceList.tsx
Changes needed:
- Remove selectedInvoice state: `const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);`
- Remove the conditional rendering logic that checks for selectedInvoice
- Update the onPress handler in the invoice item mapping from `onPress={() => setSelectedInvoice(invoice)}` to `onPress={() => router.push(`/invoices/${invoice.id}`)}`
- Keep the existing InvoiceForm modal for creating new invoices
- Remove the modal JSX that was used for displaying invoice details

Specific code changes in the InvoiceList component:

1. Remove the state variable:
```typescript
// REMOVE THIS LINE
const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
```

2. Remove the conditional rendering logic:
```typescript
// REMOVE THIS BLOCK
if (selectedInvoice) {
  router.push("/InvoiceDetails");
  setSelectedInvoice(null);
}
```

3. Update the invoice item onPress handler:
```typescript
// CHANGE THIS:
<Pressable
  key={invoice.id}
  onPress={() => setSelectedInvoice(invoice)}
  style={({ pressed }) => [
    styles.card,
    pressed && { opacity: 0.8 },
  ]}
>

// TO THIS:
<Pressable
  key={invoice.id}
  onPress={() => router.push(`/invoices/${invoice.id}`)}
  style={({ pressed }) => [
    styles.card,
    pressed && { opacity: 0.8 },
  ]}
>
```

## Benefits of This Approach
1. Proper page-based navigation that works with Expo Router
2. Better separation of concerns
3. Improved user experience with proper back navigation
4. Consistent with the app's existing routing pattern
5. Better performance by only loading invoice data when needed

## Testing Considerations
1. Verify navigation to invoice details page works correctly
2. Ensure back navigation functions properly
3. Test data loading and error states
4. Confirm invoice details display correctly
5. Validate that invoice creation flow remains unaffected

## Testing Steps

### Test Invoice Details Page Creation
1. Create the new invoice details page at `app/invoices/[id].tsx`
2. Verify the page can be accessed via navigation
3. Check that valid invoice IDs load the correct data
4. Check that invalid invoice IDs show appropriate error messages

### Test InvoiceList Component Modification
1. Remove the selectedInvoice state from the component
2. Update the onPress handler to use router.push
3. Verify that clicking on an invoice navigates to the correct details page
4. Ensure the InvoiceForm modal still works for creating new invoices

### End-to-End Testing
1. Navigate to a page that displays the InvoiceList component
2. Click on an invoice to view its details
3. Verify the invoice details page loads correctly
4. Use the back button to return to the invoice list
5. Try creating a new invoice using the existing form
6. Verify that the new invoice appears in the list

## Dependencies
- Expo Router for file-based routing
- Firestore for data fetching
- Existing InvoiceDetails component for UI rendering