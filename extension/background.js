// Background service worker
const DEBUG_BACKGROUND = false; // Set to true to enable debug logging
const logBg = DEBUG_BACKGROUND ? console.log.bind(console) : () => {};
const logBgError = console.error.bind(console); // Always log errors

logBg('YouTube Sentiment Warning background script loaded');

const API_BASE_URL = 'https://yt-sus-func-eyamhschcdg3dcbx.eastus-01.azurewebsites.net/api';

// Initialize the database when extension is installed
chrome.runtime.onInstalled.addListener(async () => {
  logBg('Extension installed, initializing database...');
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
        logBg('API sync is disabled, skipping');
        return;
      }
      
      if (result.lastAPISync) {
        const lastSync = new Date(result.lastAPISync);
        const now = new Date();
        const hoursSinceSync = (now - lastSync) / (1000 * 60 * 60);
        
        // Only sync if more than 24 hours have passed
        if (hoursSinceSync < 24) {
          logBg(`Last sync was ${hoursSinceSync.toFixed(1)} hours ago, skipping sync`);
          return;
        }
      }
    }
    
    logBg('Fetching flagged channels from API...');
    const response = await fetch(`${API_BASE_URL}/flagged_channels`);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const apiFlaggedChannels = await response.json();
    logBg('Fetched from API:', Object.keys(apiFlaggedChannels).length, 'channels');
    logBg('API Response:', apiFlaggedChannels);
    
    // Merge with existing locally flagged channels
    const result = await chrome.storage.local.get(['highlightedChannels', 'channelVotes']);
    const localChannels = result.highlightedChannels || {};
    const localVotes = result.channelVotes || {};
    
    logBg('Local channels before merge:', Object.keys(localChannels).length);
    
    // Convert API format to local format
    const mergedChannels = { ...localChannels };
    const mergedVotes = { ...localVotes };
    
    for (const [channelId, data] of Object.entries(apiFlaggedChannels)) {
      if (!mergedChannels[channelId]) {
        mergedChannels[channelId] = {
          id: channelId,
          name: data.channelName || 'Unknown',
          handle: channelId,
          addedAt: data.flaggedDate || new Date().toISOString(),
          highlighted: true,
          autoAdded: true,  // API-synced channels are auto-added
          fromAPI: true,
          reason: data.reason,
          votes: data.votes || 0
        };
      } else {
        // Update existing channel with vote count
        mergedChannels[channelId].votes = data.votes || 0;
      }
      
      // Update vote count from API
      if (data.votes !== undefined) {
        mergedVotes[channelId] = data.votes;
      }
    }
    
    await chrome.storage.local.set({ 
      highlightedChannels: mergedChannels,
      channelVotes: mergedVotes,
      lastAPISync: new Date().toISOString()
    });
    
    logBg('Merged channels:', Object.keys(mergedChannels).length, 'total');
    logBg('Updated votes for', Object.keys(mergedVotes).length, 'channels');
    
    // Notify all YouTube tabs to update highlights
    notifyAllTabs(mergedChannels);
  } catch (error) {
    logBgError('Failed to fetch from API:', error);
  }
}

// Notify all YouTube tabs
function notifyAllTabs(channels) {
  chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { 
        action: 'updateHighlights',
        channels: channels 
      }).catch(err => logBg('Could not send message to tab:', err));
    });
  });
}

