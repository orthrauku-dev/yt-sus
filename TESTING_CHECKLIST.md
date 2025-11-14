# Testing Checklist ✅

Use this checklist to test all features of the YouTube Channel Highlighter extension.

## Installation Testing

- [ ] Load extension in Chrome (`chrome://extensions/`)
- [ ] Extension icon appears in toolbar
- [ ] No errors shown on extensions page
- [ ] Click extension icon - popup opens

## Basic Functionality

- [ ] Navigate to YouTube homepage
- [ ] Click on any channel link
- [ ] Open extension popup
- [ ] See current channel information displayed
- [ ] Click "Add Highlight" button
- [ ] Channel gets highlighted in red
- [ ] Popup now shows "Remove Highlight" button

## Highlighting Tests

- [ ] Highlighted channel shows red border
- [ ] Highlighted channel shows red background (subtle)
- [ ] Highlight appears on video thumbnails by that channel
- [ ] Highlight appears on channel links
- [ ] Highlight appears on channel header (on channel page)
- [ ] Highlight persists when navigating away and back

## Database Tests

- [ ] Add 3 different channels to highlights
- [ ] Popup shows count: "Highlighted Channels (3)"
- [ ] All 3 channels listed in popup with names and dates
- [ ] Remove one channel using "Remove" button
- [ ] Count updates to 2
- [ ] Removed channel no longer highlighted on YouTube
- [ ] Click "Clear All" button
- [ ] Confirm dialog appears
- [ ] All channels removed
- [ ] Count shows 0

## Persistence Tests

- [ ] Add a channel to highlights
- [ ] Close Chrome completely
- [ ] Reopen Chrome
- [ ] Navigate to YouTube
- [ ] Previously highlighted channel is still highlighted
- [ ] Open extension popup
- [ ] Channel still appears in the list

## Multi-Tab Tests

- [ ] Open YouTube in Tab 1
- [ ] Highlight a channel via extension popup
- [ ] Open YouTube in Tab 2 (new tab)
- [ ] Channel is highlighted in Tab 2
- [ ] Remove highlight in Tab 2
- [ ] Switch to Tab 1
- [ ] Refresh Tab 1 - highlight is gone

## URL Format Tests

Test different YouTube channel URL formats:

- [ ] `/channel/UCxxxxxx` format works
- [ ] `/@handlename` format works
- [ ] `/c/customname` format works
- [ ] `/user/username` format works

## YouTube Navigation Tests

- [ ] Highlight a channel
- [ ] Navigate using YouTube's interface (no page reload)
- [ ] Search for videos
- [ ] Highlighted channels appear in search results
- [ ] Click on homepage
- [ ] Highlighted channels appear in recommendations
- [ ] Navigate to subscriptions
- [ ] Highlighted channels appear there too

## Debugging Tests

### Popup Debugging
- [ ] Right-click extension icon → Inspect popup
- [ ] DevTools opens
- [ ] Console shows "Popup script loaded"
- [ ] Can see variables and state
- [ ] Set a breakpoint in popup.js
- [ ] Click a button - execution pauses

### Background Script Debugging
- [ ] Go to `chrome://extensions/`
- [ ] Click "service worker" link
- [ ] DevTools opens
- [ ] Console shows "background script loaded"
- [ ] Add a channel - see console logs
- [ ] Can inspect the service worker state

### Content Script Debugging
- [ ] Open YouTube
- [ ] Press F12
- [ ] Console shows "content script loaded"
- [ ] Can see highlight application logs
- [ ] Go to Sources → Content scripts
- [ ] Can see and debug content.js

## Edge Cases

- [ ] Visit YouTube homepage (not a specific channel) - popup shows appropriate message
- [ ] Visit non-YouTube page - extension doesn't interfere
- [ ] Rapidly click Add/Remove highlight - works smoothly
- [ ] Add 20+ channels - popup scrolls properly
- [ ] Long channel names display properly
- [ ] Special characters in channel names handled correctly

## Code Change Testing

- [ ] Edit popup.js (change button text)
- [ ] Save file
- [ ] Reload extension
- [ ] Open popup - change appears
- [ ] Edit content.js (change highlight color to blue)
- [ ] Save file
- [ ] Reload extension
- [ ] Refresh YouTube - highlights now blue
- [ ] Change back to red and test again

## Performance Tests

- [ ] Extension loads quickly
- [ ] Popup opens instantly
- [ ] Highlighting doesn't lag YouTube
- [ ] Can navigate YouTube smoothly with extension active
- [ ] Multiple highlighted channels don't slow down page

## Error Handling

- [ ] Try to highlight while not on a YouTube channel - appropriate message shown
- [ ] Close popup while action is processing - no errors
- [ ] Rapidly switch between tabs - no errors
- [ ] Check browser console for any errors

## Visual/UI Tests

- [ ] Popup displays correctly (no layout issues)
- [ ] Buttons are clickable and responsive
- [ ] Hover effects work on buttons
- [ ] Channel list items have proper spacing
- [ ] Red highlights are clearly visible
- [ ] Colors are consistent
- [ ] Text is readable
- [ ] Icons display properly

## Final Checks

- [ ] No console errors anywhere
- [ ] Extension doesn't break YouTube functionality
- [ ] Can still play videos normally
- [ ] Can still comment, like, subscribe normally
- [ ] Extension feels smooth and professional
- [ ] Database operations are fast

---

## Test Results

**Date Tested:** _______________

**Browser Version:** Chrome _______________

**Overall Status:** ⭐⭐⭐⭐⭐

**Notes:**
