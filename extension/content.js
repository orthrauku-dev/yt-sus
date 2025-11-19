// Content script for YouTube pages
const DEBUG_CONTENT = false; // Set to true to enable debug logging
const log = DEBUG_CONTENT ? console.log.bind(console) : () => {};
const logError = console.error.bind(console); // Always log errors

log('YouTube AI Content Warning content script loaded');

let highlightedChannels = {};
let settings = {
  showVideoTitle: true,
  showChannelHeader: true
};

// Initialize by loading highlighted channels and settings
async function init() {
  log('=== init() called ===');
  const response = await chrome.runtime.sendMessage({ action: 'getHighlightedChannels' });
  highlightedChannels = response.channels || {};
  log('Loaded highlighted channels:', highlightedChannels);
  
  // Load settings
  const settingsResult = await chrome.storage.local.get(['warningSettings']);
  if (settingsResult.warningSettings) {
    settings = settingsResult.warningSettings;
  }
  log('Loaded settings:', settings);
  
  // Apply highlights on initial load
  log('Calling applyHighlights from init');
  applyHighlights();
}

// Extract channel ID from various YouTube URL formats
function extractChannelId(url) {
  if (!url) return null;
  
  // Handle @username format
  const handleMatch = url.match(/\/@([\w-]+)/);
  if (handleMatch) return `@${handleMatch[1]}`;
  
  // Handle /channel/CHANNEL_ID format
  const channelMatch = url.match(/\/channel\/([\w-]+)/);
  if (channelMatch) return channelMatch[1];
  
  // Handle /c/CUSTOM_NAME format (less common now)
  const customMatch = url.match(/\/c\/([\w-]+)/);
  if (customMatch) return customMatch[1];
  
  // Handle /user/USERNAME format (old format)
  const userMatch = url.match(/\/user\/([\w-]+)/);
  if (userMatch) return userMatch[1];
  
  return null;
}

// Check if a channel is flagged by checking both channel ID and handle
function isChannelFlagged(channelId) {
  if (!channelId) return false;
  
  log('=== isChannelFlagged DEBUG ===');
  log('Input channelId:', channelId);
  log('Input channelId type:', typeof channelId);
  log('Input channelId length:', channelId.length);
  log('Available keys in highlightedChannels:', Object.keys(highlightedChannels));
  
  // Direct match (exact case)
  if (highlightedChannels[channelId]) {
    log('✓ Direct match found for:', channelId);
    return true;
  }
  log('✗ No direct match for:', channelId);
  
  // For @handle format, do case-insensitive matching
  const channelIdLower = channelId.toLowerCase();
  log('channelId lowercased:', channelIdLower);
  
  // Loop through all flagged channels to find matches
  for (const [key, channel] of Object.entries(highlightedChannels)) {
    log(`--- Comparing with key: "${key}" ---`);
    log('Key type:', typeof key);
    log('Key length:', key.length);
    log('Key lowercased:', key.toLowerCase());
    log('Channel object:', JSON.stringify(channel, null, 2));
    
    // Case-insensitive match for handles (starting with @)
    if (channelId.startsWith('@') && key.toLowerCase() === channelIdLower) {
      log('✓ Found case-insensitive handle match via KEY:', key);
      return true;
    }
    log(`✗ Key match failed. key.toLowerCase() "${key.toLowerCase()}" === channelIdLower "${channelIdLower}"? ${key.toLowerCase() === channelIdLower}`);
    
    // Check if the stored channel has an 'id' property that matches (case-insensitive for handles)
    if (channel.id) {
      log('Channel has id property:', channel.id);
      log('channel.id lowercased:', channel.id.toLowerCase());
      
      if (channel.id.startsWith('@') && channel.id.toLowerCase() === channelIdLower) {
        log('✓ Found match via channel.id property (case-insensitive):', key);
        return true;
      } else if (channel.id === channelId) {
        log('✓ Found match via channel.id property (exact):', key);
        return true;
      }
      log(`✗ channel.id match failed. channel.id.toLowerCase() "${channel.id.toLowerCase()}" === channelIdLower "${channelIdLower}"? ${channel.id.toLowerCase() === channelIdLower}`);
    }
    
    // Exact match for non-handle IDs (UC... format, etc.)
    if (!channelId.startsWith('@') && key === channelId) {
      log('✓ Found exact match via key:', key);
      return true;
    }
  }
  
  log('=== No match found for:', channelId, '===');
  return false;
}

