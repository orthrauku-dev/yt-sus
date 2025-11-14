# Chrome Extension Development Guide

## What Languages Does It Use?

Chrome extensions are built using standard web technologies:
- **JavaScript** - Main programming language for logic
- **HTML** - For popup pages, options pages, and other UI
- **CSS** - For styling
- **JSON** - For the manifest configuration file

## Step-by-Step Instructions to Create a Chrome Extension

### Step 1: Create the Project Structure

Create a new folder for your extension with the following files:

```
my-extension/
├── manifest.json (required)
├── popup.html (optional)
├── popup.js (optional)
├── background.js (optional)
├── content.js (optional)
├── styles.css (optional)
└── icons/ (optional)
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### Step 2: Create the Manifest File

Create a `manifest.json` file (this is required for every extension):

```json
{
  "manifest_version": 3,
  "name": "My Chrome Extension",
  "version": "1.0.0",
  "description": "A simple Chrome extension",
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "permissions": [
    "activeTab",
    "storage"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ]
}
```

### Step 3: Create the Popup HTML (Optional)

Create `popup.html` for the extension's popup UI:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>Hello from Extension!</h1>
  <button id="myButton">Click Me</button>
  <script src="popup.js"></script>
</body>
</html>
```

### Step 4: Create the JavaScript Files

**popup.js** (handles popup interactions):
```javascript
document.getElementById('myButton').addEventListener('click', () => {
  console.log('Button clicked!');
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'buttonClicked'});
  });
});
```

**background.js** (runs in the background):
```javascript
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed!');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  sendResponse({status: 'ok'});
});
```

**content.js** (runs on web pages):
```javascript
console.log('Content script loaded!');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'buttonClicked') {
    alert('Hello from content script!');
  }
});
```

### Step 5: Add CSS Styling (Optional)

Create `styles.css`:
```css
body {
  width: 300px;
  padding: 10px;
  font-family: Arial, sans-serif;
}

button {
  padding: 10px 20px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #45a049;
}
```

## How to Test Your Extension

### Method 1: Load Unpacked Extension (Development Mode)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select your extension folder
5. Your extension should now appear in the list and be active

### Method 2: Test Changes

After making changes to your code:
1. Go to `chrome://extensions/`
2. Find your extension
3. Click the **Reload** button (circular arrow icon)
4. Test your changes

### Method 3: Quick Reload Shortcut

- Press `Ctrl+R` (or `Cmd+R` on Mac) on the `chrome://extensions/` page
- Or use the keyboard shortcut while on any page if you set one up

## Live Debugging - YES, You Can!

Chrome provides excellent debugging tools for extensions:

### 1. Debug Popup Scripts

- Right-click on your extension icon in the toolbar
- Select **Inspect popup**
- This opens Chrome DevTools for the popup
- You can set breakpoints, inspect variables, and see console logs
- **Note:** The popup must stay open for debugging (it closes when focus is lost)

### 2. Debug Background Scripts (Service Worker)

- Go to `chrome://extensions/`
- Find your extension
- Click **service worker** link (or **background page** in Manifest V2)
- DevTools opens for the background script
- All console.logs, errors, and breakpoints work here

### 3. Debug Content Scripts

- Open any webpage where your content script runs
- Right-click on the page → **Inspect** (or press `F12`)
- Open the **Console** tab
- You'll see logs from your content script
- Go to **Sources** tab → **Content scripts** to set breakpoints
- Search for your script files under the extension's ID

### 4. Real-Time Code Changes

While you can't do true "hot reload" like some modern frameworks:

1. **Edit your code** in your editor
2. **Save the file**
3. Go to `chrome://extensions/`
4. Click the **reload icon** on your extension
5. **Test immediately** - changes take effect right away

**Pro Tip:** Keep DevTools open while developing. Console logs persist across reloads.

### 5. Debugging Tips

```javascript
// Use console.log() liberally
console.log('Variable value:', myVariable);

// Use debugger statements to pause execution
debugger;

// Check if code is running
console.log('Script loaded!');

// Log errors
try {
  // your code
} catch (error) {
  console.error('Error:', error);
}
```

### 6. View Extension Errors

- Go to `chrome://extensions/`
- Look for the **Errors** button on your extension
- Click it to see all runtime errors
- Errors also appear in the DevTools console

## Common Manifest V3 Patterns

### Permissions
```json
"permissions": [
  "activeTab",      // Access current tab
  "storage",        // Use chrome.storage API
  "tabs",           // Access tab information
  "scripting"       // Inject scripts programmatically
]
```

### Host Permissions
```json
"host_permissions": [
  "https://*.google.com/*",
  "https://example.com/*"
]
```

### Content Script Injection

```javascript
// Programmatic injection (requires "scripting" permission)
chrome.scripting.executeScript({
  target: { tabId: tab.id },
  files: ['content.js']
});
```

## Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome Extension Samples](https://github.com/GoogleChrome/chrome-extensions-samples)
- [Extension APIs Reference](https://developer.chrome.com/docs/extensions/reference/)

## Troubleshooting

**Extension not loading?**
- Check that `manifest.json` is valid JSON (use a JSON validator)
- Ensure all file paths in manifest.json are correct
- Check the Errors section on `chrome://extensions/`

**Console.log not showing?**
- Make sure you're looking in the right DevTools (popup vs background vs content)
- Check if the script is actually running

**Changes not appearing?**
- Always reload the extension after code changes
- For content scripts, you may also need to refresh the webpage

---

## 🎯 YouTube Channel Highlighter Extension

I've created a complete Chrome extension for you! It's located in the `/extension` folder.

### What It Does

✅ **Highlights YouTube channels in red** with a visual red border and background  
✅ **Mock database** using Chrome's storage API to persist your highlighted channels  
✅ **Beautiful popup interface** to manage channels  
✅ **Real-time highlighting** that works as you browse YouTube  
✅ **Full live debugging** support with DevTools  

### Quick Start

1. **Load the Extension**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `/home/wehrum/repos/yt-sus/extension` folder

2. **Use It**
   - Visit any YouTube channel
   - Click the extension icon
   - Click "Add Highlight"
   - Watch the channel get highlighted in red across YouTube!

3. **Debug It**
   - Right-click extension icon → "Inspect popup" for popup debugging
   - Click "service worker" on extensions page for background script debugging
   - Press F12 on YouTube to debug the content script

📁 **See `/extension/README.md` for complete documentation!**
