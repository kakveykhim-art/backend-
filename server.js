require('dotenv').config();
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
app.use(cors());

// SELECT-only guard: reject everything except GET / HEAD / OPTIONS
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  res.set('Allow', 'GET, HEAD, OPTIONS');
  res.status(405).json({ error: 'Method not allowed. This API is read-only.' });
});

app.get('/', (req, res) => res.json({ message: 'School API (read-only) is running', docs: '/api' }));
app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
