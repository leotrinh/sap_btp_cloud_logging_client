# Changelog

## [1.0.7] - 2026-03-05

### 🚀 **Features**
- **NEW**: `removeOriginalFieldsAfterMapping` config option
  - Default behavior: Remove original fields (`message`, `application`, `subaccount`) after BTP field mapping
  - Prevents duplicate fields in Cloud Logging logs
  - Set `removeOriginalFieldsAfterMapping: false` to keep original fields for backward compatibility

### 🔧 **Improvements**
- **Enhanced**: BTP Cloud Logging field mapping logic
- **Fixed**: Metadata override issue - user metadata now takes precedence over default values
- **Improved**: TypeScript types for better type safety
- **Better**: Error handling for edge cases (null/undefined values, circular references)

### 🧪 **Testing**
- **Added**: Comprehensive edge case test suite
- **Added**: Tests for `removeOriginalFieldsAfterMapping` behavior
- **Added**: Tests for metadata override scenarios
- **Added**: Tests for null/undefined/empty value handling
- **Added**: Tests for circular object references
- **Added**: Tests for extreme string lengths

### 🐛 **Bug Fixes**
- **CRITICAL**: Fixed metadata override bug where user metadata was being overwritten by default values
- **Fixed**: TypeScript compilation errors for dynamic property assignments
- **Fixed**: Inconsistent field mapping behavior when metadata contains BTP fields

### 📝 **Breaking Changes**
- **Default**: Original fields are now removed after BTP mapping (cleaner logs)
- **Migration**: Set `removeOriginalFieldsAfterMapping: false` to maintain old behavior

### 💡 **Usage Examples**

```javascript
// New default behavior (clean logs)
const logger = new CloudLoggingService({
  applicationName: 'MyApp',
  enableSAPFieldMapping: true
  // removeOriginalFieldsAfterMapping: true (default)
});

// Backward compatibility mode
const logger = new CloudLoggingService({
  applicationName: 'MyApp', 
  enableSAPFieldMapping: true,
  removeOriginalFieldsAfterMapping: false // Keep original fields
});
```

---

## Previous Versions

### [1.0.6] - Previous
- Initial BTP Cloud Logging integration
- Basic field mapping support

---

# Create GitHub Actions Directory Structure 
```
.github/
└── workflows/
    └── release.yml
```

# Set Up Token & Package
## Set Up Token
### Generate NPM Token
Go to npmjs.com and log in
Click on your profile → "Access Tokens"
Click "Generate New Token" → "Automation"
Copy the generated token

###  Add NPM Token to GitHub Secret
Go to your GitHub repository
Navigate to Settings → Secrets and Variables → Actions
Click "New repository secret"
Name: NPM_TOKEN
Value: Paste your NPM token
Click "Add secret"