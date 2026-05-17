require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'sales-app-secret-key',
  resave: false,
  saveUninitialized: false,
}));

// i18n middleware
const i18n = require('./middleware/i18n');
app.use(i18n);

// Auth middleware
function auth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Make user available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.use('/', require('./routes/auth'));
app.use('/products', auth, require('./routes/products'));
app.use('/categories', auth, require('./routes/categories'));
app.use('/sales', auth, require('./routes/sales'));
app.use('/imports', auth, require('./routes/imports'));
app.use('/reports', auth, require('./routes/reports'));
app.use('/profile', auth, require('./routes/profile'));

app.get('/', auth, (req, res) => res.redirect('/products'));

// Initialize database then start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Sales Management running at http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
