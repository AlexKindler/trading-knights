// Vercel Serverless Function wrapper for Express app
const path = require('path');
const app = require(path.join(__dirname, '..', 'dist', 'index.cjs'));

module.exports = app.default || app;
