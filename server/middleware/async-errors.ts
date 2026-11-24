import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Express 4 does not catch rejected promises returned from async route handlers or middleware.
// Wrapping Layer.prototype.handle_request forwards any async rejection to next(err) automatically.
const Layer = require('express/lib/router/layer') as {
  prototype: {
    handle_request: (req: any, res: any, next: (err?: unknown) => void) => unknown;
    handle_error: (err: unknown, req: any, res: any, next: (err?: unknown) => void) => unknown;
  };
};

const PATCH_FLAG = Symbol.for('tradederiv.express_async_errors_patched');

if (!(Layer.prototype as any)[PATCH_FLAG]) {
  (Layer.prototype as any)[PATCH_FLAG] = true;

  Layer.prototype.handle_request = function handleAsyncRequest(req: any, res: any, next: (err?: unknown) => void) {
    const fn = (this as any).handle;
    if (typeof fn !== 'function' || fn.length > 3) {
      return next();
    }
    try {
      const ret = fn(req, res, next);
      if (ret && typeof (ret as Promise<unknown>).then === 'function') {
        (ret as Promise<unknown>).catch((err) => next(err));
      }
      return ret;
    } catch (err) {
      return next(err);
    }
  };

  Layer.prototype.handle_error = function handleAsyncError(err: unknown, req: any, res: any, next: (err?: unknown) => void) {
    const fn = (this as any).handle;
    if (typeof fn !== 'function' || fn.length !== 4) {
      return next(err);
    }
    try {
      const ret = fn(err, req, res, next);
      if (ret && typeof (ret as Promise<unknown>).then === 'function') {
        (ret as Promise<unknown>).catch((nextErr) => next(nextErr));
      }
      return ret;
    } catch (nextErr) {
      return next(nextErr);
    }
  };
}
