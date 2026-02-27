console.log("🔥 main.js loaded");
const signalingUrl = "wss://shmeg1repo.onrender.com";

let socket;
let pc;
let localStream;
let isMuted = true;

const button = document.getElementById("toggleBtn");

button.onclick = async () => {
  if (!pc) await startWebRTC();

  isMuted = !isMuted;
  localStream.getAudioTracks()[0].enabled = !isMuted;
  button.textContent = isMuted ? "Unmute" : "Mute";
};

async function startWebRTC() {
  // 1) mic from browser
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream.getAudioTracks()[0].enabled = false;

  // 2) PeerConnection (FORCE TURN)
  pc = new RTCPeerConnection({
    iceTransportPolicy: "relay", // forces relay candidates only
    iceServers: [
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
  });

  pc.onconnectionstatechange = () => {
    console.log("Connection state:", pc.connectionState);
  };

  // 3) play audio from Pi
  pc.ontrack = (event) => {
    console.log("🎵 Audio received from Pi");

    const audio = document.createElement("audio");
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
    audio.controls = true;
    audio.muted = false;
    audio.volume = 1.0;

    document.body.appendChild(audio);
    audio.play().catch((e) => console.log("Playback error:", e));
  };

  // 4) send browser mic to Pi
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  // 5) signaling socket
  socket = new WebSocket(signalingUrl);

  socket.onopen = () => {
    console.log("✅ WebSocket connected");
  };

  socket.onmessage = async (msg) => {
    let text = msg.data instanceof Blob ? await msg.data.text() : msg.data;
    const data = JSON.parse(text);

    if (data.type === "offer") {
      console.log("📥 SDP offer received");
      await pc.setRemoteDescription(data);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.send(JSON.stringify(answer));
      console.log("📤 SDP answer sent");
    } else if (data.type === "ice") {
      await pc.addIceCandidate(data.candidate);
    }
  };

  // 6) send ICE candidates to Pi (must be INSIDE startWebRTC)
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("LOCAL ICE:", event.candidate.candidate);

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ice", candidate: event.candidate }));
      }
    } else {
      console.log("ICE gathering complete");
    }
  };
}
