export class ApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'ต้องเข้าสู่ระบบก่อน') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'ไม่มีสิทธิ์ใช้งานส่วนนี้') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'ไม่พบข้อมูล') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message, details) {
    return new ApiError(409, 'CONFLICT', message, details);
  }
  static validation(message, details) {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }
}

/** ห่อ async handler ให้ error ถูกส่งเข้า error middleware */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
