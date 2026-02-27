console.log("🔥 main.js loaded");
const SIGNALING_URL = "wss://shmeg1repo.onrender.com";
const FORCE_TURN_RELAY = true; // Set true to force TURN relay-only testing.
const pcConfig = {
  iceTransportPolicy: FORCE_TURN_RELAY ? "relay" : "all",
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

let socket;
let pc;
let localStream;
let isMuted = true;

const button = document.getElementById("toggleBtn");
const statusEl = document.getElementById("status");
const remoteAudio = document.getElementById("remoteAudio");

function log(...args) {
  console.log(...args);
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function setMuted(muted) {
  isMuted = muted;

  if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }

  if (button) {
    button.textContent = muted ? "Unmute" : "Mute";
  }
}

function wireToggleToTalk() {
  button.addEventListener("click", () => {
    setMuted(!isMuted);
  });
}
async function setupLocalAudio() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = false;
  });
 setMuted(true);
 log("Microphone captured (initially muted)");
}

function createPeerConnection() {
  pc = new RTCPeerConnection(pcConfig);

  pc.onconnectionstatechange = () => {
    log("🔗 Connection state:", pc.connectionState);
    setStatus(`Connection: ${pc.connectionState}`);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      log("LOCAL ICE:", event.candidate.candidate);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ice", candidate: event.candidate }));
      }
    } else {
      log("✅ ICE gathering complete");
    }
  };

  pc.ontrack = (event) => {
    log("🎵 Audio track received from Pi");

    if (!remoteAudio) {
      log("❌ remoteAudio element not found in index.html");
      return;
    }

    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play().catch((err) =>
      log("⚠️ Remote audio autoplay blocked until user gesture:", err)
    );
  };
  // send browser mic to Pi
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
}

function connectWebSocket() {
  socket = new WebSocket(SIGNALING_URL);

  socket.onopen = () => {
    log("✅ WebSocket connected:", SIGNALING_URL);
    setStatus("Signaling connected");
  };
  socket.onclose = () => {
    log("⚠️ WebSocket closed");
    setStatus("Signaling disconnected");
  };
  socket.onerror = (event) => {
    log("❌ WebSocket error", event);
  };

  socket.onmessage = async (msg) => {
    const text = msg.data instanceof Blob ? await msg.data.text() : msg.data;
    const data = JSON.parse(text);

    if (data.type === "offer") {
      log("📥 SDP offer received");
      await pc.setRemoteDescription(data);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.send(JSON.stringify(answer));
      log("📤 SDP answer sent");
    } else if (data.type === "ice" && data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
        log("📥 Remote ICE candidate added");
      } catch (e) {
        log("⚠️ Failed to add ICE candidate:", e);
      }
    }
  };
}
async function init() {
  try {
    wireToggleToTalk();
    await setupLocalAudio();
    createPeerConnection();
    connectWebSocket();
    setStatus("Ready (waiting for offer)");
  } catch (error) {
    log("❌ Initialization failed:", error);
    setStatus("Initialization failed - check console");
    button.disabled = true;
  }
}

init();
