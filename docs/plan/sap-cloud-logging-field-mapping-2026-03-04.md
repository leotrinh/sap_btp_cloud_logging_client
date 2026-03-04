# BTP Cloud Logging Field Mapping Plan - 2026-03-04

Transform internal field names to match BTP Cloud Logging standard while maintaining current API usage. This approach allows filtering on standard SAP fields without breaking existing user code.

## Problem Analysis

Current logs use custom field names that don't match BTP Cloud Logging standards:
- `application` → should be `app_name` 
- `subaccount` → should be `organization_name`
- `message` → should map to `msg` (already present in default logs)

BTP Cloud Logging default fields that can be filtered:
- `msg` (main message field)
- `app_name` (application name)
- `organization_name` (subaccount/org)
- `@timestamp` (timestamp)
- `level` (log level)

## Solution: Field Transformation Layer

Add a transformation step in `LogFormatter` that maps internal fields to Cloud Logging Standard Fields before sending to transport.

### Field Mapping Strategy

```javascript
// Internal API fields → BTP Cloud Logging fields
{
  message: "user message",           // Keep for backward compatibility
  msg: "user message",              // Map to SAP standard
  application: "MyApp",             // Keep for backward compatibility  
  app_name: "MyApp",                 // Map to SAP standard
  subaccount: "MyOrg",              // Keep for backward compatibility
  organization_name: "MyOrg",       // Map to SAP standard
  // Other fields remain unchanged
}
```

### Implementation Plan

1. **Update LogFormatter.format()** - Add field mapping transformation
2. **Add configuration option** - `enableSAPFieldMapping` (default: true)
3. **Update TypeScript definitions** - Add Cloud Logging Standard Fields to interfaces
4. **Add unit tests** - Verify field mapping works correctly
5. **Update documentation** - Explain field mapping behavior

### Key Benefits

✅ **No Breaking Changes** - Existing API usage remains identical
✅ **SAP Filtering Support** - Can filter on standard SAP fields  
✅ **Backward Compatible** - Both old and new field names present
✅ **Configurable** - Can disable mapping if needed
✅ **Future Proof** - Aligns with SAP ecosystem standards

### Implementation Details

The transformation will:
- Keep all existing fields for backward compatibility
- Add Cloud Logging Standard Fields with identical values
- Only transform when `enableSAPFieldMapping: true` (default)
- Handle both single logs and batch logs
- Preserve all custom metadata fields unchanged

This approach ensures users can continue using their current code while gaining BTP Cloud Logging filtering capabilities.
