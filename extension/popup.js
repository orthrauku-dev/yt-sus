// Popup script
console.log('Popup script loaded');

let currentChannelId = null;
let currentChannelName = null;
let currentChannelHandle = null;
let highlightedChannels = {};
let settings = {
  showVideoTitle: true,
  showChannelHeader: true,
  showSidebar: true
};

// DOM elements
const channelInfo = document.getElementById('channelInfo');
const toggleButton = document.getElementById('toggleButton');
const channelList = document.getElementById('channelList');
const channelCount = document.getElementById('channelCount');
const clearAllBtn = document.getElementById('clearAllBtn');
const toggleVideoTitle = document.getElementById('toggleVideoTitle');
const toggleChannelHeader = document.getElementById('toggleChannelHeader');
const toggleSidebar = document.getElementById('toggleSidebar');

// Initialize popup
async function init() {
  console.log('Initializing popup...');
  
  // Load settings
  await loadSettings();
  
  // Load highlighted channels
  await loadHighlightedChannels();
  
  // Get current tab info
  await getCurrentChannelInfo();
  
  // Set up event listeners
  toggleButton.addEventListener('click', handleToggle);
  clearAllBtn.addEventListener('click', handleClearAll);
  toggleVideoTitle.addEventListener('change', handleSettingChange);
  toggleChannelHeader.addEventListener('change', handleSettingChange);
  toggleSidebar.addEventListener('change', handleSettingChange);
}

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get(['warningSettings']);
  if (result.warningSettings) {
    settings = result.warningSettings;
  }
  
  // Update checkboxes
  toggleVideoTitle.checked = settings.showVideoTitle;
  toggleChannelHeader.checked = settings.showChannelHeader;
  toggleSidebar.checked = settings.showSidebar;
  
  console.log('Loaded settings:', settings);
}

// Handle setting toggle change
async function handleSettingChange(e) {
  const settingName = e.target.id.replace('toggle', '').charAt(0).toLowerCase() + 
                      e.target.id.replace('toggle', '').slice(1);
  
  settings[`show${e.target.id.replace('toggle', '')}`] = e.target.checked;
  
  // Save settings
  await chrome.storage.local.set({ warningSettings: settings });
  
  // Notify content script to update
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.includes('youtube.com')) {
    chrome.tabs.sendMessage(tab.id, { 
      action: 'updateSettings', 
      settings: settings 
    }).catch(() => {
      // Ignore errors if content script isn't loaded
    });
  }
  
  console.log('Settings updated:', settings);
}

// Load highlighted channels from storage
async function loadHighlightedChannels() {
  const response = await chrome.runtime.sendMessage({ action: 'getHighlightedChannels' });
  highlightedChannels = response.channels || {};
  console.log('Loaded channels:', highlightedChannels);
  
  updateChannelList();
}

// Get current channel info from active tab
async function getCurrentChannelInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
      channelInfo.innerHTML = '<p class="info-text">Not on a YouTube page</p>';
      toggleButton.disabled = true;
      return;
    }
    
    // Extract channel info from URL
    const url = tab.url;
    const channelId = extractChannelIdFromUrl(url);
    
    if (!channelId) {
      channelInfo.innerHTML = '<p class="info-text">Visit a YouTube channel page to highlight it</p>';
      toggleButton.disabled = true;
      return;
    }
    
    currentChannelId = channelId;
    currentChannelHandle = channelId.startsWith('@') ? channelId : null;
    
    // Try to get channel name from tab title
    if (tab.title && tab.title !== 'YouTube') {
      currentChannelName = tab.title.replace(' - YouTube', '').trim();
    } else {
      currentChannelName = channelId;
    }
    
    // Update UI
    const isHighlighted = highlightedChannels[currentChannelId];
    
    channelInfo.innerHTML = `
      <div class="channel-details">
        <div class="channel-name">${escapeHtml(currentChannelName)}</div>
        <div class="channel-id">${escapeHtml(currentChannelId)}</div>
      </div>
    `;
    
    toggleButton.disabled = false;
    
    if (isHighlighted) {
      toggleButton.textContent = '✓ Remove Warning';
      toggleButton.classList.add('highlighted');
    } else {
      toggleButton.textContent = '⚠️ Add Warning';
      toggleButton.classList.remove('highlighted');
    }
    
  } catch (error) {
    console.error('Error getting channel info:', error);
    channelInfo.innerHTML = '<p class="info-text">Error loading channel info</p>';
    toggleButton.disabled = true;
  }
}

