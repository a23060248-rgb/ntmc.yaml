function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.status || 500;
  const body = {
    error: {
      message: status === 500 ? "Internal server error" : error.message
    }
  };

  if (error.details) {
    body.error.details = error.details;
  }

  if (process.env.NODE_ENV !== "production" && status === 500) {
    body.error.debug = error.message;
  }

  return res.status(status).json(body);
}

module.exports = {
  asyncHandler,
  httpError,
  errorHandler
};
