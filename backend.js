const express = require('express')
const app = express()

// socket.io setup
const http = require('http')
const server = http.createServer(app)
const { Server } = require('socket.io')
const io = new Server(server, { pingInterval: 2000, pingTimeout: 5000 })

const port = 3000

app.use(express.static('public'))

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html')
})

const backEndPlayers = {}
const backEndProjectiles = {}

const SPEED = 1
const RADIUS = 10
const PROJECTILE_RADIUS = 5
let projectileId = 0
const pillars = [
  { x: 200, y: 50, width: 100, height: 100 },
  { x: 800, y: 50, width: 100, height: 100 },
  { x: 200, y: 350, width: 100, height: 100 },
  { x: 800, y: 350, width: 100, height: 100 }
];

io.on('connection', (socket) => {
  console.log('a user connected')

  io.emit('updatePlayers', backEndPlayers)

  socket.on('shoot', ({ x, y, angle }) => {
    projectileId++

    const velocity = {
      x: Math.cos(angle) * 5,
      y: Math.sin(angle) * 5
    }

    backEndProjectiles[projectileId] = {
      x,
      y,
      velocity,
      playerId: socket.id
    }

    console.log(backEndProjectiles)
  })

  socket.on('initGame', ({ username, width, height }) => {
    backEndPlayers[socket.id] = {
      x: 1024 * Math.random(),
      y: 576 * Math.random(),
      color: `hsl(${360 * Math.random()}, 100%, 50%)`,
      sequenceNumber: 0,
      score: 0,
      username
    }

    // where we init our canvas
    backEndPlayers[socket.id].canvas = {
      width,
      height
    }

    backEndPlayers[socket.id].radius = RADIUS
  })

  socket.on('disconnect', (reason) => {
    console.log(reason)
    delete backEndPlayers[socket.id]
    io.emit('updatePlayers', backEndPlayers)
  })

  socket.on('keydown', ({ keycode, sequenceNumber }) => {
    const backEndPlayer = backEndPlayers[socket.id]

    if (!backEndPlayers[socket.id]) return

    backEndPlayers[socket.id].sequenceNumber = sequenceNumber
    switch (keycode) {
      case 'KeyW':
        backEndPlayers[socket.id].y -= SPEED
        break

      case 'KeyA':
        backEndPlayers[socket.id].x -= SPEED
        break

      case 'KeyS':
        backEndPlayers[socket.id].y += SPEED
        break

      case 'KeyD':
        backEndPlayers[socket.id].x += SPEED
        break
    }



    const playerSides = {
      left: backEndPlayer.x - backEndPlayer.radius,
      right: backEndPlayer.x + backEndPlayer.radius,
      top: backEndPlayer.y - backEndPlayer.radius,
      bottom: backEndPlayer.y + backEndPlayer.radius
    }


    if (playerSides.left < 0) backEndPlayers[socket.id].x = backEndPlayer.radius

    if (playerSides.right > 1024)
      backEndPlayers[socket.id].x = 1024 - backEndPlayer.radius

    if (playerSides.top < 0) backEndPlayers[socket.id].y = backEndPlayer.radius

    if (playerSides.bottom > 576)
      backEndPlayers[socket.id].y = 576 - backEndPlayer.radius


    // Pillar collision
pillars.forEach(pillar => {
  if (
    playerSides.right > pillar.x &&
    playerSides.left < pillar.x + pillar.width &&
    playerSides.bottom > pillar.y &&
    playerSides.top < pillar.y + pillar.height
  ) {
    // Collision detected, now we need to resolve it
    const dx = backEndPlayer.x - (pillar.x + pillar.width / 2);
    const dy = backEndPlayer.y - (pillar.y + pillar.height / 2);
    const widthHalf = (pillar.width + backEndPlayer.radius) / 2;
    const heightHalf = (pillar.height + backEndPlayer.radius) / 2;
    const crossWidth = widthHalf * dy;
    const crossHeight = heightHalf * dx;

    if (Math.abs(dx) <= widthHalf && Math.abs(dy) <= heightHalf) {
      if (crossWidth > crossHeight) {
        backEndPlayer.y = crossWidth > -crossHeight ? pillar.y + pillar.height + backEndPlayer.radius : pillar.y - backEndPlayer.radius;
      } else {
        backEndPlayer.x = crossWidth > -crossHeight ? pillar.x - backEndPlayer.radius : pillar.x + pillar.width + backEndPlayer.radius;
      }
    }
  }
});
  })
})

// backend ticker
setInterval(() => {
  // update projectile positions
  for (const id in backEndProjectiles) {
    backEndProjectiles[id].x += backEndProjectiles[id].velocity.x
    backEndProjectiles[id].y += backEndProjectiles[id].velocity.y

    const PROJECTILE_RADIUS = 5
    if (
      backEndProjectiles[id].x - PROJECTILE_RADIUS >=
      backEndPlayers[backEndProjectiles[id].playerId]?.canvas?.width ||
      backEndProjectiles[id].x + PROJECTILE_RADIUS <= 0 ||
      backEndProjectiles[id].y - PROJECTILE_RADIUS >=
      backEndPlayers[backEndProjectiles[id].playerId]?.canvas?.height ||
      backEndProjectiles[id].y + PROJECTILE_RADIUS <= 0
    ) {
      delete backEndProjectiles[id]
      continue
    }

    // Check for collision with pillars
    for (const pillar of pillars) {
      const dx = backEndProjectiles[id].x - (pillar.x + pillar.width / 2);
      const dy = backEndProjectiles[id].y - (pillar.y + pillar.height / 2);
      const widthHalf = (pillar.width + PROJECTILE_RADIUS) / 2;
      const heightHalf = (pillar.height + PROJECTILE_RADIUS) / 2;

      if (Math.abs(dx) <= widthHalf && Math.abs(dy) <= heightHalf) {
        delete backEndProjectiles[id]
        break
      }
    }

    // If the projectile has been deleted, skip the rest of the loop
    if (!backEndProjectiles[id]) continue;

    // Check for collision with players
    for (const playerId in backEndPlayers) {
      const backEndPlayer = backEndPlayers[playerId]

      const DISTANCE = Math.hypot(
        backEndProjectiles[id].x - backEndPlayer.x,
        backEndProjectiles[id].y - backEndPlayer.y
      )

      // collision detection
      if (
        DISTANCE < PROJECTILE_RADIUS + backEndPlayer.radius &&
        backEndProjectiles[id].playerId !== playerId
      ) {
        if (backEndPlayers[backEndProjectiles[id].playerId])
          backEndPlayers[backEndProjectiles[id].playerId].score++

        console.log(backEndPlayers[backEndProjectiles[id].playerId])
        delete backEndProjectiles[id]
        delete backEndPlayers[playerId]
        break
      }
    }
  }

  io.emit('updateProjectiles', backEndProjectiles)
  io.emit('updatePlayers', backEndPlayers)
}, 15)

server.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

console.log('server did load')