// Extract channel ID from URL
function extractChannelIdFromUrl(url) {
  if (!url) return null;
  
  // Match /channel/CHANNEL_ID format
  const channelMatch = url.match(/\/channel\/([\w-]+)/);
  if (channelMatch) return channelMatch[1];
  
  // Match /@handle format
  const handleMatch = url.match(/\/@([\w-]+)/);
  if (handleMatch) return `@${handleMatch[1]}`;
  
  // Match /c/CUSTOM_NAME format
  const customMatch = url.match(/\/c\/([\w-]+)/);
  if (customMatch) return customMatch[1];
  
  // Match /user/USERNAME format
  const userMatch = url.match(/\/user\/([\w-]+)/);
  if (userMatch) return userMatch[1];
  
  return null;
}

// Handle toggle button click
async function handleToggle() {
  if (!currentChannelId) return;
  
  toggleButton.disabled = true;
  toggleButton.textContent = 'Processing...';
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'toggleChannel',
      channelId: currentChannelId,
      channelName: currentChannelName,
      channelHandle: currentChannelHandle
    });
    
    console.log('Toggle response:', response);
    
    if (response.success) {
      // Reload highlighted channels
      await loadHighlightedChannels();
      
      // Update button
      if (response.highlighted) {
        toggleButton.textContent = '✓ Remove Warning';
        toggleButton.classList.add('highlighted');
      } else {
        toggleButton.textContent = '⚠️ Add Warning';
        toggleButton.classList.remove('highlighted');
      }
      
      toggleButton.disabled = false;
    }
  } catch (error) {
    console.error('Error toggling highlight:', error);
    toggleButton.textContent = 'Error - Try Again';
    toggleButton.disabled = false;
  }
}

// Handle clear all button click
async function handleClearAll() {
  if (!confirm('Are you sure you want to remove all AI content warnings?')) {
    return;
  }
  
  try {
    await chrome.runtime.sendMessage({ action: 'clearAll' });
    await loadHighlightedChannels();
    await getCurrentChannelInfo();
  } catch (error) {
    console.error('Error clearing channels:', error);
  }
}

// Update the channel list display
function updateChannelList() {
  const channels = Object.values(highlightedChannels);
  channelCount.textContent = channels.length;
  
  if (channels.length === 0) {
    channelList.innerHTML = '<p class="info-text">No channels highlighted yet</p>';
    return;
  }
  
  // Sort by date added (newest first)
  channels.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  
  channelList.innerHTML = channels.map(channel => {
    const date = new Date(channel.addedAt).toLocaleDateString();
    return `
      <div class="channel-item" data-channel-id="${escapeHtml(channel.id)}">
        <div class="channel-item-info">
          <div class="channel-item-name">⚠️ ${escapeHtml(channel.name)}</div>
          <div class="channel-item-handle">${escapeHtml(channel.handle || channel.id)}</div>
          <div class="channel-item-date">Marked: ${date}</div>
        </div>
        <button class="remove-btn" data-channel-id="${escapeHtml(channel.id)}">Remove</button>
      </div>
    `;
  }).join('');
  
  // Add event listeners to remove buttons
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const channelId = e.target.getAttribute('data-channel-id');
      await removeChannel(channelId);
    });
  });
}

// Remove a specific channel
async function removeChannel(channelId) {
  try {
    const channel = highlightedChannels[channelId];
    await chrome.runtime.sendMessage({
      action: 'toggleChannel',
      channelId: channelId,
      channelName: channel?.name || channelId,
      channelHandle: channel?.handle || null
    });
    
    await loadHighlightedChannels();
    await getCurrentChannelInfo();
  } catch (error) {
    console.error('Error removing channel:', error);
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
