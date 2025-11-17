// Voting system for YouTube channels
console.log('YouTube Voting System loaded');

const API_URL = 'http://localhost:7071/api';
// When deploying, change to: 'https://YOUR-FUNCTION-APP.azurewebsites.net/api'

// Storage key for votes
const VOTES_STORAGE_KEY = 'channelVotes';

// Settings
let votingEnabled = true;
let voteThreshold = 10;

// Load settings
async function loadVotingSettings() {
  try {
    if (!chrome.storage) {
      console.error('Chrome storage not available - extension context may be invalidated');
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

// Get vote count for a channel from API
async function getChannelVotesFromAPI(channelId) {
  try {
    const response = await fetch(`${API_URL}/check_channel?channelId=${encodeURIComponent(channelId)}`);
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    const data = await response.json();
    return data.votes || 0;
  } catch (error) {
    console.error('Failed to get votes from API:', error);
    // Fall back to local cache
    const votes = await getVotes();
    return votes[channelId] || 0;
  }
}

// Get vote count for a channel (from cache)
async function getChannelVotes(channelId) {
  const votes = await getVotes();
  return votes[channelId] || 0;
}

// Add an upvote for a channel (sends to API)
async function upvoteChannel(channelId, channelName) {
  try {
    // Send vote to API
    const response = await fetch(`${API_URL}/vote_channel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channelId: channelId,
        channelName: channelName
      })
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    const newVotes = data.votes;
    
    // Update local cache
    const votes = await getVotes();
    votes[channelId] = newVotes;
    await saveVotes(votes);
    
    console.log(`Vote sent to API. Channel ${channelId} now has ${newVotes} votes`);
    return newVotes;
    
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
  if (!sessionVotes) return false;
  const voted = JSON.parse(sessionVotes);
  return voted.includes(channelId);
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
    
    // Check if voting is enabled
    if (!votingEnabled) {
      console.log('Voting is disabled, removing button');
      removeVotingButton();
      return;
    }
    
    // Check if we're on a channel page
    const channelId = extractChannelIdFromPage();
    console.log('Extracted channel ID:', channelId);
    
    if (!channelId) {
      console.log('Not on a channel page, skipping vote button');
      return;
    }

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
      return await createAndInsertButton(altContainer, channelId);
    }

    await createAndInsertButton(actionsContainer, channelId);
  } catch (error) {
    console.error('Error in addVotingButton:', error);
  }
}

async function createAndInsertButton(actionsContainer, channelId) {
  try {
    // Check if button already exists
    if (document.querySelector('.yt-ai-vote-button')) {
      console.log('Vote button already exists');
      return;
    }

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
    
    // Get channel name for API vote
    const channelNameElement = document.querySelector('#channel-name #text, .ytd-channel-name yt-formatted-string');
    const channelName = channelNameElement?.textContent?.trim() || 'Unknown';

    // Click handler
    voteButton.addEventListener('click', async () => {
      if (hasVotedThisSession(channelId)) {
        console.log('Already voted for this channel in this session');
        return;
      }

      // Add vote (sends to API)
      const newCount = await upvoteChannel(channelId, channelName);
      
      // Mark as voted
      markAsVoted(channelId);
      
      // Update button
      buttonContent.innerHTML = `👍 ${newCount}`;
      voteButton.style.opacity = '0.7';
      voteButton.style.cursor = 'default';
      voteButton.disabled = true;
      voteButton.setAttribute('aria-label', 'Already upvoted');
      
      // Show feedback
      showVoteFeedback(voteButton);
      
      console.log(`Upvoted channel ${channelId}, new count: ${newCount}`);
      
      // Check if threshold reached - auto-add to AI warning list
      if (newCount >= voteThreshold) {
        console.log(`Channel ${channelId} reached threshold (${newCount} >= ${voteThreshold}), adding to AI warning list`);
        await addChannelToWarningList(channelId);
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
async function addChannelToWarningList(channelId) {
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
    channelName: channelName
  });
  
  if (response && response.success) {
    console.log(`Channel ${channelId} (${channelName}) added to warning list`);
    
    // Show notification
    showThresholdNotification();
    
    // Reload the page to apply warnings
    setTimeout(() => {
      window.location.reload();
    }, 2000);
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
async function initVoting() {
  try {
    console.log('Initializing voting system...');
    console.log('Current URL:', window.location.pathname);
    
    // Load settings
    await loadVotingSettings();
    
    // Only run on channel pages
    if (!window.location.pathname.match(/\/@|\/channel\/|\/c\/|\/user\//)) {
      console.log('Not on a channel page, skipping voting button');
      return;
    }
    
    console.log('On channel page, will add voting button');
    
    // Wait for page to load
    setTimeout(() => {
      console.log('Attempting to add voting button (1s delay)');
      addVotingButton();
    }, 1000);
    
    // Also try again after a delay (for slow loading pages)
    setTimeout(() => {
      console.log('Attempting to add voting button again (2s delay)');
      addVotingButton();
    }, 2000);
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

// Re-initialize when URL changes (YouTube SPA)
let lastVotingUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastVotingUrl) {
    lastVotingUrl = url;
    console.log('URL changed, re-initializing voting system');
    setTimeout(initVoting, 500);
  }
}).observe(document, { subtree: true, childList: true });

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVoting);
} else {
  initVoting();
}