// Check if we should sync (once per day)
async function shouldSync() {
  const result = await chrome.storage.local.get(['lastAPISync', 'apiSyncEnabled']);
  const apiSyncEnabled = result.apiSyncEnabled !== false;
  
  if (!apiSyncEnabled) {
    logBg('API sync is disabled');
    return false;
  }
  
  if (!result.lastAPISync) {
    logBg('No previous sync, should sync now');
    return true;
  }
  
  const lastSync = new Date(result.lastAPISync);
  const now = new Date();
  const hoursSinceSync = (now - lastSync) / (1000 * 60 * 60);
  
  // Sync if more than 24 hours have passed
  if (hoursSinceSync >= 24) {
    logBg(`Last sync was ${hoursSinceSync.toFixed(1)} hours ago, syncing now`);
    return true;
  }
  
  logBg(`Last sync was ${hoursSinceSync.toFixed(1)} hours ago, skipping sync`);
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
  logBg('Background received message:', request);
  
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
        logBg('Channel removed:', channelId);
      } else {
        channels[channelId] = {
          id: channelId,
          name: channelName,
          handle: channelHandle,
          addedAt: new Date().toISOString(),
          highlighted: true,
          autoAdded: false  // Manually added
        };
        logBg('Channel added manually:', channelId);
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
      const { channelId, channelName, votes } = request;
      
      // Add channel if not already in list
      if (!channels[channelId]) {
        channels[channelId] = {
          id: channelId,
          name: channelName,
          handle: channelId,
          addedAt: new Date().toISOString(),
          highlighted: true,
          autoAdded: true,  // Auto-added via voting threshold
          votes: votes || 0
        };
        logBg(`Channel added via voting (auto-added): ${channelId} with ${votes} votes`);
        
        await chrome.storage.local.set({ highlightedChannels: channels });
        
        // Notify all YouTube tabs to update highlights
        notifyAllTabs(channels);
        
        sendResponse({ success: true });
      } else {
        logBg('Channel already in list:', channelId);
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
  
  if (request.action === 'clearAutoAdded') {
    chrome.storage.local.get('highlightedChannels', async (result) => {
      const channels = result.highlightedChannels || {};
      const filteredChannels = {};
      
      // Keep only manually added channels
      for (const [id, channel] of Object.entries(channels)) {
        if (!channel.autoAdded) {
          filteredChannels[id] = channel;
        }
      }
      
      await chrome.storage.local.set({ highlightedChannels: filteredChannels });
      notifyAllTabs(filteredChannels);
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'clearManualAdded') {
    chrome.storage.local.get('highlightedChannels', async (result) => {
      const channels = result.highlightedChannels || {};
      const filteredChannels = {};
      
      // Keep only auto-added channels
      for (const [id, channel] of Object.entries(channels)) {
        if (channel.autoAdded) {
          filteredChannels[id] = channel;
        }
      }
      
      await chrome.storage.local.set({ highlightedChannels: filteredChannels });
      notifyAllTabs(filteredChannels);
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'getChannelVotes') {
    // Handle API call from content script to avoid CORS
    const channelId = request.channelId;
    fetch(`${API_BASE_URL}/check_channel?channelId=${encodeURIComponent(channelId)}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        sendResponse({ success: true, votes: data.votes || 0 });
      })
      .catch(error => {
        logBgError('Failed to get votes from API:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'voteChannel') {
    // Handle API call from content script to avoid CORS
    const { channelId, channelName } = request;
    const voteUrl = `${API_BASE_URL}/vote_channel`;
    logBg('Voting via API:', voteUrl, { channelId, channelName });
    
    fetch(voteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Version': chrome.runtime.getManifest().version,
        'X-Extension-ID': chrome.runtime.id
      },
      body: JSON.stringify({
        channelId: channelId,
        channelName: channelName
      })
    })
      .then(response => {
        logBg('Vote API response status:', response.status);
        if (!response.ok) {
          return response.text().then(text => {
            logBgError('Vote API error response:', text);
            throw new Error(`API returned ${response.status}: ${text}`);
          });
        }
        return response.json();
      })
      .then(data => {
        logBg('Vote API success:', data);
        sendResponse({ success: true, votes: data.votes || 0 });
      })
      .catch(error => {
        logBgError('Failed to vote via API:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.highlightedChannels) {
    logBg('Highlighted channels updated:', changes.highlightedChannels.newValue);
  }
});
