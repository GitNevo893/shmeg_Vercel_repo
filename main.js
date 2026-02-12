console.log("🔥 main.js loaded");
const signalingUrl = "wss://shmeg1repo.onrender.com";
let socket;
let pc;
let localStream;
let isMuted = true;

const button = document.getElementById("toggleBtn");

button.onclick = async () => {
  if (!pc) {
    await startWebRTC();
  }

  isMuted = !isMuted;
  localStream.getAudioTracks()[0].enabled = !isMuted;
  button.textContent = isMuted ? "Unmute" : "Mute";
};

async function startWebRTC() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream.getAudioTracks()[0].enabled = false;

  pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  pc.onconnectionstatechange = () => {
    console.log("Connection state:", pc.connectionState);
  };

  pc.ondatachannel = (event) => {
    const channel = event.channel;

    channel.onopen = () => {
      console.log("✅ DataChannel open");
      channel.send("Hello from browser");
    };

    channel.onmessage = (event) => {
      console.log("📩 From Pi:", event.data);
    };
  };

  localStream.getTracks().forEach(track =>
    pc.addTrack(track, localStream)
  );

  socket = new WebSocket(signalingUrl);

  socket.onopen = () => {
    console.log("✅ WebSocket connected");
  };

  socket.onmessage = async (msg) => {
    let text = msg.data instanceof Blob
      ? await msg.data.text()
      : msg.data;

    const data = JSON.parse(text);

    if (data.type === "offer") {
      console.log("📥 SDP offer received");

      await pc.setRemoteDescription(data);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.send(JSON.stringify(answer));
      console.log("📤 SDP answer sent");
    }

    else if (data.type === "ice") {
      await pc.addIceCandidate(data.candidate);
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(JSON.stringify({
        type: "ice",
        candidate: event.candidate
      }));
    }
  };
}
