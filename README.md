# YouTube AI Content Warning

A Chrome extension that helps users identify YouTube channels that may use AI-generated content through a community-driven flagging system.

- [YouTube AI Content Warning](#youtube-ai-content-warning)
  - [Single Purpose](#single-purpose)
  - [Features](#features)
    - [Visual Warnings](#visual-warnings)
    - [Community Voting System](#community-voting-system)
    - [Channel Lists](#channel-lists)
    - [Customizable Settings](#customizable-settings)
  - [Installation](#installation)
    - [From Source (Developer Mode)](#from-source-developer-mode)
    - [From Chrome Web Store](#from-chrome-web-store)
  - [Usage](#usage)
    - [Basic Usage](#basic-usage)
    - [Managing Flagged Channels](#managing-flagged-channels)
    - [Voting System](#voting-system)
  - [Technology Stack](#technology-stack)
  - [Contributing](#contributing)
  - [License](#license)
  - [Acknowledgments](#acknowledgments)
  - [Contact](#contact)

## Single Purpose

This extension warns users about YouTube channels that may use AI-generated content through visual indicators and a community voting system.

## Features

### Visual Warnings

- **Channel Page Warnings**: Red warning indicators appear on flagged channel homepages
- **Video Title Warnings**: Warning icons appear on video pages from flagged channels
- **Real-time Detection**: Warnings appear automatically as you browse YouTube

### Community Voting System

- **Report AI Content**: Vote on channels you believe use AI-generated content
- **Vote Counts**: See how many users have flagged each channel
- **Customizable Threshold**: Set your own vote count threshold to auto-flag channels
- **Optional**: Completely disable voting if you prefer

### Channel Lists

- **Official Synced List**: Automatically syncs with a curated list of flagged channels
- **Manual List**: Add or remove channels manually for immediate flagging
- **Flexible Control**: Disable auto-sync and maintain your own private list

### Customizable Settings

- **Warning Styles**: Choose your warning indicator appearance
- **Sync Options**: Enable/disable automatic syncing with the official list
- **Voting Options**: Enable/disable the voting system
- **Vote Threshold**: Set custom vote counts for auto-flagging

## Installation

### From Source (Developer Mode)

1. Download or clone this repository:

   ```bash
   git clone https://github.com/orthrauku-dev/yt-sus.git
   cd yt-sus
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked**

5. Select the `extension` folder from this repository

6. The extension icon should appear in your Chrome toolbar

### From Chrome Web Store

*Coming soon - awaiting review*

## Usage

### Basic Usage

1. **Browse YouTube normally** - The extension works automatically in the background

2. **See Warnings** - When you visit a flagged channel or video, you'll see a red warning indicator

3. **Vote on Channels** - Visit any channel page and click the "Report AI Content" button to vote

4. **Manage Settings** - Click the extension icon to open the popup and customize your preferences

### Managing Flagged Channels

**Add a channel manually:**

1. Visit the channel page on YouTube
2. Click the extension icon
3. Click "Add Highlight" or "Report AI Content"

**Remove a channel:**

1. Click the extension icon
2. Find the channel in your list
3. Click "Remove"

**Clear all channels:**

- Click "Clear All" in the extension popup

### Voting System

The voting system allows the community to collectively identify AI content channels:

1. **Vote**: Click "Report AI Content" on any channel page
2. **View Votes**: See vote counts in the extension popup
3. **Set Threshold**: Configure how many votes trigger automatic flagging
4. **Disable**: Turn off voting completely in settings if preferred

## Technology Stack

- **JavaScript** - Core extension logic
- **Chrome Extension APIs**:
  - `chrome.storage` - Local data persistence
  - `chrome.runtime` - Message passing between components
  - `chrome.tabs` - Tab management and communication
- **Azure Functions** - Backend API for vote counts and channel sync
- **HTML/CSS** - User interface

See our full [Privacy Policy](PRIVACY_POLICY.md) for details.

## Contributing

This is a personal project, but contributions are welcome! If you find a bug or have a feature request:

1. Open an issue on [GitHub Issues](https://github.com/orthrauku-dev/yt-sus/issues)
2. Fork the repository and submit a pull request
3. Share feedback through the extension's voting system

## License

This project is open source and available under the MIT License.

## Acknowledgments

This extension was built with assistance from GitHub Copilot. If this project receives attention, I'm committed to:

- Extensive code refactoring and optimization
- Additional features and improvements
- Better documentation and user guides
- Community-requested enhancements

## Contact

- **GitHub Issues**: [Report bugs or request features](https://github.com/orthrauku-dev/yt-sus/issues)

---

**Help make YouTube more transparent!** If you encounter AI-generated content, use this extension to help others identify it. Your votes matter!
