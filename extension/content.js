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
        unhighlightElement(channelHeader);
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

// Check if we're on a video page and add warning to title if channel is highlighted
function checkVideoPage() {
  // Find video owner channel link
  const ownerLink = document.querySelector('ytd-watch-metadata a.yt-simple-endpoint[href*="/@"], ytd-watch-metadata a.yt-simple-endpoint[href*="/channel/"]');
  
  if (ownerLink) {
    const channelId = extractChannelId(ownerLink.href);
    console.log('Video page - Channel ID:', channelId);
    
    if (channelId && highlightedChannels[channelId]) {
      console.log('Video is from highlighted channel, adding warning to title');
      
      // Find the video title
      const videoTitle = document.querySelector('ytd-watch-metadata yt-formatted-string.ytd-watch-metadata');
      
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
    } else {
      // Remove warning if channel is no longer highlighted
      const videoTitle = document.querySelector('ytd-watch-metadata yt-formatted-string.ytd-watch-metadata');
      if (videoTitle) {
        const existingWarning = videoTitle.querySelector('.yt-ai-warning');
        if (existingWarning) {
          existingWarning.remove();
        }
      }
    }
  }
  
  // Add warnings to sidebar videos - with delays and a dedicated observer
  setTimeout(() => {
    addWarningsToSidebarVideos();
  }, 1500);
  
  setTimeout(() => {
    addWarningsToSidebarVideos();
  }, 3000);
  
  setTimeout(() => {
    addWarningsToSidebarVideos();
  }, 5000);
  
  // Also set up a specific observer for the sidebar
  observeSidebarChanges();
}

// Observe changes specifically in the sidebar for related videos loading
function observeSidebarChanges() {
  const sidebar = document.querySelector('#secondary');
  if (!sidebar) {
    console.log('Sidebar not found for observer');
    return;
  }
  
  const sidebarObserver = new MutationObserver((mutations) => {
    // Check if ytd-compact-video-renderer or yt-lockup-view-model elements were added
    const hasNewVideos = mutations.some(mutation => 
      Array.from(mutation.addedNodes).some(node => 
        node.nodeName === 'YTD-COMPACT-VIDEO-RENDERER' ||
        node.nodeName === 'YT-LOCKUP-VIEW-MODEL' ||
        (node.querySelector && (node.querySelector('ytd-compact-video-renderer') || node.querySelector('yt-lockup-view-model')))
      )
    );
    
    // Ignore mutations from our own warning additions
    const isOurChange = mutations.some(mutation => 
      Array.from(mutation.addedNodes).some(node => 
        node.className === 'yt-ai-warning-sidebar' ||
        (node.querySelector && node.querySelector('.yt-ai-warning-sidebar'))
      )
    );
    
    if (hasNewVideos && !isOurChange) {
      console.log('New sidebar videos detected, adding warnings...');
      // Small delay to let YouTube finish rendering
      setTimeout(() => {
        addWarningsToSidebarVideos();
      }, 500);
    }
  });
  
  sidebarObserver.observe(sidebar, {
    childList: true,
    subtree: true
  });
  
  console.log('Sidebar observer set up');
}

