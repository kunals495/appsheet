const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: 'postgresql://postgres:Kun@lSingh989@db.oydxyuewvqplvzmswvzm.supabase.co:5432/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

// Initialize DB
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(500) NOT NULL DEFAULT 'Untitled Document',
        content TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_history (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(255) REFERENCES documents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        editor_name VARCHAR(255),
        saved_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed a default document if none exists
    const existing = await pool.query('SELECT id FROM documents LIMIT 1');
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO documents (id, title, content) VALUES ($1, $2, $3)`,
        ['default', 'Welcome to CollabEdit', 'Start typing here to collaborate in real-time with others. Anyone with this link can join and edit together!\n\nThis document auto-saves every few seconds. Your cursor is visible to other collaborators with your name on it.']
      );
    }

    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  }
}

initDB();

// In-memory active users per document
const activeUsers = {}; // docId -> { socketId -> { name, color, cursor } }

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#82E0AA', '#F0B27A',
];

function getColor(index) {
  return COLORS[index % COLORS.length];
}

// REST API
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/document/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      // Create new document
      const newDoc = await pool.query(
        `INSERT INTO documents (id, title, content) VALUES ($1, $2, $3) RETURNING *`,
        [id, 'Untitled Document', '']
      );
      return res.json(newDoc.rows[0]);
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/document/:id/save', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, title, editorName } = req.body;

    await pool.query(
      `UPDATE documents SET content = $1, title = $2, updated_at = NOW() WHERE id = $3`,
      [content, title, id]
    );

    // Save history
    await pool.query(
      `INSERT INTO document_history (document_id, content, editor_name) VALUES ($1, $2, $3)`,
      [id, content, editorName || 'Anonymous']
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/document/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, editor_name, saved_at, LEFT(content, 100) as preview 
       FROM document_history WHERE document_id = $1 ORDER BY saved_at DESC LIMIT 20`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.IO
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('join-document', ({ documentId, userName }) => {
    socket.join(documentId);
    socket.currentDoc = documentId;
    socket.userName = userName;

    if (!activeUsers[documentId]) activeUsers[documentId] = {};

    const userCount = Object.keys(activeUsers[documentId]).length;
    const color = getColor(userCount);

    activeUsers[documentId][socket.id] = {
      id: socket.id,
      name: userName,
      color,
      cursor: { line: 0, ch: 0 },
    };

    // Send current users to the new joiner
    socket.emit('active-users', Object.values(activeUsers[documentId]));

    // Notify others of new user
    socket.to(documentId).emit('user-joined', activeUsers[documentId][socket.id]);

    console.log(`${userName} joined doc: ${documentId}`);
  });

  socket.on('text-change', ({ documentId, delta, content }) => {
    socket.to(documentId).emit('text-change', {
      delta,
      content,
      userId: socket.id,
      userName: socket.userName,
    });
  });

  socket.on('cursor-move', ({ documentId, cursor }) => {
    if (activeUsers[documentId] && activeUsers[documentId][socket.id]) {
      activeUsers[documentId][socket.id].cursor = cursor;
      socket.to(documentId).emit('cursor-move', {
        userId: socket.id,
        userName: socket.userName,
        color: activeUsers[documentId][socket.id].color,
        cursor,
      });
    }
  });

  socket.on('selection-change', ({ documentId, selection }) => {
    socket.to(documentId).emit('selection-change', {
      userId: socket.id,
      userName: socket.userName,
      color: activeUsers[documentId]?.[socket.id]?.color,
      selection,
    });
  });

  socket.on('title-change', ({ documentId, title }) => {
    socket.to(documentId).emit('title-change', { title, userName: socket.userName });
  });

  socket.on('disconnect', () => {
    const docId = socket.currentDoc;
    if (docId && activeUsers[docId]) {
      delete activeUsers[docId][socket.id];
      io.to(docId).emit('user-left', { userId: socket.id, name: socket.userName });
      if (Object.keys(activeUsers[docId]).length === 0) {
        delete activeUsers[docId];
      }
    }
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
