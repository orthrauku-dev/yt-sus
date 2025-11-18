// Voting system for YouTube channels
console.log('YouTube Voting System loaded');

const API_URL = 'http://localhost:7071/api';
// When deploying, change to: 'https://YOUR-FUNCTION-APP.azurewebsites.net/api'

// Storage key for votes
const VOTES_STORAGE_KEY = 'channelVotes';
const VOTES_CACHE_KEY = 'channelVotesCache';

// Check if extension context is valid
function isExtensionContextValid() {
  try {
    return chrome.runtime && chrome.runtime.id !== undefined;
  } catch (e) {
    return false;
  }
}

// Settings
let votingEnabled = true;
let voteThreshold = 10;

// Load settings
async function loadVotingSettings() {
  try {
    if (!isExtensionContextValid()) {
      console.warn('Extension context invalidated - please refresh the page');
      return;
    }
    const result = await chrome.storage.local.get(['warningSettings']);
    if (result.warningSettings && result.warningSettings.showVoting !== undefined) {
      votingEnabled = result.warningSettings.showVoting;
    }
    if (result.warningSettings && result.warningSettings.voteThreshold !== undefined) {
      voteThreshold = result.warningSettings.voteThreshold;
    }
    console.log('Voting enabled:', votingEnabled, 'Threshold:', voteThreshold);
  } catch (error) {
    console.error('Error loading voting settings:', error);
  }
}

// Get all votes from storage (cached)
async function getVotes() {
  const result = await chrome.storage.local.get([VOTES_STORAGE_KEY]);
  return result[VOTES_STORAGE_KEY] || {};
}

// Save votes to storage
async function saveVotes(votes) {
  await chrome.storage.local.set({ [VOTES_STORAGE_KEY]: votes });
}

// Get vote count for a channel from API (via background script)
async function getChannelVotesFromAPI(channelId) {
  try {
    if (!isExtensionContextValid()) {
      console.warn('Extension context invalidated - returning cached votes');
      const votes = await getVotes();
      return votes[channelId] || 0;
    }
    
    // Check cache first
    const cache = await chrome.storage.local.get([VOTES_CACHE_KEY]);
    const votesCache = cache[VOTES_CACHE_KEY] || {};
    
    const now = Date.now();
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    // If we have cached data and it's less than 24 hours old, use it
    if (votesCache[channelId]) {
      const { votes, timestamp } = votesCache[channelId];
      const age = now - timestamp;
      
      if (age < CACHE_DURATION) {
        console.log(`Using cached vote count for ${channelId}: ${votes} (age: ${Math.floor(age / 3600000)} hours)`);
        return votes;
      } else {
        console.log(`Cache expired for ${channelId} (age: ${Math.floor(age / 3600000)} hours), fetching fresh data`);
      }
    }
    
    // Cache miss or expired - fetch from API via background script
    console.log(`Fetching fresh vote count from API for ${channelId}`);
    const response = await chrome.runtime.sendMessage({
      action: 'getChannelVotes',
      channelId: channelId
    });
    
    if (response && response.success) {
      const votes = response.votes || 0;
      
      // Update cache with new data
      votesCache[channelId] = {
        votes: votes,
        timestamp: now
      };
      await chrome.storage.local.set({ [VOTES_CACHE_KEY]: votesCache });
      
      console.log(`Cached vote count for ${channelId}: ${votes}`);
      return votes;
    }
    throw new Error('Failed to get votes from background script');
  } catch (error) {
    console.error('Failed to get votes from API:', error);
    // Fall back to local cache
    try {
      const votes = await getVotes();
      return votes[channelId] || 0;
    } catch (e) {
      console.error('Failed to get cached votes:', e);
      return 0;
    }
  }
}

// Get vote count for a channel (from cache)
async function getChannelVotes(channelId) {
  const votes = await getVotes();
  return votes[channelId] || 0;
}

