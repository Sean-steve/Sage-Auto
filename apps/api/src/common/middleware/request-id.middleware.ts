import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export interface RequestWithId extends Request {
  id?: string;
}

export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction) {
  const headerId = req.headers["x-request-id"] as string;
  const requestId = headerId || `req_${crypto.randomBytes(8).toString("hex")}`;
  req.id = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
