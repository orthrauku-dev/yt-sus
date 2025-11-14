// Test file to demonstrate how the mock database works
// This is for educational purposes - the actual database runs in the browser

console.log('=== YouTube Channel Highlighter - Database Demo ===\n');

// Simulate the database structure
class MockChannelDatabase {
  constructor() {
    this.storage = {}; // Simulates chrome.storage.local
    this.storageKey = 'highlightedChannels';
    this.storage[this.storageKey] = {};
  }

  // Add a channel
  async addChannel(channelId, channelName, channelHandle) {
    this.storage[this.storageKey][channelId] = {
      id: channelId,
      name: channelName,
      handle: channelHandle,
      addedAt: new Date().toISOString(),
      highlighted: true
    };
    console.log(`✅ Added channel: ${channelName} (${channelId})`);
    return this.storage[this.storageKey][channelId];
  }

  // Remove a channel
  async removeChannel(channelId) {
    const channel = this.storage[this.storageKey][channelId];
    delete this.storage[this.storageKey][channelId];
    console.log(`❌ Removed channel: ${channel.name} (${channelId})`);
    return true;
  }

  // Check if highlighted
  async isChannelHighlighted(channelId) {
    return !!this.storage[this.storageKey][channelId];
  }

  // Get all channels
  async getAllChannels() {
    return this.storage[this.storageKey];
  }

  // Get count
  async getCount() {
    return Object.keys(this.storage[this.storageKey]).length;
  }

  // Display all channels
  async displayAll() {
    const channels = await this.getAllChannels();
    const count = await this.getCount();
    
    console.log(`\n📊 Total Highlighted Channels: ${count}\n`);
    
    if (count === 0) {
      console.log('No channels highlighted yet.');
      return;
    }
    
    for (const [id, channel] of Object.entries(channels)) {
      console.log(`🔴 ${channel.name}`);
      console.log(`   ID: ${channel.id}`);
      console.log(`   Handle: ${channel.handle || 'N/A'}`);
      console.log(`   Added: ${new Date(channel.addedAt).toLocaleString()}`);
      console.log('');
    }
  }
}

// Demo usage
async function runDemo() {
  const db = new MockChannelDatabase();
  
  console.log('1. Adding some test channels...\n');
  
  await db.addChannel('UCxxxxxx001', 'Test Channel 1', '@testchannel1');
  await db.addChannel('UCxxxxxx002', 'Suspicious Channel', '@suspicious');
  await db.addChannel('@handleonly', 'Handle Only Channel', '@handleonly');
  
  await db.displayAll();
  
  console.log('2. Checking if a channel is highlighted...\n');
  const isHighlighted = await db.isChannelHighlighted('UCxxxxxx001');
  console.log(`Is 'Test Channel 1' highlighted? ${isHighlighted ? '✅ Yes' : '❌ No'}\n`);
  
  console.log('3. Removing a channel...\n');
  await db.removeChannel('UCxxxxxx002');
  
  await db.displayAll();
  
  console.log('4. Database structure (as stored in chrome.storage.local):\n');
  console.log(JSON.stringify(db.storage, null, 2));
  
  console.log('\n=== Demo Complete ===');
  console.log('\n💡 In the actual extension, this data persists across browser sessions!');
  console.log('💡 All operations happen in the background script and sync to content scripts.');
}

// Run the demo
runDemo().catch(console.error);
