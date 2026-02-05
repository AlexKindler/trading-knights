// Vercel Serverless Function wrapper for Express app
let app;

try {
  const path = require('path');
  const distPath = path.join(__dirname, '..', 'dist', 'index.cjs');
  console.log('Loading app from:', distPath);
  const loaded = require(distPath);
  app = loaded.default || loaded;
  console.log('App loaded successfully, type:', typeof app);
} catch (error) {
  console.error('Failed to load app:', error.message);
  console.error('Stack:', error.stack);
  // Return a basic error handler
  app = (req, res) => {
    res.status(500).json({ error: 'Failed to load application', details: error.message });
  };
}

module.exports = app;
