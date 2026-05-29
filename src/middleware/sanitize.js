function sanitizeInput(req, res, next) {
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || !obj) return obj;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .trim();
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
    return obj;
  };
  if (req.body)  sanitize(req.body);
  if (req.query) sanitize(req.query);
  next();
}

module.exports = sanitizeInput;
