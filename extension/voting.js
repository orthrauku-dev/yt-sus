// Voting system for YouTube channels
console.log('YouTube Voting System loaded');

// Storage key for votes
const VOTES_STORAGE_KEY = 'channelVotes';

// Settings
let votingEnabled = true;

// Load settings
async function loadVotingSettings() {
  const result = await chrome.storage.local.get(['warningSettings']);
  if (result.warningSettings && result.warningSettings.showVoting !== undefined) {
    votingEnabled = result.warningSettings.showVoting;
  }
  console.log('Voting enabled:', votingEnabled);
}

// Get all votes from storage
async function getVotes() {
  const result = await chrome.storage.local.get([VOTES_STORAGE_KEY]);
  return result[VOTES_STORAGE_KEY] || {};
}

// Save votes to storage
async function saveVotes(votes) {
  await chrome.storage.local.set({ [VOTES_STORAGE_KEY]: votes });
}

// Get vote count for a channel
async function getChannelVotes(channelId) {
  const votes = await getVotes();
  return votes[channelId] || 0;
}

// Add an upvote for a channel
async function upvoteChannel(channelId) {
  const votes = await getVotes();
  votes[channelId] = (votes[channelId] || 0) + 1;
  await saveVotes(votes);
  return votes[channelId];
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
  // Check if voting is enabled
  if (!votingEnabled) {
    removeVotingButton();
    return;
  }
  
  // Check if we're on a channel page
  const channelId = extractChannelIdFromPage();
  if (!channelId) {
    console.log('Not on a channel page, skipping vote button');
    return;
  }

  // Find the flexible actions container
  const actionsContainer = document.querySelector('yt-flexible-actions-view-model.yt-page-header-view-model__page-header-flexible-actions');
  
  if (!actionsContainer) {
    console.log('Could not find actions container for vote button');
    return;
  }

  // Check if button already exists
  if (document.querySelector('.yt-ai-vote-button')) {
    console.log('Vote button already exists');
    return;
  }

  // Get current vote count
  const voteCount = await getChannelVotes(channelId);
  const hasVoted = hasVotedThisSession(channelId);

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
  buttonContent.innerHTML = `👍 ${voteCount > 0 ? voteCount : 'Upvote'}`;
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

    // Add vote
    const newCount = await upvoteChannel(channelId);
    
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
}

// Remove voting button
function removeVotingButton() {
  const existingButton = document.querySelector('.yt-ai-vote-button');
  if (existingButton) {
    existingButton.remove();
    console.log('Vote button removed');
  }
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
  // Load settings
  await loadVotingSettings();
  
  // Only run on channel pages
  if (!window.location.pathname.match(/\/@|\/channel\/|\/c\/|\/user\//)) {
    return;
  }
  
  // Wait for page to load
  setTimeout(() => {
    addVotingButton();
  }, 1000);
  
  // Also try again after a delay (for slow loading pages)
  setTimeout(() => {
    addVotingButton();
  }, 2000);
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
