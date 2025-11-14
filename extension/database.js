// Mock Database for storing highlighted channels
class ChannelDatabase {
  constructor() {
    this.storageKey = 'highlightedChannels';
  }

  // Initialize the database
  async init() {
    const result = await chrome.storage.local.get(this.storageKey);
    if (!result[this.storageKey]) {
      await chrome.storage.local.set({ [this.storageKey]: {} });
    }
  }

  // Add a channel to the database
  async addChannel(channelId, channelName, channelHandle) {
    const data = await this.getAllChannels();
    data[channelId] = {
      id: channelId,
      name: channelName,
      handle: channelHandle,
      addedAt: new Date().toISOString(),
      highlighted: true
    };
    await chrome.storage.local.set({ [this.storageKey]: data });
    return data[channelId];
  }

  // Remove a channel from the database
  async removeChannel(channelId) {
    const data = await this.getAllChannels();
    delete data[channelId];
    await chrome.storage.local.set({ [this.storageKey]: data });
    return true;
  }

  // Check if a channel is highlighted
  async isChannelHighlighted(channelId) {
    const data = await this.getAllChannels();
    return data[channelId]?.highlighted || false;
  }

  // Get all highlighted channels
  async getAllChannels() {
    const result = await chrome.storage.local.get(this.storageKey);
    return result[this.storageKey] || {};
  }

  // Toggle channel highlight status
  async toggleChannel(channelId, channelName, channelHandle) {
    const isHighlighted = await this.isChannelHighlighted(channelId);
    
    if (isHighlighted) {
      await this.removeChannel(channelId);
      return false;
    } else {
      await this.addChannel(channelId, channelName, channelHandle);
      return true;
    }
  }

  // Clear all highlighted channels
  async clearAll() {
    await chrome.storage.local.set({ [this.storageKey]: {} });
    return true;
  }

  // Get channel count
  async getCount() {
    const data = await this.getAllChannels();
    return Object.keys(data).length;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChannelDatabase;
}
