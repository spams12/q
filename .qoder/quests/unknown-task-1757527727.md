# Design Document: Converting InvoiceDetails from Modal to Screen

## Overview

This document outlines the design for converting the `InvoiceDetails.tsx` component from a modal implementation to a dedicated screen in the navigation stack. Currently, the component is implemented as a modal that receives props including an `invoice` object and an `onClose` callback. The goal is to refactor this component to function as a standalone screen that can be navigated to directly.

## Current Implementation Analysis

The current `InvoiceDetails.tsx` component:
- Is implemented as a React functional component
- Receives props including `invoice: Invoice` and `onClose: () => void`
- Contains functionality for:
  - Displaying invoice details with proper formatting
  - Generating PDFs of the invoice
  - Sharing the generated PDF
  - Handling both Arabic (RTL) and English (LTR) layouts
- Uses a modal-like structure with a header bar and close functionality

## Current Navigation Structure

Based on the analysis of the codebase:
- The app uses Expo Router with a file-based routing system
- The main tab navigation is defined in `app/(tabs)/_layout.tsx`
- Individual screens are defined in the `app/` directory
- Dynamic routes are implemented using bracket notation (e.g., `[id].tsx`)
- The invoices list screen is accessible at `/invoices`
- Individual invoice details should be accessible at `/invoice/[id]`

## Proposed Architecture

### Component Restructuring
1. Remove the `onClose` prop dependency
2. Implement navigation using Expo Router's file-based routing system
3. Extract the invoice ID from route parameters
4. Fetch invoice data within the screen component
5. Add a back button in the header for navigation

### Navigation Integration
1. Move the component from `app/InvoiceDetails.tsx` to `app/invoice/[id].tsx` to create a dynamic route
2. Use `useLocalSearchParams()` to extract the invoice ID from the URL
3. Implement data fetching based on the invoice ID
4. Configure the route in the main layout file `app/_layout.tsx`

### Data Flow
1. Screen mounts and extracts invoice ID from route parameters
2. Fetch invoice data based on the ID
3. Display invoice details with existing formatting logic
4. Maintain all existing functionality (PDF generation, sharing)
5. Replace close button with back navigation

## Implementation Details

### Route Structure
```
app/
├── invoice/
│   └── [id].tsx (InvoiceDetails screen)
```

### Component Modifications
1. Remove `InvoiceDetailsProps` interface
2. Remove `onClose` prop handling
3. Add route parameter extraction using `useLocalSearchParams()`
4. Add navigation hook for back navigation
5. Implement invoice data fetching based on ID
6. Replace header close button with back navigation
7. Maintain all styling and existing functionality

### Data Fetching
1. Extract invoice ID from route parameters
2. Implement data fetching logic (similar to existing invoice detail screens)
3. Handle loading and error states
4. Display invoice data once fetched

### Navigation Changes
1. Replace close functionality with navigation back
2. Update header bar to include back button
3. Maintain existing styling for consistency

## Technical Considerations

### Dependency Management
- Maintain existing dependencies (Firebase, Expo Print, Expo Sharing)
- Ensure proper typing for route parameters
- Handle potential missing or invalid invoice IDs

### State Management
- Manage loading states during data fetching
- Handle error states for missing or invalid invoices
- Preserve existing local state for UI interactions

### Styling
- Maintain existing RTL/LTR support
- Preserve all styling and formatting logic
- Ensure responsive design across devices

## File Structure Changes

### Before
```
app/
├── InvoiceDetails.tsx (Modal component)
```

### After
```
app/
├── invoice/
│   └── [id].tsx (Screen component)
```

## Implementation Steps

1. Create new directory `app/invoice/`
2. Create new screen component at `app/invoice/[id].tsx`
3. Implement route parameter extraction using `useLocalSearchParams()`
4. Add data fetching logic based on invoice ID using Firebase Firestore
5. Replace close functionality with navigation back using `router.back()` or `router.push()`
6. Update header to include back navigation
7. Add route configuration to `app/_layout.tsx`
8. Test navigation flow and data display
9. Remove old modal component at `app/InvoiceDetails.tsx`
10. Update any references to the modal component

### Route Configuration in Layout

Add the following configuration to `app/_layout.tsx` in the Stack component:
```typescript
<Stack.Screen name="invoice/[id]" options={{
  headerBackTitle: "رجوع",
  headerTitle: "تفاصيل الفاتورة"
}} />
```

## Code Implementation Example

The new screen component will follow a similar pattern to the existing task detail screen at `app/tasks/[id].tsx`:

1. Use `useLocalSearchParams()` to extract the invoice ID
2. Use `useEffect` to fetch invoice data from Firestore
3. Implement loading and error states
4. Use existing styling and formatting logic
5. Maintain PDF generation and sharing functionality

Example route parameter extraction:
```typescript
const params = useLocalSearchParams();
const id = params.id as string;
```

Example data fetching:
```typescript
useEffect(() => {
  if (!id) return;
  
  const unsubscribe = db.collection('invoices').doc(id).onSnapshot(
    (doc) => {
      if (doc.exists) {
        setInvoice({ id: doc.id, ...doc.data() } as Invoice);
        setLoading(false);
      } else {
        setError('Invoice not found');
        setLoading(false);
      }
    },
    (err) => {
      console.error('Error fetching invoice:', err);
      setError('Failed to load invoice');
      setLoading(false);
    }
  );
  
  return () => unsubscribe();
}, [id]);
```

Example navigation implementation:
```typescript
const router = useRouter();

// In the header bar
<TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
  <Ionicons name="arrow-back" size={24} color={theme.text} />
</TouchableOpacity>
```

## Testing Considerations

1. Verify proper navigation to the invoice detail screen from the invoices list
2. Test data fetching with valid and invalid invoice IDs
3. Ensure PDF generation and sharing functionality works
4. Verify proper back navigation
5. Test RTL/LTR layout switching
6. Confirm responsive design across different screen sizes
7. Test navigation from notifications or other parts of the app
8. Verify error handling for missing or inaccessible invoices

## Integration with Existing Features

The new invoice detail screen should integrate seamlessly with existing features:
1. Navigation from the invoices list screen
2. PDF generation and sharing functionality
3. Existing styling and formatting logic
4. Proper error handling and loading states
5. Consistent header and navigation behavior with other screens

## Backward Compatibility

This change removes the modal implementation entirely, so any direct usage of the modal component will need to be updated to use navigation instead. All existing functionality is preserved in the new screen implementation.

Any components that currently use the modal will need to be updated to use navigation:
```typescript
// Before
<InvoiceDetails invoice={selectedInvoice} onClose={() => setModalVisible(false)} />

// After
router.push(`/invoice/${selectedInvoice.id}`)
```