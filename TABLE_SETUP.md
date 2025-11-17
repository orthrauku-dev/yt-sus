# Azure Table Storage Setup Guide

## Table Schema

**Table Name:** `ytsustable`

### Entity Structure

Each flagged YouTuber should be added as an entity with the following fields:

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| **PartitionKey** | string | ✅ | Always set to `"flagged"` | `"flagged"` |
| **RowKey** | string | ✅ | YouTube Channel ID | `"UCxxxxxxxx"` or `"@channelhandle"` |
| **ChannelName** | string | ⭕ | Display name of the channel | `"AI Creator Channel"` |
| **FlaggedDate** | string | ⭕ | ISO 8601 timestamp | `"2025-11-17T12:00:00Z"` |
| **Reason** | string | ⭕ | Why they're flagged | `"AI Generated Content"` |

## Adding Flagged Channels

### Method 1: Azure Portal
1. Go to Azure Portal → Storage Account `ytsusstr`
2. Navigate to "Tables" → `ytsustable`
3. Click "Add Entity"
4. Fill in:
   - **PartitionKey**: `flagged`
   - **RowKey**: Channel ID (e.g., `UCxxxxxxxxxx` or `@channelname`)
   - **ChannelName** (add property): Channel display name
   - **FlaggedDate** (add property): Current date/time
   - **Reason** (add property): Why flagged

### Method 2: Azure CLI
```bash
# Add a single channel
az storage entity insert \
  --account-name ytsusstr \
  --table-name ytsustable \
  --entity PartitionKey=flagged RowKey=UCxxxxxxxxxx ChannelName="AI Channel" FlaggedDate="2025-11-17T12:00:00Z" Reason="AI Generated Content" \
  --auth-mode login
```

### Method 3: Bulk Import (JSON)
Create a `channels.json` file:
```json
[
  {
    "PartitionKey": "flagged",
    "RowKey": "UCxxxxxxxxxx",
    "ChannelName": "AI Creator 1",
    "FlaggedDate": "2025-11-17T12:00:00Z",
    "Reason": "AI Generated Content"
  },
  {
    "PartitionKey": "flagged",
    "RowKey": "@aihandle",
    "ChannelName": "AI Creator 2",
    "FlaggedDate": "2025-11-17T12:00:00Z",
    "Reason": "AI Voiceover"
  }
]
```

## API Endpoints

### 1. Get All Flagged Channels
**Endpoint:** `GET /api/flagged_channels`

**Response:**
```json
{
  "UCxxxxxxxxxx": {
    "channelName": "AI Channel",
    "flaggedDate": "2025-11-17T12:00:00Z",
    "reason": "AI Generated Content"
  },
  "@channelhandle": {
    "channelName": "Another AI Channel",
    "flaggedDate": "2025-11-17T13:00:00Z",
    "reason": "AI Voiceover"
  }
}
```

**Usage in Extension:**
```javascript
const response = await fetch('https://YOUR-FUNCTION-APP.azurewebsites.net/api/flagged_channels');
const flaggedChannels = await response.json();
// Now flaggedChannels is in the exact format your extension expects!
```

### 2. Check Single Channel
**Endpoint:** `GET /api/check_channel?channelId=UCxxxxxxxxxx`

**Response (if flagged):**
```json
{
  "flagged": true,
  "channelId": "UCxxxxxxxxxx",
  "details": {
    "channelName": "AI Channel",
    "flaggedDate": "2025-11-17T12:00:00Z",
    "reason": "AI Generated Content"
  }
}
```

**Response (if not flagged):**
```json
{
  "flagged": false,
  "channelId": "UCxxxxxxxxxx"
}
```

### 3. Debug Endpoint
**Endpoint:** `GET /api/table_read?partitionKey=flagged`

Returns raw table data for debugging.

## Example Channel IDs to Add

YouTube channel IDs can be in different formats:
- `UCxxxxxxxxxx` (Channel ID format)
- `@channelhandle` (Handle format)
- Custom URL format

To find a channel's ID:
1. Go to the channel page
2. Look at the URL:
   - `youtube.com/channel/UCxxxxxxxxxx` → Use `UCxxxxxxxxxx`
   - `youtube.com/@channelhandle` → Use `@channelhandle`
   - `youtube.com/c/customname` → Use `customname`

## Testing

Test the API locally:
```bash
# Get all flagged channels
curl http://localhost:7071/api/flagged_channels

# Check specific channel
curl "http://localhost:7071/api/check_channel?channelId=UCxxxxxxxxxx"
```

## Next Steps for Extension Integration

Update your extension's `background.js` to fetch from the API instead of local storage:

```javascript
async function updateFlaggedChannels() {
  try {
    const response = await fetch('https://YOUR-FUNCTION-APP.azurewebsites.net/api/flagged_channels');
    const flaggedChannels = await response.json();
    
    // Store in chrome.storage for offline access
    await chrome.storage.local.set({ highlightedChannels: flaggedChannels });
    
    console.log('Updated flagged channels:', Object.keys(flaggedChannels).length);
  } catch (error) {
    console.error('Failed to fetch flagged channels:', error);
  }
}

// Update every 5 minutes
setInterval(updateFlaggedChannels, 5 * 60 * 1000);

// Update on extension start
updateFlaggedChannels();
```
