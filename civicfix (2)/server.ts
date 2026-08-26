import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import complaintsRouter from './routes/complaints.js';
import { getDb } from './db/database.js';

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Serve static assets
app.use('/css', express.static(path.join(process.cwd(), 'css')));
app.use('/js', express.static(path.join(process.cwd(), 'js')));
app.use('/pages', express.static(path.join(process.cwd(), 'pages')));
app.use(express.static(process.cwd()));

// API Routes
app.use('/api', complaintsRouter);

// Convenient Page Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html'));
});

app.get('/report', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'pages', 'report.html'));
});

app.get('/track', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'pages', 'track.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'pages', 'login.html'));
});

app.get('/authority-dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'pages', 'authority-dashboard.html'));
});

app.get('/about', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'pages', 'about.html'));
});

app.get('/how-it-works', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'pages', 'how-it-works.html'));
});

// Fallback for SPA/direct navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(process.cwd(), 'index.html'));
  } else {
    next();
  }
});

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Initialize database and start server
getDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏛️ CivicFix Server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize SQLite database:', err);
  process.exit(1);
});
