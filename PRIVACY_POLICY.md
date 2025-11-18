# Privacy Policy for YouTube AI Content Warning Extension

**Last Updated:** November 17, 2025

## Overview

YouTube AI Content Warning is a browser extension that helps users identify YouTube channels that may use AI-generated content through a community-driven flagging system.

## Data Collection

### What Data We Collect

This extension collects the following data when you use its features:

1. **YouTube Channel Information**
   - Channel IDs (e.g., "UCxxxxx")
   - Channel display names
   - Only collected when you:
     - Vote on a channel using the "Report AI Content" button
     - Manually add a channel to your flagged list

2. **Vote Counts**
   - Aggregated vote counts for channels
   - Not tied to individual users or personal identifiers

### What Data We Do NOT Collect

- Personal information (name, email, address, age)
- Browsing history or web activity
- Location data or IP addresses
- Passwords or authentication credentials
- Financial information
- Health information
- Personal communications

## How We Use Your Data

Data collected is used exclusively to:

1. Maintain the community voting system for AI content detection
2. Sync the official list of flagged channels across users
3. Display warning indicators on YouTube channels and videos

## Data Storage

- **Local Storage:** User preferences and settings are stored locally in your browser using Chrome's storage API
- **Remote Storage:** Channel IDs, names, and vote counts are stored on our secure Azure Functions backend
- **Cache Duration:** Vote count data is cached locally for 1 hour to minimize server requests

## Data Sharing

We do NOT:

- Sell your data to third parties
- Use your data for advertising
- Share your data with third parties except as required by law
- Track individual user behavior

All collected data (channel IDs and names) is public YouTube information already available on the platform.

## User Control

You have full control over your data:

- **Disable Voting:** You can disable the voting system in extension settings
- **Disable Sync:** You can disable automatic syncing with the official channel list
- **Manual Lists:** You can maintain a completely local list without any server communication
- **Remove Data:** Uninstalling the extension removes all local data

## Data Security

- All API communications use HTTPS encryption
- No personal identifiers are collected or stored
- Channel data is aggregated and anonymized

## Third-Party Services

This extension communicates with:

- **YouTube.com:** To inject warning indicators on YouTube pages
- **Azure Functions (yt-sus-func-eyamhschcdg3dcbx.eastus-01.azurewebsites.net):** To sync channel lists and vote counts

## Children's Privacy

This extension does not knowingly collect data from users under 13 years of age.

## Changes to This Policy

We may update this privacy policy as the extension evolves. The "Last Updated" date will reflect any changes. Continued use of the extension after changes constitutes acceptance of the updated policy.

## Contact

For questions or concerns about this privacy policy, please contact:

- GitHub Issues: <https://github.com/orthrauku-dev/yt-sus/issues>

## Your Rights

Depending on your location, you may have rights under GDPR, CCPA, or other privacy laws including:

- Right to access your data
- Right to delete your data
- Right to opt-out of data collection

To exercise these rights, disable the voting and sync features in the extension settings or uninstall the extension.

## Compliance

This extension complies with:

- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)
