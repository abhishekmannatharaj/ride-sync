const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// State
const riders = {}; // { socketId: { id, name, lat, lng, color, isLeader } }
let musicState = {
  videoId: null,
  playing: false,
  timestamp: 0,
  syncedAt: Date.now()
};

const COLORS = [
  '#FF6B6B','#4ECDC4','#45B7D1','#96CEB4',
  '#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F',
  '#BB8FCE','#F0B27A','#82E0AA','#F1948A'
];

let colorIndex = 0;
function nextColor() {
  return COLORS[colorIndex++ % COLORS.length];
}

function getLeader() {
  return Object.values(riders).find(r => r.isLeader);
}

io.on('connection', (socket) => {
  console.log('Rider connected:', socket.id);

  // New rider joins
  socket.on('join', ({ name }) => {
    const isFirstRider = Object.keys(riders).length === 0;
    riders[socket.id] = {
      id: socket.id,
      name: name || 'Rider',
      lat: null,
      lng: null,
      color: nextColor(),
      isLeader: isFirstRider
    };

    // Send current state to new rider
    socket.emit('init', {
      you: socket.id,
      riders: Object.values(riders),
      musicState: {
        ...musicState,
        // Adjust timestamp for time elapsed since sync
        timestamp: musicState.playing
          ? musicState.timestamp + (Date.now() - musicState.syncedAt) / 1000
          : musicState.timestamp
      }
    });

    // Tell everyone else about new rider
    socket.broadcast.emit('rider_joined', riders[socket.id]);

    // If no leader exists and this is a new rider, assign them
    if (!getLeader()) {
      riders[socket.id].isLeader = true;
      io.emit('leader_changed', socket.id);
    }
  });

  // Location update
  socket.on('location', ({ lat, lng }) => {
    if (!riders[socket.id]) return;
    riders[socket.id].lat = lat;
    riders[socket.id].lng = lng;
    io.emit('location_update', { id: socket.id, lat, lng });
  });

  // Music control (leader only)
  socket.on('music_load', ({ videoId }) => {
    if (!riders[socket.id]?.isLeader) return;
    musicState = { videoId, playing: false, timestamp: 0, syncedAt: Date.now() };
    io.emit('music_load', { videoId });
  });

  socket.on('music_play', ({ timestamp }) => {
    if (!riders[socket.id]?.isLeader) return;
    musicState = { ...musicState, playing: true, timestamp, syncedAt: Date.now() };
    io.emit('music_play', { timestamp });
  });

  socket.on('music_pause', ({ timestamp }) => {
    if (!riders[socket.id]?.isLeader) return;
    musicState = { ...musicState, playing: false, timestamp, syncedAt: Date.now() };
    io.emit('music_pause', { timestamp });
  });

  socket.on('music_seek', ({ timestamp }) => {
    if (!riders[socket.id]?.isLeader) return;
    musicState = { ...musicState, timestamp, syncedAt: Date.now() };
    io.emit('music_seek', { timestamp });
  });

  // Pass leader role
  socket.on('pass_leader', ({ toId }) => {
    if (!riders[socket.id]?.isLeader) return;
    if (!riders[toId]) return;
    riders[socket.id].isLeader = false;
    riders[toId].isLeader = true;
    io.emit('leader_changed', toId);
  });

  // Disconnect
  socket.on('disconnect', () => {
    const wasLeader = riders[socket.id]?.isLeader;
    delete riders[socket.id];
    io.emit('rider_left', socket.id);

    // Assign leader to next available rider
    if (wasLeader) {
      const remaining = Object.values(riders);
      if (remaining.length > 0) {
        remaining[0].isLeader = true;
        io.emit('leader_changed', remaining[0].id);
      }
    }

    console.log('Rider disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Ride app running on http://localhost:${PORT}`);
});
