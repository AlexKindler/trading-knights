// Vercel Serverless Function wrapper for Express app
const app = require('../dist/index.cjs');

module.exports = app.default || app;
