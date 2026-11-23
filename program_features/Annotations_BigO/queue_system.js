//const player = require("play-sound")();
const { exec } = require("child_process");
const path = require("path");
const sound = require("sound-play"); // Import the sound-play library

// Time between the start of one ping and the next
const PING_INTERVAL_MS = 500;

// Pings are shared by every Queue instance so annotation and Big O pings
// take turns instead of playing over each other.
let pendingPings = [];
let pingTimer = null;

// Big O issues are pushed to both annotationQueue and bigOQueue; ping once per item
const pingedItems = new WeakSet();

function schedulePing(element) {
  if (typeof element === "object" && element !== null) {
    if (pingedItems.has(element)) return;
    pingedItems.add(element);
  }

  pendingPings.push(element);
  if (!pingTimer) playNextPing();
}

function playNextPing() {
  if (pendingPings.length === 0) {
    pingTimer = null;
    return;
  }

  pendingPings.shift();
  // Not awaited: the clip runs past PING_INTERVAL_MS, so waiting for it would
  // stretch the gap well beyond half a second.
  playSound();
  pingTimer = setTimeout(playNextPing, PING_INTERVAL_MS);
}

async function playSound() {
  const soundFilePath = path.resolve(__dirname, "../../audio_pings/ping1.wav");
  console.log("Attempting to play sound from:", soundFilePath);

  try {
    await sound.play(soundFilePath); // Play the sound file
    console.log("Sound played successfully!");
  } catch (err) {
    console.error("Error playing sound:", err);
  }
}

// Callers build a new object for every annotation, even when it repeats one already
// queued, so compare what the item says rather than which object it is
function isSameItem(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  return (
    a.line !== undefined && a.line === b.line && a.suggestion === b.suggestion
  );
}

class Queue {
  constructor() {
    this.items = [];
  }

  // Add an element to the queue
  enqueue(element) {
    if (!this.items.some((item) => isSameItem(item, element))) {
      // Check for duplicates
      this.items.push(element);
      console.log("Enqueued:", element);
      schedulePing(element);
    } else {
      console.log("Duplicate detected, not enqueuing:", element);
    }
  }

  // Remove and return the front element of the queue
  dequeue() {
    if (this.isEmpty()) {
      throw new Error("Queue is empty");
    }
    return this.items.shift();
  }

  // Return the front element of the queue without removing it
  peek() {
    if (this.isEmpty()) {
      throw new Error("Queue is empty");
    }
    return this.items[0];
  }

  // Check if the queue is empty
  isEmpty() {
    return this.items.length === 0;
  }

  // Get the size of the queue
  size() {
    return this.items.length;
  }

  // Remove specific elements (e.g. one feature's results) and leave the rest
  remove(elements) {
    pendingPings = pendingPings.filter((p) => !elements.includes(p));
    this.items = this.items.filter((item) => !elements.includes(item));
  }

  // Clear the queue
  clear() {
    // Drop pings that haven't played yet so cleared annotations go quiet
    pendingPings = pendingPings.filter((p) => !this.items.includes(p));
    this.items = [];
  }
}

module.exports = Queue;
