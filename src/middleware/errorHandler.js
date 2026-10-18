// Centralized error handling middleware
// Prevents internal stack traces and details from leaking to clients

function errorHandler(err, req, res, next) {
  // Log error internally for operational debugging
  console.error('[Error]:', err.message || err);

  // If headers have already been sent, delegate to standard express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle JSON parsing errors from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON payload' });
  }

  // Handle specific known status errors
  const statusCode = err.statusCode || err.status || 500;

  if (statusCode === 500) {
    // Strictly sanitized 500 response
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(statusCode).json({ error: err.message || 'Request failed' });
}

module.exports = {
  errorHandler,
};
