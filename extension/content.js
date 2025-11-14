// Content script for YouTube pages
console.log('YouTube Channel Highlighter content script loaded');

let highlightedChannels = {};

// Initialize by loading highlighted channels
async function init() {
  const response = await chrome.runtime.sendMessage({ action: 'getHighlightedChannels' });
  highlightedChannels = response.channels || {};
  console.log('Loaded highlighted channels:', highlightedChannels);
  applyHighlights();
  
  // Set up observer to watch for dynamic content
  observePageChanges();
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
  
  // Find all channel links on the page
  const channelLinks = document.querySelectorAll('a[href*="/channel/"], a[href*="/@"], a[href*="/c/"], a[href*="/user/"]');
  
  channelLinks.forEach(link => {
    const channelId = extractChannelId(link.href);
    if (!channelId) return;
    
    if (highlightedChannels[channelId]) {
      highlightElement(link);
      
      // Also highlight parent containers for better visibility
      const videoRenderer = link.closest('ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-channel-renderer');
      if (videoRenderer) {
        highlightElement(videoRenderer);
      }
    } else {
      unhighlightElement(link);
      const videoRenderer = link.closest('ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-channel-renderer');
      if (videoRenderer) {
        unhighlightElement(videoRenderer);
      }
    }
  });
  
  // Highlight channel headers on channel pages
  const channelHeader = document.querySelector('#channel-header, ytd-c4-tabbed-header-renderer');
  if (channelHeader) {
    const channelLink = channelHeader.querySelector('a[href*="/channel/"], a[href*="/@"]');
    if (channelLink) {
      const channelId = extractChannelId(channelLink.href);
      if (channelId && highlightedChannels[channelId]) {
        highlightElement(channelHeader);
      }
    }
  }
}

// Highlight an element
function highlightElement(element) {
  element.classList.add('yt-highlighted-channel');
  element.style.backgroundColor = 'rgba(255, 0, 0, 0.15)';
  element.style.border = '2px solid red';
  element.style.borderRadius = '4px';
  element.style.transition = 'all 0.3s ease';
}

// Remove highlight from an element
function unhighlightElement(element) {
  element.classList.remove('yt-highlighted-channel');
  element.style.backgroundColor = '';
  element.style.border = '';
  element.style.borderRadius = '';
}

// Observe page changes (YouTube is a SPA)
function observePageChanges() {
  const observer = new MutationObserver((mutations) => {
    // Debounce the highlight application
    clearTimeout(window.highlightTimeout);
    window.highlightTimeout = setTimeout(() => {
      applyHighlights();
    }, 500);
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('Observer set up for page changes');
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
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log('URL changed, re-applying highlights');
    setTimeout(applyHighlights, 1000);
  }
}).observe(document, { subtree: true, childList: true });
