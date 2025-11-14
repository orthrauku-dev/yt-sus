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
    const channelLink = channelHeader.querySelector('a[href*="/channel/"], a[href*="/@"]');
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
        unhighlightElement(channelHeader);
      }
    } else {
      console.log('No channel link found in header');
    }
  } else {
    console.log('No channel header found - might not be on a channel page');
    console.log('Page URL:', window.location.href);
    console.log('Available elements:', document.querySelectorAll('[id*="header"], [class*="header"]').length);
  }
}

// Highlight an element with warning emoji
function highlightElement(element) {
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
