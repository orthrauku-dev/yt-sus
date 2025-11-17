// Background service worker
console.log('YouTube Sentiment Warning background script loaded');

const API_URL = 'http://localhost:7071/api/flagged_channels';
// When deploying, change to: 'https://YOUR-FUNCTION-APP.azurewebsites.net/api/flagged_channels'

// Initialize the database when extension is installed
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed, initializing database...');
  await chrome.storage.local.set({ 
    highlightedChannels: {},
    apiSyncEnabled: true  // API sync enabled by default
  });
  // Fetch from API on install (force sync)
  await fetchFlaggedChannelsFromAPI(true);
});

// Fetch flagged channels from API
async function fetchFlaggedChannelsFromAPI(forceSync = false) {
  try {
    // Check if we should sync (unless forced)
    if (!forceSync) {
      const result = await chrome.storage.local.get(['lastAPISync', 'apiSyncEnabled']);
      const apiSyncEnabled = result.apiSyncEnabled !== false;
      
      if (!apiSyncEnabled) {
        console.log('API sync is disabled, skipping');
        return;
      }
      
      if (result.lastAPISync) {
        const lastSync = new Date(result.lastAPISync);
        const now = new Date();
        const hoursSinceSync = (now - lastSync) / (1000 * 60 * 60);
        
        // Only sync if more than 24 hours have passed
        if (hoursSinceSync < 24) {
          console.log(`Last sync was ${hoursSinceSync.toFixed(1)} hours ago, skipping sync`);
          return;
        }
      }
    }
    
    console.log('Fetching flagged channels from API...');
    const response = await fetch(API_URL);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const apiFlaggedChannels = await response.json();
    console.log('Fetched from API:', Object.keys(apiFlaggedChannels).length, 'channels');
    
    // Merge with existing locally flagged channels
    const result = await chrome.storage.local.get(['highlightedChannels']);
    const localChannels = result.highlightedChannels || {};
    
    // Convert API format to local format
    const mergedChannels = { ...localChannels };
    
    for (const [channelId, data] of Object.entries(apiFlaggedChannels)) {
      if (!mergedChannels[channelId]) {
        mergedChannels[channelId] = {
          id: channelId,
          name: data.channelName || 'Unknown',
          handle: channelId,
          addedAt: data.flaggedDate || new Date().toISOString(),
          highlighted: true,
          fromAPI: true,
          reason: data.reason
        };
      }
    }
    
    await chrome.storage.local.set({ 
      highlightedChannels: mergedChannels,
      lastAPISync: new Date().toISOString()
    });
    
    console.log('Merged channels:', Object.keys(mergedChannels).length, 'total');
    
    // Notify all YouTube tabs to update highlights
    notifyAllTabs(mergedChannels);
  } catch (error) {
    console.error('Failed to fetch from API:', error);
  }
}

// Notify all YouTube tabs
function notifyAllTabs(channels) {
  chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { 
        action: 'updateHighlights',
        channels: channels 
      }).catch(err => console.log('Could not send message to tab:', err));
    });
  });
}

// Check if we should sync (once per day)
async function shouldSync() {
  const result = await chrome.storage.local.get(['lastAPISync', 'apiSyncEnabled']);
  const apiSyncEnabled = result.apiSyncEnabled !== false;
  
  if (!apiSyncEnabled) {
    console.log('API sync is disabled');
    return false;
  }
  
  if (!result.lastAPISync) {
    console.log('No previous sync, should sync now');
    return true;
  }
  
  const lastSync = new Date(result.lastAPISync);
  const now = new Date();
  const hoursSinceSync = (now - lastSync) / (1000 * 60 * 60);
  
  // Sync if more than 24 hours have passed
  if (hoursSinceSync >= 24) {
    console.log(`Last sync was ${hoursSinceSync.toFixed(1)} hours ago, syncing now`);
    return true;
  }
  
  console.log(`Last sync was ${hoursSinceSync.toFixed(1)} hours ago, skipping sync`);
  return false;
}

// Scheduled sync check (runs every hour to check if 24 hours have passed)
async function scheduledSyncCheck() {
  if (await shouldSync()) {
    await fetchFlaggedChannelsFromAPI(true);
  }
}

// Check every hour if we need to sync (but will only sync once per 24 hours)
setInterval(scheduledSyncCheck, 60 * 60 * 1000);

// Check on startup (will only sync if 24 hours have passed since last sync)
scheduledSyncCheck();

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  if (request.action === 'getHighlightedChannels') {
    chrome.storage.local.get('highlightedChannels', (result) => {
      sendResponse({ channels: result.highlightedChannels || {} });
    });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'refreshFromAPI') {
    fetchFlaggedChannelsFromAPI(true).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  
  if (request.action === 'toggleAPISync') {
    chrome.storage.local.set({ apiSyncEnabled: request.enabled }, () => {
      if (request.enabled) {
        fetchFlaggedChannelsFromAPI(true);
      }
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'getSettings') {
    chrome.storage.local.get(['apiSyncEnabled', 'lastAPISync'], (result) => {
      sendResponse({ 
        apiSyncEnabled: result.apiSyncEnabled !== false,
        lastAPISync: result.lastAPISync
      });
    });
    return true;
  }
  
  if (request.action === 'toggleChannel') {
    chrome.storage.local.get('highlightedChannels', async (result) => {
      const channels = result.highlightedChannels || {};
      const { channelId, channelName, channelHandle } = request;
      
      if (channels[channelId]) {
        delete channels[channelId];
        console.log('Channel removed:', channelId);
      } else {
        channels[channelId] = {
          id: channelId,
          name: channelName,
          handle: channelHandle,
          addedAt: new Date().toISOString(),
          highlighted: true
        };
        console.log('Channel added:', channelId);
      }
      
      await chrome.storage.local.set({ highlightedChannels: channels });
      
      // Notify all YouTube tabs to update highlights
      notifyAllTabs(channels);
      
      sendResponse({ success: true, highlighted: !!channels[channelId] });
    });
    return true;
  }
  
  if (request.action === 'addChannel') {
    chrome.storage.local.get('highlightedChannels', async (result) => {
      const channels = result.highlightedChannels || {};
      const { channelId, channelName } = request;
      
      // Add channel if not already in list
      if (!channels[channelId]) {
        channels[channelId] = {
          id: channelId,
          name: channelName,
          handle: channelId,
          addedAt: new Date().toISOString(),
          highlighted: true,
          addedByVoting: true
        };
        console.log('Channel added via voting:', channelId);
        
        await chrome.storage.local.set({ highlightedChannels: channels });
        
        // Notify all YouTube tabs to update highlights
        notifyAllTabs(channels);
        
        sendResponse({ success: true });
      } else {
        console.log('Channel already in list:', channelId);
        sendResponse({ success: false, reason: 'already_exists' });
      }
    });
    return true;
  }
  
  if (request.action === 'clearAll') {
    chrome.storage.local.set({ highlightedChannels: {} }, () => {
      // Notify all YouTube tabs to update highlights
      notifyAllTabs({});
      sendResponse({ success: true });
    });
    return true;
  }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.highlightedChannels) {
    console.log('Highlighted channels updated:', changes.highlightedChannels.newValue);
  }
});