// Add an upvote for a channel (sends to API via background script)
async function upvoteChannel(channelId, channelName) {
  try {
    if (!isExtensionContextValid()) {
      throw new Error('Extension context invalidated - please refresh the page');
    }
    
    // Use background script to make the API call (avoids CORS issues)
    const response = await chrome.runtime.sendMessage({
      action: 'voteChannel',
      channelId: channelId,
      channelName: channelName
    });
    
    if (response && response.success) {
      const newVotes = response.votes;
      
      // Update local cache
      const votes = await getVotes();
      votes[channelId] = newVotes;
      await saveVotes(votes);
      
      // Update the 24-hour cache as well
      const cache = await chrome.storage.local.get([VOTES_CACHE_KEY]);
      const votesCache = cache[VOTES_CACHE_KEY] || {};
      votesCache[channelId] = {
        votes: newVotes,
        timestamp: Date.now()
      };
      await chrome.storage.local.set({ [VOTES_CACHE_KEY]: votesCache });
      
      console.log(`Vote sent to API. Channel ${channelId} now has ${newVotes} votes`);
      return newVotes;
    }
    
    throw new Error('Failed to vote via background script');
    
  } catch (error) {
    console.error('Failed to send vote to API, saving locally:', error);
    // Fall back to local storage
    const votes = await getVotes();
    votes[channelId] = (votes[channelId] || 0) + 1;
    await saveVotes(votes);
    return votes[channelId];
  }
}

// Check if user has voted for a channel (using session storage to track per-session)
function hasVotedThisSession(channelId) {
  const sessionVotes = sessionStorage.getItem('votedChannels');
  if (!sessionVotes) {
    console.log(`No session votes found for ${channelId}`);
    return false;
  }
  const voted = JSON.parse(sessionVotes);
  const hasVoted = voted.includes(channelId);
  console.log(`Session votes:`, voted, `Has ${channelId} voted?`, hasVoted);
  return hasVoted;
}

// Mark channel as voted in this session
function markAsVoted(channelId) {
  const sessionVotes = sessionStorage.getItem('votedChannels');
  const voted = sessionVotes ? JSON.parse(sessionVotes) : [];
  if (!voted.includes(channelId)) {
    voted.push(channelId);
    sessionStorage.setItem('votedChannels', JSON.stringify(voted));
  }
}

// Create and add voting button to channel header
async function addVotingButton() {
  try {
    console.log('=== addVotingButton called ===');
    
    // Always remove existing button first to ensure fresh state
    removeVotingButton();
    
    // Check if voting is enabled
    if (!votingEnabled) {
      console.log('Voting is disabled, button removed');
      return;
    }
    
    // Check if we're on a channel page
    const channelId = extractChannelIdFromPage();
    console.log('Extracted channel ID:', channelId);
    
    if (!channelId) {
      console.log('Not on a channel page, skipping vote button');
      return;
    }

    // Extract channel name early so we can pass it to API
    // Try multiple selectors to find the channel name
    let channelNameElement = null;
    let channelName = 'Unknown';
    
    // Try the page header channel name (most reliable)
    channelNameElement = document.querySelector('yt-page-header-view-model span.yt-core-attributed-string[role="text"]');
    if (channelNameElement) {
      channelName = channelNameElement.textContent?.trim();
      console.log('Found channel name via page header:', channelName);
    }
    
    // Fallback: Try old YouTube layout selectors
    if (!channelName || channelName === 'Unknown') {
      channelNameElement = document.querySelector('#channel-name #text, ytd-channel-name yt-formatted-string');
      channelName = channelNameElement?.textContent?.trim() || 'Unknown';
      console.log('Found channel name via fallback selector:', channelName);
    }
    
    console.log('Final channel name:', channelName);

    // Find the flexible actions container
    const actionsContainer = document.querySelector('yt-flexible-actions-view-model.yt-page-header-view-model__page-header-flexible-actions');
    console.log('Actions container found:', actionsContainer);
    
    if (!actionsContainer) {
      console.log('Could not find actions container for vote button');
      console.log('Trying alternate selectors...');
      
      // Try alternate selector
      const altContainer = document.querySelector('yt-flexible-actions-view-model');
      console.log('Alternate container found:', altContainer);
      
      if (!altContainer) {
        console.log('No suitable container found');
        return;
      }
      
      // Use alternate container
      return await createAndInsertButton(altContainer, channelId, channelName);
    }

    await createAndInsertButton(actionsContainer, channelId, channelName);
  } catch (error) {
    console.error('Error in addVotingButton:', error);
  }
}

