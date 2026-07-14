import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabaseKey = supabaseServiceKey || supabaseAnonKey;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_PUBLISHABLE_KEY) must be set.",
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Express middleware that verifies the Supabase access token from the
 * Authorization header and attaches the user ID to the request.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  supabase.auth
    .getUser(token)
    .then(({ data, error }) => {
      if (error || !data.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      (req as Request & { userId: string }).userId = data.user.id;
      next();
    })
    .catch(() => {
      res.status(401).json({ error: "Unauthorized" });
    });
}

export function getUserId(req: Request): string {
  return (req as Request & { userId: string }).userId;
}
