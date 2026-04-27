const express   = require('express');
const http      = require('http');
const { Server} = require('socket.io');
const session   = require('express-session');
const path      = require('path');
const { initDB } = require('./db');

const authRoutes = require('./routes/auth');
const apiRoutes  = require('./routes/api');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

initDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'teamsync-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, _res, next) => { req.io = io; next(); });

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 TeamSync is running at http://localhost:${PORT}`);
  console.log('   Login with: username = <firstname in lowercase>  |  password = password123');
  console.log('   Example: username: faizan  |  password: password123\n');
});