async function createAndInsertButton(actionsContainer, channelId, channelName) {
  try {
    // Don't check if button exists - we removed it in addVotingButton already
    console.log('Creating fresh vote button...');

    console.log('Fetching vote count from API...');
    // Get current vote count from API
    const voteCount = await getChannelVotesFromAPI(channelId);
    console.log('Vote count:', voteCount);
    
    // Update local cache with API value
    const votes = await getVotes();
    votes[channelId] = voteCount;
    await saveVotes(votes);
    
    const hasVoted = hasVotedThisSession(channelId);
    console.log('Has voted this session:', hasVoted);

    // Check if threshold reached - auto-add to AI warning list
    if (voteCount >= voteThreshold) {
      console.log(`Channel ${channelId} has reached threshold (${voteCount} >= ${voteThreshold})`);
      
      // Check if already in the warned list
      const response = await chrome.runtime.sendMessage({ action: 'getHighlightedChannels' });
      const highlightedChannels = response.channels || {};
      
      if (!highlightedChannels[channelId]) {
        console.log(`Auto-adding ${channelId} to warning list`);
        await addChannelToWarningList(channelId, voteCount);
        // Don't continue creating the button since we're reloading
        return;
      } else {
        console.log(`Channel ${channelId} already in warning list`);
      }
    }

    // Create vote button container
    const voteButtonContainer = document.createElement('div');
    voteButtonContainer.className = 'ytFlexibleActionsViewModelAction yt-ai-vote-button';

    // Create button
    const voteButton = document.createElement('button');
    voteButton.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--enable-backdrop-filter-experiment';
    voteButton.setAttribute('aria-label', hasVoted ? 'Already upvoted' : 'Upvote this channel');
    voteButton.style.cursor = hasVoted ? 'default' : 'pointer';
    
    if (hasVoted) {
      voteButton.style.opacity = '0.7';
      voteButton.disabled = true;
    }

    // Button content
    const buttonContent = document.createElement('div');
    buttonContent.className = 'yt-spec-button-shape-next__button-text-content';
    buttonContent.innerHTML = `
      <span style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 18px;">🤖</span>
        <span style="font-weight: 600;">Report AI Content:</span>
        <span style="font-weight: 700; color: #ff4444;">${voteCount > 0 ? voteCount : '0'}</span>
      </span>
    `;
    voteButton.appendChild(buttonContent);

    // Touch feedback (for consistency with YouTube's design)
    const touchFeedback = document.createElement('yt-touch-feedback-shape');
    touchFeedback.setAttribute('aria-hidden', 'true');
    touchFeedback.className = 'yt-spec-touch-feedback-shape yt-spec-touch-feedback-shape--touch-response';
    touchFeedback.innerHTML = `
      <div class="yt-spec-touch-feedback-shape__stroke"></div>
      <div class="yt-spec-touch-feedback-shape__fill"></div>
    `;
    voteButton.appendChild(touchFeedback);
    
    // Click handler
    voteButton.addEventListener('click', async () => {
      if (hasVotedThisSession(channelId)) {
        console.log('Already voted for this channel in this session');
        return;
      }

      // Show loading state
      voteButton.disabled = true;
      voteButton.style.cursor = 'wait';
      const originalContent = buttonContent.innerHTML;
      buttonContent.innerHTML = `
        <span style="display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 16px; height: 16px; border: 2px solid #999; border-top-color: #333; border-radius: 50%; animation: spin 0.6s linear infinite;"></span>
          <span style="font-weight: 600;">Voting...</span>
        </span>
      `;
      
      // Add spinner animation
      if (!document.getElementById('vote-spinner-style')) {
        const style = document.createElement('style');
        style.id = 'vote-spinner-style';
        style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }

      try {
        // Add vote (sends to API)
        const newCount = await upvoteChannel(channelId, channelName);
        
        // Mark as voted
        markAsVoted(channelId);
        
        // Update button to show new count (keep original format)
        buttonContent.innerHTML = `
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 18px;">🤖</span>
            <span style="font-weight: 600;">Report AI Content:</span>
            <span style="font-weight: 700; color: #ff4444;">${newCount}</span>
          </span>
        `;
        voteButton.style.opacity = '0.7';
        voteButton.style.cursor = 'default';
        voteButton.setAttribute('aria-label', 'Already upvoted');
        
        // Show feedback
        showVoteFeedback(voteButton);
        
        console.log(`Upvoted channel ${channelId}, new count: ${newCount}`);
        
        // Check if threshold reached - auto-add to AI warning list
        if (newCount >= voteThreshold) {
          console.log(`Channel ${channelId} reached threshold (${newCount} >= ${voteThreshold}), adding to AI warning list`);
          await addChannelToWarningList(channelId, newCount);
        }
      } catch (error) {
        console.error('Error voting:', error);
        // Restore original content on error
        buttonContent.innerHTML = originalContent;
        voteButton.disabled = false;
        voteButton.style.cursor = 'pointer';
        
        // Show error feedback
        const errorMsg = document.createElement('div');
        errorMsg.textContent = '✗ Failed';
        errorMsg.style.position = 'absolute';
        errorMsg.style.top = '-30px';
        errorMsg.style.left = '50%';
        errorMsg.style.transform = 'translateX(-50%)';
        errorMsg.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
        errorMsg.style.color = 'white';
        errorMsg.style.padding = '4px 8px';
        errorMsg.style.borderRadius = '4px';
        errorMsg.style.fontSize = '12px';
        errorMsg.style.fontWeight = 'bold';
        errorMsg.style.whiteSpace = 'nowrap';
        errorMsg.style.zIndex = '9999';
        errorMsg.style.pointerEvents = 'none';
        
        voteButton.style.position = 'relative';
        voteButton.appendChild(errorMsg);
        
        setTimeout(() => {
          errorMsg.remove();
        }, 2000);
      }
    });

    voteButtonContainer.appendChild(voteButton);
    
    // Insert button after Subscribe button (first action)
    const firstAction = actionsContainer.querySelector('.ytFlexibleActionsViewModelAction');
    if (firstAction && firstAction.nextSibling) {
      actionsContainer.insertBefore(voteButtonContainer, firstAction.nextSibling);
    } else {
      actionsContainer.appendChild(voteButtonContainer);
    }
    
    console.log(`Vote button added for channel ${channelId} with ${voteCount} votes`);
  } catch (error) {
    console.error('Error creating vote button:', error);
  }
}

