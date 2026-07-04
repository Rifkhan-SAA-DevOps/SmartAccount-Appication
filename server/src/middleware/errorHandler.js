export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(error, req, res, next) {
  console.error(error);

  if (error?.name === 'ZodError') {
    return res.status(400).json({
      message: 'Validation failed',
      errors: error.errors
    });
  }

  if (error?.code === 'P2002') {
    return res.status(409).json({ message: 'Duplicate value already exists', target: error.meta?.target });
  }

  const status = error.status || 500;
  res.status(status).json({
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {})
  });
}
