//const player = require("play-sound")();
const { exec } = require("child_process");
const path = require("path");
const sound = require("sound-play"); // Import the sound-play library

class Queue {
  constructor() {
    this.items = [];
  }

  // Add an element to the queue
  enqueue(element) {
    if (!this.items.includes(element)) {
      // Check for duplicates
      this.items.push(element);
      console.log("Enqueued:", element);
      this.playSound();
      console.log("Sound played!");
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

  // Clear the queue
  clear() {
    this.items = [];
  }

  async playSound() {
    const soundFilePath = path.resolve(__dirname, "../../audio_pings/ping1.wav");
    console.log("Attempting to play sound from:", soundFilePath);

    try {
      await sound.play(soundFilePath); // Play the sound file
      console.log("Sound played successfully!");
    } catch (err) {
      console.error("Error playing sound:", err);
    }
  }
}

module.exports = Queue;