// Remove voting button
function removeVotingButton() {
  const existingButton = document.querySelector('.yt-ai-vote-button');
  if (existingButton) {
    existingButton.remove();
    console.log('Vote button removed');
  }
}

// Add channel to AI warning list
async function addChannelToWarningList(channelId, voteCount) {
  // Get channel name from page
  let channelName = 'Unknown Channel';
  
  // Try to extract channel name from page
  const nameSelectors = [
    'yt-page-header-view-model .yt-core-attributed-string[role="text"]',
    'ytd-channel-name yt-formatted-string',
    '#channel-header #text',
    'yt-formatted-string.ytd-channel-name'
  ];
  
  for (const selector of nameSelectors) {
    const nameEl = document.querySelector(selector);
    if (nameEl && nameEl.textContent.trim()) {
      channelName = nameEl.textContent.trim();
      break;
    }
  }
  
  // Send message to background script to add channel
  const response = await chrome.runtime.sendMessage({
    action: 'addChannel',
    channelId: channelId,
    channelName: channelName,
    votes: voteCount
  });
  
  if (response && response.success) {
    console.log(`Channel ${channelId} (${channelName}) added to warning list with ${voteCount} votes`);
    
    // Show notification
    showThresholdNotification();
  } else {
    console.log(`Channel ${channelId} was already in the list or failed to add`);
  }
}

