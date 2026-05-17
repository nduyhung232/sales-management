const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'locales');
const locales = {};

// Load all locale files
fs.readdirSync(localesDir).forEach(file => {
  if (file.endsWith('.json')) {
    const lang = file.replace('.json', '');
    locales[lang] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
  }
});

const DEFAULT_LANG = 'vi';

function i18nMiddleware(req, res, next) {
  // Priority: query param > session > default
  if (req.query.lang && locales[req.query.lang]) {
    req.session.lang = req.query.lang;
  }

  const lang = req.session.lang || DEFAULT_LANG;
  const translations = locales[lang] || locales[DEFAULT_LANG];

  // Translation function
  res.locals.t = (key) => translations[key] || key;
  res.locals.lang = lang;
  res.locals.availableLangs = Object.keys(locales);

  next();
}

module.exports = i18nMiddleware;
