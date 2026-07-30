// Local development server: serves the frontend from public/ and the API.
// In production on Vercel the static files and api/index.js are used instead.

const path = require('path');
const express = require('express');
const app = require('./src/app');

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`R.O.C.K.Y. running at http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

module.exports = app;
