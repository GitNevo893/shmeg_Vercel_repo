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

  socket.onmessage = async (msg) => {
    const data = JSON.parse(msg.data);

    if (data.type === "answer") {
      await pc.setRemoteDescription(data);
    }
  };

  // 6. create and send offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.onopen = () => {
    socket.send(JSON.stringify(offer));
  };
}
