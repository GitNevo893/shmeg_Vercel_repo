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
  // 1. get microphone
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // start muted
  localStream.getAudioTracks()[0].enabled = false;

  // 2. create peer connection
  pc = new RTCPeerConnection();

  pc.ondatachannel = (event) => {
  const channel = event.channel;

  channel.onopen = () => {
    console.log("DataChannel open!");
    channel.send("Hello from browser");
  };

  channel.onmessage = (event) => {
    console.log("Received from Pi:", event.data);
  };
};

  // 3. send mic audio
  localStream.getTracks().forEach(track =>
    pc.addTrack(track, localStream)
  );

  // 4. receive audio (speaker)
  pc.ontrack = (event) => {
    const audio = document.createElement("audio");
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
  };

 // 5. signaling
socket = new WebSocket(signalingUrl);

socket.onopen = () => {
  console.log("✅ WebSocket connected");
};
  
socket.onmessage = async (msg) => {
  const data = JSON.parse(msg.data);

  if (data.type === "offer") {
    console.log("📩 SDP offer received from Pi");

    await pc.setRemoteDescription(data);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.send(JSON.stringify(answer));
    console.log("📤 SDP answer sent to Pi");
  }
};


}
