const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e6
});

const MAX_PLAYERS = 5;
const players = {};

const COLORS = [0x2f6fdd, 0xe74c3c, 0x2ecc71, 0xf5b942, 0x9b59b6];
const NAMES = ['כחול', 'אדום', 'ירוק', 'כתום', 'סגול'];

function pickFreeSlot() {
  const used = new Set(Object.values(players).map(p => p.slot));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
  return -1;
}

io.on('connection', (socket) => {
  const slot = pickFreeSlot();
  if (slot === -1) {
    socket.emit('serverFull');
    socket.disconnect(true);
    return;
  }

  players[socket.id] = {
    id: socket.id,
    x: -420, y: 0, z: -160, ry: 0,
    region: -1,
    slot,
    name: NAMES[slot],
    color: COLORS[slot],
    lastUpdate: Date.now()
  };

  console.log('[+] ' + players[socket.id].name + ' (' + socket.id + ')');

  socket.emit('init', {
    selfId: socket.id,
    selfSlot: slot,
    players: players
  });

  socket.broadcast.emit('playerJoined', players[socket.id]);

  socket.on('move', (data) => {
    const p = players[socket.id];
    if (!p) return;
    p.x = data.x; p.y = data.y; p.z = data.z;
    p.ry = data.ry; p.region = data.region ?? -1;
    p.anim = data.anim || 0;
    p.lastUpdate = Date.now();
    socket.broadcast.emit('playerMoved', {
      id: socket.id, x: p.x, y: p.y, z: p.z,
      ry: p.ry, region: p.region, anim: p.anim
    });
  });

  socket.on('chat', (text) => {
    const p = players[socket.id];
    if (!p || !text) return;
    text = String(text).slice(0, 120);
    io.emit('chat', { id: socket.id, name: p.name, text, t: Date.now() });
  });

  socket.on('regionChange', (region) => {
    const p = players[socket.id];
    if (!p) return;
    p.region = region;
    socket.broadcast.emit('playerRegion', { id: socket.id, region });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

setInterval(() => {
  const now = Date.now();
  Object.keys(players).forEach(id => {
    if (now - players[id].lastUpdate > 60000) {
      delete players[id];
      io.emit('playerLeft', id);
    }
  });
}, 30000);

app.get('/', (req, res) => res.send('MP server OK'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server on ' + PORT));