// Extract channel name from element
function extractChannelName(element) {
  // Try to find channel name in various places
  const nameElement = element.querySelector('#channel-name, #text, .yt-simple-endpoint.style-scope.yt-formatted-string');
  return nameElement?.textContent?.trim() || 'Unknown Channel';
}

// Wait for an element to exist, with timeout
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    // Check if element already exists
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    // Set up observer to watch for element
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Timeout fallback
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// Apply highlights to channel elements
async function applyHighlights() {
  log('Applying highlights...');
  log('Highlighted channels:', highlightedChannels);
  log('Settings:', settings);
  
  // Check if we're on a video page (don't try to highlight channel header on video pages)
  const isVideoPage = window.location.pathname.startsWith('/watch');
  
  if (!isVideoPage && settings.showChannelHeader) {
    // Wait for channel header to exist on channel pages
    // Try all selectors at once with a combined selector
    const channelHeaderSelector = 'ytd-page-header-renderer, ytd-c4-tabbed-header-renderer, #page-header';
    
    log('Waiting for channel header...');
    const channelHeader = await waitForElement(channelHeaderSelector, 3000);
    log('Channel header found:', !!channelHeader);
    
    if (channelHeader) {
      log('Channel header element:', channelHeader.tagName, channelHeader.id);
      
      // First, always unhighlight to clear any previous state
      unhighlightElement(channelHeader);
      
      // Find ALL channel links in the header to get both handle and canonical ID
      const allChannelLinks = channelHeader.querySelectorAll('a[href*="/channel/"], a[href*="/@"], a.yt-simple-endpoint[href*="/@"]');
      log('ALL channel links found:', allChannelLinks.length);
      allChannelLinks.forEach((link, i) => {
        log(`  Link ${i}:`, link.href);
      });
      
      const channelLink = allChannelLinks[0];
      log('Using first channel link:', channelLink?.href);
      
      // Collect all possible channel identifiers
      let channelIds = [];
      
      // Extract from all links
      allChannelLinks.forEach(link => {
        const id = extractChannelId(link.href);
        if (id && !channelIds.includes(id)) {
          channelIds.push(id);
          log('Added channel ID from link:', id);
        }
      });
      
      // Also try to find the canonical channel ID from meta tags
      const channelMetaTag = document.querySelector('meta[property="og:url"]');
      if (channelMetaTag) {
        const metaUrl = channelMetaTag.content;
        log('Meta og:url:', metaUrl);
        const id = extractChannelId(metaUrl);
        if (id && !channelIds.includes(id)) {
          channelIds.push(id);
          log('Added channel ID from meta:', id);
        }
      }
      
      // Check the page URL itself
      const urlId = extractChannelId(window.location.href);
      if (urlId && !channelIds.includes(urlId)) {
        channelIds.push(urlId);
        log('Added channel ID from URL:', urlId);
      }
      
      log('All collected channel IDs:', channelIds);
      
      if (channelIds.length > 0) {
        log('Highlighted channels keys:', Object.keys(highlightedChannels));
        
        // Check if ANY of the channel IDs match
        let isFlagged = false;
        for (const id of channelIds) {
          log('Checking channel ID:', id);
          if (isChannelFlagged(id)) {
            log('✓ Match found for:', id);
            isFlagged = true;
            break;
          }
        }
        
        log('Is highlighted?:', isFlagged);
        
        if (isFlagged) {
          log('CALLING highlightElement for channel');
          highlightElement(channelHeader);
        } else {
          log('Channel not in highlighted list or no ID found');
        }
      } else {
        log('No channel link found in header');
        // Try alternate approach - get from URL
        if (window.location.pathname.includes('/@') || window.location.pathname.includes('/channel/')) {
          const channelId = extractChannelId(window.location.href);
          log('Got channel ID from URL:', channelId);
          if (channelId && highlightedChannels[channelId]) {
            highlightElement(channelHeader);
          }
        }
      }
    } else {
      log('No channel header found - might not be on a channel page');
      log('Page URL:', window.location.href);
      log('Available elements:', document.querySelectorAll('[id*="header"], [class*="header"]').length);
    }
  }
  
  // Also check for video pages and add warning to video title (await to ensure completion)
  await checkVideoPage();
}

