# BTP Cloud Logging Field Mapping

## Overview
BTP Cloud Logging field mapping transforms internal field names to BTP standard fields while maintaining backward compatibility.

## Field Mapping
| Internal Field | BTP Standard Field | Description |
|---------------|------------------|-------------|
| `message` | `msg` | Main log message |
| `application` | `app_name` | Application name |
| `subaccount` | `organization_name` | Organization/subaccount |

## Configuration
```javascript
const logger = createLogger({
  applicationName: 'MyApp',
  enableSAPFieldMapping: true // Default: true
});
```

## Benefits
✅ No breaking changes  
✅ BTP filtering support  
✅ Backward compatible  
✅ Configurable  
✅ Preserves custom metadata