// Show notification when threshold is reached
function showThresholdNotification() {
  const notification = document.createElement('div');
  notification.textContent = '✓ Channel added to AI warning list!';
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.left = '50%';
  notification.style.transform = 'translateX(-50%)';
  notification.style.backgroundColor = '#ff8800';
  notification.style.color = 'white';
  notification.style.padding = '16px 24px';
  notification.style.borderRadius = '8px';
  notification.style.fontSize = '16px';
  notification.style.fontWeight = 'bold';
  notification.style.zIndex = '999999';
  notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
  notification.style.animation = 'slideDown 0.3s ease';
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Show visual feedback when voting
function showVoteFeedback(button) {
  // Add a pulse animation
  button.style.transform = 'scale(1.1)';
  button.style.transition = 'transform 0.2s ease';
  
  setTimeout(() => {
    button.style.transform = 'scale(1)';
  }, 200);
  
  // Show a temporary success message
  const feedback = document.createElement('div');
  feedback.textContent = '✓ Voted!';
  feedback.style.position = 'absolute';
  feedback.style.top = '-30px';
  feedback.style.left = '50%';
  feedback.style.transform = 'translateX(-50%)';
  feedback.style.backgroundColor = 'rgba(0, 200, 0, 0.9)';
  feedback.style.color = 'white';
  feedback.style.padding = '4px 8px';
  feedback.style.borderRadius = '4px';
  feedback.style.fontSize = '12px';
  feedback.style.fontWeight = 'bold';
  feedback.style.whiteSpace = 'nowrap';
  feedback.style.zIndex = '9999';
  feedback.style.pointerEvents = 'none';
  
  button.style.position = 'relative';
  button.appendChild(feedback);
  
  setTimeout(() => {
    feedback.remove();
  }, 2000);
}

// Extract channel ID from current page
function extractChannelIdFromPage() {
  // Try to get from URL
  const pathname = window.location.pathname;
  
  // Match /@handle format
  const handleMatch = pathname.match(/\/@([\w-]+)/);
  if (handleMatch) return `@${handleMatch[1]}`;
  
  // Match /channel/CHANNEL_ID format
  const channelMatch = pathname.match(/\/channel\/([\w-]+)/);
  if (channelMatch) return channelMatch[1];
  
  // Match /c/CUSTOM_NAME format
  const customMatch = pathname.match(/\/c\/([\w-]+)/);
  if (customMatch) return customMatch[1];
  
  // Match /user/USERNAME format
  const userMatch = pathname.match(/\/user\/([\w-]+)/);
  if (userMatch) return userMatch[1];
  
  return null;
}

// Initialize voting system when on channel page
let initializationTimeout = null;

async function initVoting() {
  try {
    // Check if extension context is valid
    if (!isExtensionContextValid()) {
      console.warn('⚠️ Extension was reloaded. Please refresh this page to restore voting functionality.');
      return;
    }
    
    console.log('Initializing voting system...');
    console.log('Current URL:', window.location.pathname);
    
    // Clear any pending initialization
    if (initializationTimeout) {
      clearTimeout(initializationTimeout);
      initializationTimeout = null;
    }
    
    // Load settings
    await loadVotingSettings();
    
    // Only run on channel pages
    if (!window.location.pathname.match(/\/@|\/channel\/|\/c\/|\/user\//)) {
      console.log('Not on a channel page, skipping voting button');
      return;
    }
    
    console.log('On channel page, will add voting button');
    
    // Wait for page to load, then add button once
    initializationTimeout = setTimeout(() => {
      console.log('Adding voting button after page load');
      addVotingButton();
    }, 1500);
  } catch (error) {
    console.error('Error initializing voting system:', error);
  }
}

// Listen for settings updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateSettings') {
    votingEnabled = request.settings.showVoting;
    console.log('Voting setting updated:', votingEnabled);
    
    if (votingEnabled) {
      addVotingButton();
    } else {
      removeVotingButton();
    }
    
    sendResponse({ success: true });
  }
  return true;
});

// Re-initialize when URL changes (YouTube SPA navigation)
// Use YouTube's navigation event instead of MutationObserver to avoid infinite loops
document.addEventListener('yt-navigate-finish', () => {
  console.log('YouTube navigation finished');
  console.log('Re-initializing voting system after navigation');
  removeVotingButton();
  initVoting();
});
