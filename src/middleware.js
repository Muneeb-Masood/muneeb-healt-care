export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFound(req, res) {
  res.status(404).json({
    data: null,
    error: {
      code: "NOT_FOUND",
      message: "Route not found"
    }
  });
}

export function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.code === "23505") {
    return res.status(422).json({
      data: null,
      error: {
        code: "DUPLICATE",
        message: "A patient with this information already exists"
      }
    });
  }

  res.status(500).json({
    data: null,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected server error occurred"
    }
  });
}