// Content script for YouTube pages
console.log('YouTube AI Content Warning content script loaded');

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
      } else {
        unhighlightElement(channelHeader);
      }
    }
  }
}

// Highlight an element with warning emoji
function highlightElement(element) {
  element.classList.add('yt-highlighted-channel');
  
  // Don't add duplicate warnings
  if (element.querySelector('.yt-ai-warning')) {
    return;
  }
  
  // Create warning badge (positioned in top-right corner)
  const warningBadge = document.createElement('div');
  warningBadge.className = 'yt-ai-warning';
  warningBadge.innerHTML = '⚠️';
  warningBadge.title = 'Warning: This channel may use AI-generated content';
  
  // Position the badge
  element.style.position = 'relative';
  element.appendChild(warningBadge);
  
  // Add warning label next to channel name
  const channelNameElement = element.querySelector('#channel-name, #text, .yt-simple-endpoint.style-scope.yt-formatted-string, yt-formatted-string#text');
  if (channelNameElement && !element.querySelector('.yt-ai-label')) {
    const label = document.createElement('span');
    label.className = 'yt-ai-label';
    label.innerHTML = ' ⚠️ <span style="font-size: 0.85em;">May contain AI</span>';
    label.title = 'This channel may contain AI-generated content';
    
    // Insert after the channel name element
    channelNameElement.parentNode.insertBefore(label, channelNameElement.nextSibling);
  }
  
  // Add subtle highlight
  element.style.backgroundColor = 'rgba(255, 165, 0, 0.1)';
  element.style.transition = 'all 0.3s ease';
}

// Remove highlight from an element
function unhighlightElement(element) {
  element.classList.remove('yt-highlighted-channel');
  
  // Remove warning badge
  const badge = element.querySelector('.yt-ai-warning');
  if (badge) {
    badge.remove();
  }
  
  // Remove text label
  const label = element.querySelector('.yt-ai-label');
  if (label) {
    label.remove();
  }
  
  // Reset styles
  element.style.backgroundColor = '';
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
