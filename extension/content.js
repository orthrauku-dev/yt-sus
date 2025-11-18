// Content script for YouTube pages
console.log('YouTube AI Content Warning content script loaded');

let highlightedChannels = {};
let settings = {
  showVideoTitle: true,
  showChannelHeader: true
};

// Initialize by loading highlighted channels and settings
async function init() {
  const response = await chrome.runtime.sendMessage({ action: 'getHighlightedChannels' });
  highlightedChannels = response.channels || {};
  console.log('Loaded highlighted channels:', highlightedChannels);
  
  // Load settings
  const settingsResult = await chrome.storage.local.get(['warningSettings']);
  if (settingsResult.warningSettings) {
    settings = settingsResult.warningSettings;
  }
  console.log('Loaded settings:', settings);
  
  // Don't call applyHighlights here - it will be triggered by yt-navigate-finish event
}

// Extract channel ID from various YouTube URL formats
function extractChannelId(url) {
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

// Extract channel name from element
function extractChannelName(element) {
  // Try to find channel name in various places
  const nameElement = element.querySelector('#channel-name, #text, .yt-simple-endpoint.style-scope.yt-formatted-string');
  return nameElement?.textContent?.trim() || 'Unknown Channel';
}

// Apply highlights to channel elements
function applyHighlights() {
  console.log('Applying highlights...');
  console.log('Highlighted channels:', highlightedChannels);
  
  // Try multiple selectors for channel header (YouTube changes their structure)
  const selectors = [
    '#channel-header',
    'ytd-c4-tabbed-header-renderer',
    'ytd-page-header-renderer',
    '#page-header',
    'yt-page-header-renderer',
    '.page-header-view-model-wiz'
  ];
  
  let channelHeader = null;
  for (const selector of selectors) {
    channelHeader = document.querySelector(selector);
    if (channelHeader) {
      console.log('Channel header found with selector:', selector);
      break;
    }
  }
  
  console.log('Channel header element found:', channelHeader);
  
  if (channelHeader) {
    // First, always unhighlight to clear any previous state
    unhighlightElement(channelHeader);
    
    const channelLink = channelHeader.querySelector('a[href*="/channel/"], a[href*="/@"], a.yt-simple-endpoint[href*="/@"]');
    console.log('Channel link found:', channelLink);
    console.log('Channel link href:', channelLink?.href);
    
    if (channelLink) {
      const channelId = extractChannelId(channelLink.href);
      console.log('Extracted channel ID:', channelId);
      console.log('Is highlighted?:', highlightedChannels[channelId]);
      
      if (channelId && highlightedChannels[channelId]) {
        console.log('CALLING highlightElement for channel:', channelId);
        highlightElement(channelHeader);
      } else {
        console.log('Channel not in highlighted list or no ID found');
      }
    } else {
      console.log('No channel link found in header');
      // Try alternate approach - get from URL
      if (window.location.pathname.includes('/@') || window.location.pathname.includes('/channel/')) {
        const channelId = extractChannelId(window.location.href);
        console.log('Got channel ID from URL:', channelId);
        if (channelId && highlightedChannels[channelId]) {
          highlightElement(channelHeader);
        }
      }
    }
  } else {
    console.log('No channel header found - might not be on a channel page');
    console.log('Page URL:', window.location.href);
    console.log('Available elements:', document.querySelectorAll('[id*="header"], [class*="header"]').length);
  }
  
  // Also check for video pages and add warning to video title
  checkVideoPage();
}

// Store the current video's channel info
let currentVideoChannelName = null;

// Check if we're on a video page and add warning to title if channel is highlighted
function checkVideoPage() {
  // Check if video title warnings are enabled
  if (settings.showVideoTitle) {
    // Find video owner channel link
    const ownerLink = document.querySelector('ytd-watch-metadata a.yt-simple-endpoint[href*="/@"], ytd-watch-metadata a.yt-simple-endpoint[href*="/channel/"]');
    
    // Always remove existing warning first to avoid stale warnings
    const videoTitle = document.querySelector('ytd-watch-metadata yt-formatted-string.ytd-watch-metadata');
    if (videoTitle) {
      const existingWarning = videoTitle.querySelector('.yt-ai-warning');
      if (existingWarning) {
        existingWarning.remove();
      }
    }
    
    if (ownerLink) {
      const channelId = extractChannelId(ownerLink.href);
      
      // Get channel name from the stored channel data
      let channelNameText = '';
      if (channelId && highlightedChannels[channelId]) {
        channelNameText = highlightedChannels[channelId].name || '';
      }
      
      // Store the channel name
      currentVideoChannelName = channelNameText;
      
      console.log('Video page - Channel ID:', channelId);
      console.log('Video page - Channel Name:', currentVideoChannelName);
      
      if (channelId && highlightedChannels[channelId]) {
        console.log('Video is from highlighted channel, adding warning to title');
        
        // Find the video title
        if (videoTitle && !videoTitle.querySelector('.yt-ai-warning')) {
          const warning = document.createElement('span');
          warning.className = 'yt-ai-warning';
          warning.innerHTML = ' ⚠️ May contain AI';
          warning.title = 'This channel may use AI-generated content';
          warning.style.color = '#ff8800';
          warning.style.fontWeight = 'bold';
          warning.style.marginLeft = '12px';
          warning.style.fontSize = '0.9em';
          warning.style.display = 'inline-block';
          warning.style.whiteSpace = 'nowrap';
          warning.style.padding = '4px 8px';
          warning.style.backgroundColor = 'rgba(255, 136, 0, 0.15)';
          warning.style.borderRadius = '4px';
          warning.style.border = '1px solid rgba(255, 136, 0, 0.4)';
          
          videoTitle.appendChild(warning);
          console.log('Warning added to video title');
        }
      }
    }
  } else {
    // Remove warning if setting is disabled
    const videoTitle = document.querySelector('ytd-watch-metadata yt-formatted-string.ytd-watch-metadata');
    if (videoTitle) {
      const existingWarning = videoTitle.querySelector('.yt-ai-warning');
      if (existingWarning) {
        existingWarning.remove();
      }
    }
  }
}

// Highlight an element with warning emoji
function highlightElement(element) {
  // Check if channel header warnings are enabled
  if (!settings.showChannelHeader) {
    // Remove existing highlights if setting is off
    element.classList.remove('yt-highlighted-channel');
    const existingWarning = element.querySelector('.yt-ai-warning');
    if (existingWarning) {
      existingWarning.remove();
    }
    element.style.backgroundColor = '';
    element.style.border = '';
    console.log('Channel header warnings disabled, removed highlights');
    return;
  }
  
  element.classList.add('yt-highlighted-channel');
  
  console.log('highlightElement called on:', element);
  console.log('Element HTML:', element.innerHTML.substring(0, 200));
  
  // Don't add duplicate warnings
  if (element.querySelector('.yt-ai-warning')) {
    console.log('Warning already exists, skipping');
    return;
  }
  
  // Try multiple selectors to find channel name
  const selectors = [
    'span.yt-core-attributed-string[role="text"]',
    '.yt-core-attributed-string',
    '#channel-name',
    'yt-formatted-string#text',
    '#text'
  ];
  
  let channelNameSpan = null;
  for (const selector of selectors) {
    channelNameSpan = element.querySelector(selector);
    if (channelNameSpan) {
      console.log('Found channel name with selector:', selector);
      console.log('Channel name element:', channelNameSpan);
      console.log('Channel name text:', channelNameSpan.textContent);
      break;
    }
  }
  
  if (channelNameSpan) {
    const warning = document.createElement('span');
    warning.className = 'yt-ai-warning';
    warning.innerHTML = ' ⚠️ May contain AI';
    warning.title = 'This channel may use AI-generated content';
    warning.style.color = '#ff8800';
    warning.style.fontWeight = 'bold';
    warning.style.marginLeft = '12px';
    warning.style.fontSize = '1em';
    warning.style.display = 'inline-block';
    warning.style.whiteSpace = 'nowrap';
    warning.style.padding = '4px 8px';
    warning.style.backgroundColor = 'rgba(255, 136, 0, 0.15)';
    warning.style.borderRadius = '4px';
    warning.style.border = '1px solid rgba(255, 136, 0, 0.4)';
    
    // Insert right after the channel name span
    channelNameSpan.insertAdjacentElement('afterend', warning);
    console.log('Warning inserted successfully');
  } else {
    console.log('Could not find channel name element. Element structure:', element.outerHTML.substring(0, 500));
  }
  
  // Add subtle background highlight
  element.style.backgroundColor = 'rgba(255, 165, 0, 0.15)';
  element.style.border = '2px solid orange';
  element.style.transition = 'all 0.3s ease';
  console.log('Background highlight applied');
}

// Remove highlight from an element
function unhighlightElement(element) {
  element.classList.remove('yt-highlighted-channel');
  
  // Remove warning
  const warning = element.querySelector('.yt-ai-warning');
  if (warning) {
    warning.remove();
  }
  
  // Reset styles
  element.style.backgroundColor = '';
  element.style.border = '';
  element.style.transition = '';
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  if (request.action === 'updateHighlights') {
    highlightedChannels = request.channels || {};
    applyHighlights();
    sendResponse({ success: true });
  }
  
  if (request.action === 'highlightChannel') {
    const { channelId } = request;
    highlightedChannels[channelId] = true;
    applyHighlights();
    sendResponse({ success: true });
  }
  
  if (request.action === 'updateSettings') {
    settings = request.settings || settings;
    console.log('Settings updated:', settings);
    // Re-apply all highlights with new settings
    applyHighlights();
    sendResponse({ success: true });
  }
  
  return true;
});

// Add context menu to channel links for quick highlighting
document.addEventListener('contextmenu', (e) => {
  const link = e.target.closest('a[href*="/channel/"], a[href*="/@"], a[href*="/c/"], a[href*="/user/"]');
  if (link) {
    const channelId = extractChannelId(link.href);
    if (channelId) {
      // Store the channel ID for popup to use
      chrome.storage.local.set({ lastContextChannel: channelId });
    }
  }
});

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-apply highlights when navigating (YouTube SPA)
// Listen for YouTube's custom navigation event instead of MutationObserver
document.addEventListener('yt-navigate-finish', () => {
  console.log('YouTube navigation finished, re-applying highlights');
  applyHighlights();
});
