const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 5e6  // 5MB — enough for ~10 seconds of speech
});

// Critical: correct MIME types so PWA installs properly
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

app.use(express.static(path.join(__dirname, 'public')));

// State
const riders = {};
let musicState = { videoId: null, listId: null, playing: false, timestamp: 0, syncedAt: Date.now() };
let destinationState = null;

const COLORS = [
  '#FF6B6B','#4ECDC4','#45B7D1','#96CEB4',
  '#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F',
  '#BB8FCE','#F0B27A','#82E0AA','#F1948A'
];
let colorIndex = 0;
function nextColor() { return COLORS[colorIndex++ % COLORS.length]; }
function getLeader() { return Object.values(riders).find(r => r.isLeader); }

io.on('connection', (socket) => {
  console.log('Rider connected:', socket.id);

  socket.on('join', ({ name }) => {
    const isFirstRider = Object.keys(riders).length === 0;
    riders[socket.id] = {
      id: socket.id, name: name || 'Rider',
      lat: null, lng: null, color: nextColor(), isLeader: isFirstRider
    };
    socket.emit('init', {
      you: socket.id,
      riders: Object.values(riders),
      musicState: {
        ...musicState,
        timestamp: musicState.playing
          ? musicState.timestamp + (Date.now() - musicState.syncedAt) / 1000
          : musicState.timestamp
      },
      destinationState
    });
    socket.broadcast.emit('rider_joined', riders[socket.id]);
    if (!getLeader()) {
      riders[socket.id].isLeader = true;
      io.emit('leader_changed', socket.id);
    }
    const positions = Object.values(riders)
      .filter(r => r.lat !== null && r.id !== socket.id)
      .map(r => ({ id: r.id, lat: r.lat, lng: r.lng }));
    if (positions.length > 0) socket.emit('bulk_locations', positions);
  });

  socket.on('location', ({ lat, lng }) => {
    if (!riders[socket.id]) return;
    riders[socket.id].lat = lat;
    riders[socket.id].lng = lng;
    io.emit('location_update', { id: socket.id, lat, lng });
  });

  // Music
  socket.on('music_load', ({ videoId, listId, timestamp }) => {
    if (!riders[socket.id]?.isLeader) return;
    musicState = { videoId: videoId||null, listId: listId||null, playing: false, timestamp: timestamp||0, syncedAt: Date.now() };
    io.emit('music_load', musicState);
  });
  socket.on('music_play', ({ timestamp, videoId }) => {
    if (!riders[socket.id]?.isLeader) return;
    musicState = { ...musicState, playing: true, timestamp, syncedAt: Date.now() };
    io.emit('music_play', { timestamp, videoId });
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
  socket.on('music_next', () => {
    if (!riders[socket.id]?.isLeader) return;
    io.emit('music_next', {});
  });
  socket.on('music_prev', () => {
    if (!riders[socket.id]?.isLeader) return;
    io.emit('music_prev', {});
  });

  // Push-to-talk
  socket.on('ptt_start', () => {
    if (!riders[socket.id]) return;
    socket.broadcast.emit('ptt_start', { id: socket.id, name: riders[socket.id].name, color: riders[socket.id].color });
  });
  socket.on('ptt_audio', ({ dataUrl }) => {
    // dataUrl is a base64 string — validate and relay
    if (!riders[socket.id] || typeof dataUrl !== 'string') return;
    socket.broadcast.emit('ptt_audio', { id: socket.id, dataUrl });
  });
  socket.on('ptt_stop', () => {
    if (!riders[socket.id]) return;
    socket.broadcast.emit('ptt_stop', { id: socket.id });
  });

  // Leader
  socket.on('pass_leader', ({ toId }) => {
    if (!riders[socket.id]?.isLeader || !riders[toId]) return;
    riders[socket.id].isLeader = false;
    riders[toId].isLeader = true;
    io.emit('leader_changed', toId);
  });

  // Destination
  socket.on('set_destination', ({ lat, lng, name }) => {
    if (!riders[socket.id]?.isLeader) return;
    destinationState = { lat, lng, name: name || `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
    io.emit('destination_set', destinationState);
  });
  socket.on('clear_destination', () => {
    if (!riders[socket.id]?.isLeader) return;
    destinationState = null;
    io.emit('destination_cleared');
  });

  // Ride control (leader only)
  socket.on('ride_start', () => {
    if (!riders[socket.id]?.isLeader) return;
    io.emit('ride_start', {});
  });
  socket.on('ride_stop', () => {
    if (!riders[socket.id]?.isLeader) return;
    io.emit('ride_stop', {});
  });

  socket.on('disconnect', () => {
    const wasLeader = riders[socket.id]?.isLeader;
    socket.broadcast.emit('ptt_stop', { id: socket.id }); // clean up if was talking
    delete riders[socket.id];
    io.emit('rider_left', socket.id);
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
server.listen(PORT, '0.0.0.0', () => console.log(`Ride app running on port ${PORT}`));