// Store the current video's channel info
let currentVideoChannelName = null;
let currentVideoChannelId = null;
let currentVideoId = null; // Track which video we've processed

// Check if we're on a video page and add warning to title if channel is highlighted
async function checkVideoPage() {
  log('=== checkVideoPage() called ===');
  
  // ALWAYS remove existing warnings first to prevent stale warnings
  const videoTitleSelectors = [
    'ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string',
    'h1.ytd-watch-metadata yt-formatted-string',
    'ytd-watch-metadata yt-formatted-string.ytd-watch-metadata',
    'h1 yt-formatted-string',
    '#title h1 yt-formatted-string'
  ];
  
  for (const selector of videoTitleSelectors) {
    const titleEl = document.querySelector(selector);
    if (titleEl) {
      const existingWarnings = titleEl.querySelectorAll('.yt-ai-warning');
      existingWarnings.forEach(w => w.remove());
      log('Removed', existingWarnings.length, 'existing warnings');
    }
  }
  
  // Check if video title warnings are enabled
  if (!settings.showVideoTitle) {
    log('Video title warnings disabled in settings');
    return;
  }
  
  // Check if we're on a video page
  if (!window.location.pathname.includes('/watch')) {
    log('Not on a video page, skipping');
    return;
  }
  
  // Get the video ID from URL to prevent processing the same video twice
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');
  
  if (!videoId) {
    log('No video ID in URL');
    return;
  }
  
  // If we already processed this video, skip (prevents double-processing on same navigation)
  if (videoId === currentVideoId) {
    log('Already processed video:', videoId);
    return;
  }
  
  log('Processing video:', videoId);
  
  // Wait for video metadata AND owner section to load
  log('Waiting for video page elements to load...');
  const metadata = await waitForElement('ytd-watch-metadata', 5000);
  log('ytd-watch-metadata loaded:', !!metadata);
  
  // Also wait specifically for #owner which contains the channel link
  const owner = await waitForElement('#owner', 5000);
  log('#owner loaded:', !!owner);
  
  if (!owner) {
    log('Timeout waiting for #owner element - video page DOM not ready');
    return;
  }
  
  // CRITICAL: YouTube's SPA may have stale channel data in the DOM briefly
  // We need to verify the channel info is stable before processing
  const ownerLinkSelectors = [
    'ytd-watch-metadata ytd-channel-name a',
    'ytd-channel-name#channel-name a',
    '#owner ytd-channel-name a',
    'ytd-watch-metadata a.yt-simple-endpoint[href*="/@"]',
    'ytd-watch-metadata a.yt-simple-endpoint[href*="/channel/"]',
    'ytd-channel-name a[href*="/@"]',
    'ytd-channel-name a[href*="/channel/"]',
    '#owner a[href*="/@"]',
    '#owner a[href*="/channel/"]',
    'ytd-video-owner-renderer a[href*="/@"]',
    'ytd-video-owner-renderer a[href*="/channel/"]',
    // More specific selectors for newer YouTube layout
    '#owner #channel-name a',
    '#below ytd-channel-name a',
    'ytd-video-secondary-info-renderer #channel-name a'
  ];
  
  // Helper function to find owner link
  const findOwnerLink = () => {
    for (const selector of ownerLinkSelectors) {
      const link = document.querySelector(selector);
      if (link) return link;
    }
    return null;
  };
  
  // Wait for DOM to be more stable before extracting channel info
  log('Waiting for DOM to stabilize...');
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Get the owner link after waiting
  let ownerLink = findOwnerLink();
  
  // If no link found, wait a bit longer and retry
  if (!ownerLink) {
    log('Could not find channel owner link on first attempt, waiting longer...');
    await new Promise(resolve => setTimeout(resolve, 800));
    ownerLink = findOwnerLink();
  }
  
  if (!ownerLink) {
    log('Could not find channel owner link after retries');
    currentVideoId = null; // Allow retry on next navigation
    return;
  }
  
  log('Channel link found:', ownerLink.href);
  
  // Additional check removed as we now verify stability above
  if (!ownerLink) {
    log('Could not find channel owner link with specific selectors');
    log('Available ytd-channel-name elements:', document.querySelectorAll('ytd-channel-name').length);
    
    // Try to find channel links ONLY in the video metadata area, not sidebar
    const metadataEl = document.querySelector('ytd-watch-metadata, #owner');
    if (metadataEl) {
      const metadataLinks = Array.from(metadataEl.querySelectorAll('a[href*="/@"], a[href*="/channel/"]'));
      log('Channel links in metadata area:', metadataLinks.length);
      
      if (metadataLinks.length > 0) {
        ownerLink = metadataLinks[0];
        log('Using first metadata area channel link:', ownerLink.href);
      }
    } else {
      log('Could not find video metadata container');
    }
  }
  
  if (!ownerLink) {
    log('Could not find channel owner link');
    return;
  }
  
  log('=== EXTRACTING ALL CHANNEL IDENTIFIERS ===');
  
  // Collect ALL possible channel identifiers from the page
  let channelIds = [];
  
  // 1. Extract from the primary owner link
  const primaryId = extractChannelId(ownerLink.href);
  if (primaryId) {
    channelIds.push(primaryId);
    log('Added primary ID from owner link:', primaryId);
  }
  
  // 2. Find ALL channel links in the #owner and ytd-watch-metadata area
  const allOwnerLinks = document.querySelectorAll('#owner a[href*="/channel/"], #owner a[href*="/@"], ytd-watch-metadata a[href*="/channel/"], ytd-watch-metadata a[href*="/@"]');
  log('Found', allOwnerLinks.length, 'total channel links in owner/metadata area');
  
  allOwnerLinks.forEach((link, i) => {
    log(`  Channel link ${i}:`, link.href);
    const id = extractChannelId(link.href);
    if (id && !channelIds.includes(id)) {
      channelIds.push(id);
      log('  -> Added ID:', id);
    }
  });
  
  // 3. Try to extract from meta tags
  const ogUrlMeta = document.querySelector('meta[property="og:url"]');
  if (ogUrlMeta && ogUrlMeta.content.includes('/watch')) {
    log('Meta og:url (video):', ogUrlMeta.content);
  }
  
  // 4. Check ytInitialData for channel info (YouTube stores data here)
  try {
    if (window.ytInitialData) {
      log('Checking ytInitialData for channel info...');
      const videoOwnerRenderer = JSON.stringify(window.ytInitialData).match(/"videoOwnerRenderer":\{[^}]*"navigationEndpoint":\{[^}]*"browseEndpoint":\{[^}]*"browseId":"([^"]+)"/);
      if (videoOwnerRenderer && videoOwnerRenderer[1]) {
        const ytDataId = videoOwnerRenderer[1];
        log('Found channel ID in ytInitialData:', ytDataId);
        if (!channelIds.includes(ytDataId)) {
          channelIds.push(ytDataId);
        }
      }
      
      // Also try to get the handle from ytInitialData
      const handleMatch = JSON.stringify(window.ytInitialData).match(/"canonicalChannelUrl":"[^"]*\/@([^"\/]+)"/);
      if (handleMatch && handleMatch[1]) {
        const handle = `@${handleMatch[1]}`;
        log('Found handle in ytInitialData:', handle);
        if (!channelIds.includes(handle)) {
          channelIds.push(handle);
        }
      }
    }
  } catch (e) {
    log('Error checking ytInitialData:', e.message);
  }
  
  log('=== ALL COLLECTED CHANNEL IDs:', channelIds, '===');
  
  // Get channel name from the DOM directly
  let channelNameText = '';
  
  // Try multiple ways to get the channel name
  const channelNameSelectors = [
    'ytd-channel-name#channel-name yt-formatted-string a',
    'ytd-channel-name yt-formatted-string',
    '#channel-name yt-formatted-string',
    'ytd-video-owner-renderer ytd-channel-name yt-formatted-string',
    '#owner ytd-channel-name yt-formatted-string'
  ];
  
  for (const selector of channelNameSelectors) {
    const nameElement = document.querySelector(selector);
    if (nameElement && nameElement.textContent) {
      channelNameText = nameElement.textContent.trim();
      log('Found channel name via selector:', selector, channelNameText);
      break;
    }
  }
  
  // Fallback to stored channel data if DOM extraction fails
  if (!channelNameText && channelId && highlightedChannels[channelId]) {
    channelNameText = highlightedChannels[channelId].name || '';
    log('Using stored channel name:', channelNameText);
  }
  
  // Store the channel info for current video
  currentVideoChannelName = channelNameText;
  currentVideoChannelId = channelIds[0] || null; // Store the first ID
  currentVideoId = videoId; // Mark this video as processed
  
  log('=== VIDEO PAGE SUMMARY ===');
  log('Video ID:', videoId);
  log('All Channel IDs found:', channelIds);
  log('Channel Name:', currentVideoChannelName);
  
  // Check if ANY of the channel IDs match a flagged channel
  log('=== CHECKING IF FLAGGED ===');
  let isFlagged = false;
  for (const id of channelIds) {
    log(`Checking ID: "${id}"`);
    if (isChannelFlagged(id)) {
      log('✓✓✓ MATCH FOUND FOR:', id);
      isFlagged = true;
      break;
    }
  }
  
  log('=== FINAL RESULT: Is channel flagged?', isFlagged, '===');
  
  if (!isFlagged) {
    log('Channel not flagged, no warning needed');
    return;
  }
  
  log('Video is from highlighted channel, adding warning to title');
  
  // Find the video title
  let videoTitle = null;
  for (const selector of videoTitleSelectors) {
    videoTitle = document.querySelector(selector);
    if (videoTitle) {
      log('Found video title with selector:', selector);
      break;
    }
  }
  
  if (!videoTitle) {
    log('Could not find video title element');
    return;
  }
  
  // Add warning if not already present
  if (!videoTitle.querySelector('.yt-ai-warning')) {
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
    log('Warning added to video title');
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
    log('Channel header warnings disabled, removed highlights');
    return;
  }
  
  element.classList.add('yt-highlighted-channel');
  
  log('highlightElement called on:', element);
  log('Element HTML:', element.innerHTML.substring(0, 200));
  
  // Don't add duplicate warnings
  if (element.querySelector('.yt-ai-warning')) {
    log('Warning already exists, skipping');
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
      log('Found channel name with selector:', selector);
      log('Channel name element:', channelNameSpan);
      log('Channel name text:', channelNameSpan.textContent);
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
    log('Warning inserted successfully');
  } else {
    log('Could not find channel name element. Element structure:', element.outerHTML.substring(0, 500));
  }
  
  // Add subtle background highlight
  element.style.backgroundColor = 'rgba(255, 165, 0, 0.15)';
  element.style.border = '2px solid orange';
  element.style.transition = 'all 0.3s ease';
  log('Background highlight applied');
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
  log('Content script received message:', request);
  
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
    log('Settings updated:', settings);
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

// Clean up stale warnings immediately when navigation starts
document.addEventListener('yt-navigate-start', () => {
  log('YouTube navigation starting, removing any stale warnings');
  
  // Immediately remove all video warnings to prevent carryover
  const videoTitleSelectors = [
    'ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string',
    'h1.ytd-watch-metadata yt-formatted-string',
    'ytd-watch-metadata yt-formatted-string.ytd-watch-metadata',
    'h1 yt-formatted-string',
    '#title h1 yt-formatted-string'
  ];
  
  for (const selector of videoTitleSelectors) {
    const titleEl = document.querySelector(selector);
    if (titleEl) {
      const warnings = titleEl.querySelectorAll('.yt-ai-warning');
      warnings.forEach(w => w.remove());
    }
  }
});

// Re-apply highlights when navigating (YouTube SPA)
// Listen for YouTube's custom navigation event instead of MutationObserver
document.addEventListener('yt-navigate-finish', async () => {
  log('YouTube navigation finished, re-applying highlights');
  
  // Check if we're navigating to a video page
  const isVideoPage = window.location.pathname.startsWith('/watch');
  
  if (isVideoPage) {
    // Reset current video ID when navigating to a video to allow re-processing
    const urlParams = new URLSearchParams(window.location.search);
    const newVideoId = urlParams.get('v');
    
    // If navigating to a different video, reset the tracking
    if (newVideoId && newVideoId !== currentVideoId) {
      log('Navigated to new video:', newVideoId, 'resetting currentVideoId');
      currentVideoId = null;
    }
  }
  
  // Apply highlights (includes both channel page and video page checks)
  await applyHighlights();
  
  // On video pages, if the video wasn't processed (currentVideoId is still null), 
  // retry after a longer delay to handle slow-loading DOM
  if (isVideoPage && currentVideoId === null) {
    log('Video not processed yet, scheduling retry in 1 second...');
    setTimeout(async () => {
      log('Retry: Re-checking video page');
      await checkVideoPage();
    }, 1000);
  }
});