// Add warnings to channel names in sidebar/related videos
let isProcessingSidebar = false;
function addWarningsToSidebarVideos() {
  if (isProcessingSidebar) {
    console.log('Already processing sidebar, skipping...');
    return;
  }
  
  isProcessingSidebar = true;
  console.log('Adding warnings to sidebar videos...');
  
  // Wait for the sidebar container to have actual content
  const sidebar = document.querySelector('#secondary ytd-watch-next-secondary-results-renderer');
  if (!sidebar) {
    console.log('Sidebar not found, will retry later');
    isProcessingSidebar = false;
    return;
  }
  
  // Select all video renderers - try BOTH old and new structures
  let sidebarVideos = document.querySelectorAll('#secondary ytd-compact-video-renderer');
  
  // If no old-style videos, try the new view-model structure
  if (sidebarVideos.length === 0) {
    sidebarVideos = document.querySelectorAll('#secondary yt-lockup-view-model');
  }
  
  console.log(`Found ${sidebarVideos.length} sidebar videos`);
  
  if (sidebarVideos.length === 0) {
    console.log('No videos loaded yet, sidebar may still be loading');
    isProcessingSidebar = false;
    return;
  }
  
  sidebarVideos.forEach((video, index) => {
    // For new view-model structure, get channel name text directly
    const channelNameElement = video.querySelector('yt-content-metadata-view-model .yt-core-attributed-string');
    
    if (!channelNameElement) {
      if (index === 0) {
        console.log('Could not find channel name element in first video');
      }
      return;
    }
    
    const channelName = channelNameElement.textContent.trim();
    
    if (index === 0) {
      console.log('First video channel name:', channelName);
      console.log('Highlighted channels:', Object.keys(highlightedChannels));
    }
    
    // Check if already processed
    if (video.dataset.aiWarningProcessed === 'true') {
      return;
    }
    
    // Check if this channel is highlighted by name or handle
    let isHighlighted = false;
    let matchedChannelId = null;
    
    for (const [channelId, value] of Object.entries(highlightedChannels)) {
      // Match by handle (e.g., @s0lid_sno0ks matches "sno0ks")
      if (channelId.startsWith('@')) {
        const handleWithoutAt = channelId.substring(1).toLowerCase();
        // Check if channel name matches the handle (with or without underscores)
        if (channelName.toLowerCase() === handleWithoutAt ||
            channelName.toLowerCase().replace(/_/g, '') === handleWithoutAt.replace(/_/g, '') ||
            handleWithoutAt.includes(channelName.toLowerCase())) {
          isHighlighted = true;
          matchedChannelId = channelId;
          break;
        }
      }
      // Also try exact match
      if (channelName.toLowerCase() === channelId.toLowerCase()) {
        isHighlighted = true;
        matchedChannelId = channelId;
        break;
      }
    }
    
    if (isHighlighted) {
      console.log(`Sidebar video from highlighted channel: ${matchedChannelId} (name: ${channelName})`);
      
      // Check if warning already exists
      if (!channelNameElement.querySelector('.yt-ai-warning-sidebar')) {
        // Create warning badge
        const warning = document.createElement('span');
        warning.className = 'yt-ai-warning-sidebar';
        warning.innerHTML = ' ⚠️ AI';
        warning.title = 'This channel may use AI-generated content';
        warning.style.color = '#ff8800';
        warning.style.fontWeight = 'bold';
        warning.style.marginLeft = '6px';
        warning.style.fontSize = '0.85em';
        warning.style.display = 'inline-block';
        warning.style.whiteSpace = 'nowrap';
        warning.style.padding = '2px 6px';
        warning.style.backgroundColor = 'rgba(255, 136, 0, 0.2)';
        warning.style.borderRadius = '3px';
        warning.style.border = '1px solid rgba(255, 136, 0, 0.5)';
        warning.style.verticalAlign = 'middle';
        
        channelNameElement.appendChild(warning);
        console.log('Warning added to sidebar video');
      }
      
      // Also add a subtle highlight to the entire video item
      video.style.borderLeft = '3px solid rgba(255, 136, 0, 0.6)';
      video.style.paddingLeft = '5px';
      
      // Mark as processed
      video.dataset.aiWarningProcessed = 'true';
    } else {
      // Remove warning if channel is no longer highlighted
      if (channelNameElement) {
        const existingWarning = channelNameElement.querySelector('.yt-ai-warning-sidebar');
        if (existingWarning) {
          existingWarning.remove();
        }
      }
      video.style.borderLeft = '';
      video.style.paddingLeft = '';
      
      // Mark as processed
      video.dataset.aiWarningProcessed = 'true';
    }
  });
  
  isProcessingSidebar = false;
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
    // Ignore mutations from our own warning additions
    const isOurChange = mutations.some(mutation => 
      Array.from(mutation.addedNodes).some(node => 
        (node.className && (node.className.includes('yt-ai-warning') || node.className.includes('yt-highlighted-channel'))) ||
        (node.querySelector && (node.querySelector('.yt-ai-warning-sidebar') || node.querySelector('.yt-ai-warning')))
      )
    );
    
    if (isOurChange) {
      return; // Don't trigger on our own changes
    }
    
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
