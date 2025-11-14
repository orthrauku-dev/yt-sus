// Background service worker
console.log('YouTube AI Content Warning background script loaded');

// Initialize the database when extension is installed
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed, initializing database...');
  await chrome.storage.local.set({ highlightedChannels: {} });
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  if (request.action === 'getHighlightedChannels') {
    chrome.storage.local.get('highlightedChannels', (result) => {
      sendResponse({ channels: result.highlightedChannels || {} });
    });
    return true; // Keep message channel open for async response
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
      chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            action: 'updateHighlights',
            channels: channels 
          }).catch(err => console.log('Could not send message to tab:', err));
        });
      });
      
      sendResponse({ success: true, highlighted: !!channels[channelId] });
    });
    return true;
  }
  
  if (request.action === 'clearAll') {
    chrome.storage.local.set({ highlightedChannels: {} }, () => {
      // Notify all YouTube tabs to update highlights
      chrome.tabs.query({ url: 'https://www.youtube.com/*' }, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { 
            action: 'updateHighlights',
            channels: {} 
          }).catch(err => console.log('Could not send message to tab:', err));
        });
      });
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
