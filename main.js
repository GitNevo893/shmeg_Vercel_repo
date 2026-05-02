console.log("main.js loaded");
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
const pendingIce = [];
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
  localStream.getAudioTracks().forEach((track) => (track.enabled = false));
  setMuted(true);
  log("Microphone captured (initially muted)");
}
function createPeerConnection() {
  pc = new RTCPeerConnection(pcConfig);
  // --- State logs (so it can't "die silently") ---
  pc.onconnectionstatechange = () => {
    log("Connection state:", pc.connectionState);
    setStatus(`Connection: ${pc.connectionState}`);
  };
  pc.oniceconnectionstatechange = () => {
    log("ICE state:", pc.iceConnectionState);
  }
  pc.onsignalingstatechange = () => {
    log("Signaling state:", pc.signalingState);
  };
  // --- ICE out ---
  pc.onicecandidate = (event) => {
  if (event.candidate) {
    log("LOCAL ICE:", event.candidate.candidate);
    // Always buffer
    pendingIce.push(event.candidate);
    // Flush if possible
    if (socket && socket.readyState === WebSocket.OPEN) {
      while (pendingIce.length) {
        socket.send(JSON.stringify({ type: "ice", candidate: pendingIce.shift() }));
      }
    }
  } else {
    log("ICE gathering complete:)");
  }
};
  // --- Remote audio in ---
  pc.ontrack = (event) => {
    log("Audio track received from Pi");
    const track = event.track;
    track.onmute = () => log("Remote track muted");
    track.onunmute = () => log("Remote track unmuted");
    track.onended = () => log("Remote track ended");
    if (!remoteAudio) {
      log("remoteAudio element not found in index.html");
      return;
    }
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.muted = false;
    remoteAudio.volume = 1.0;
    remoteAudio.autoplay = true;
    remoteAudio.controls = true;
    remoteAudio.play().catch((err) =>
      log("Remote audio autoplay blocked until user gesture:", err)
    );
  };
  // --- DataChannel in (created by Pi) + keepalive ---
  pc.ondatachannel = (event) => {
    const channel = event.channel;
    log("DataChannel received:", channel.label);
    channel.onopen = () => {
      log("DataChannel open");
      // Keepalive every 15s: prevents NAT mappings expiring on some networks
      setInterval(() => {
        if (channel.readyState === "open") channel.send("ping");
      }, 15000);
    };
    channel.onmessage = (e) => {
      if (e.data === "pong") return;
      log("DataChannel msg:", e.data);
    };
    channel.onclose = () => log("DataChannel closed");
  };
  // --- Send browser mic to Pi ---
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
}
function connectWebSocket() {
  socket = new WebSocket(SIGNALING_URL);
  socket.onopen = () => {
    log("WebSocket connected:", SIGNALING_URL);
    setStatus("Signaling connected");
    while (pendingIce.length) {
      socket.send(JSON.stringify({ type: "ice", candidate: pendingIce.shift() }));
    }
  };
  socket.onclose = (event) => {
    log("WebSocket closed", {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });
    setStatus("Signaling disconnected");
  };
  socket.onerror = (event) => {
    log("WebSocket error", event);
  };
  // Keepalive so some hosts don't drop idle sockets
  const keepAlive = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ping", t: Date.now() }));
    }
  }, 25000);
  socket.addEventListener("close", () => clearInterval(keepAlive));
  socket.onmessage = async (msg) => {
    try {
      const text = msg.data instanceof Blob ? await msg.data.text() : msg.data;
      const data = JSON.parse(text);
      if (data.type === "offer") {
        log("SDP offer received");
        await pc.setRemoteDescription(data);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.send(JSON.stringify(answer));
        log("SDP answer sent");
      } else if (data.type === "ice" && data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
          log("Remote ICE candidate added");
        } catch (e) {
          log("Failed to add ICE candidate:", e);
        }
      } else if (data.type === "ping") {
        // ignore (server keepalive)
      } else {
        log("Signaling msg:", data.type);
      }
    } catch (e) {
      log("Failed to handle signaling message:", e);
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
    log("Initialization failed:", error);
    setStatus("Initialization failed - check console");
    button.disabled = true;
  }
}
init();
