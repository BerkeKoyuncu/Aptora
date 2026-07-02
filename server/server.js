const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors());

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', routes);

// Serve static client assets in production
const clientBuildPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuildPath));

// Fallback index.html route for client-side routing in production SPA
app.get('*', (req, res, next) => {
  // If request is for /api, skip to error/not found
  if (req.url.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) {
      // If client build isn't compiled yet, return a simple welcoming API message
      res.status(200).send('Aptora Backend is Running. Frontend not yet compiled.');
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Express Error Boundary:', err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start database and server
const startServer = async () => {
  try {
    console.log('Initializing SQLite Database...');
    await initDb();
    console.log('Database initialized successfully.');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`===============================================`);
      console.log(` Aptora testing application is now listening! `);
      console.log(` Port:    ${PORT}                               `);
      console.log(` Mode:    Production/Development               `);
      console.log(` Network: http://localhost:${PORT}             `);
      console.log(`===============================================`);
    });
  } catch (error) {
    console.error('Failed to initialize database or start server:', error);
    process.exit(1);
  }
};

startServer();
