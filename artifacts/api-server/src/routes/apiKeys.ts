import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, apiKeysTable } from "@workspace/db";
import {
  CreateApiKeyBody,
  DeleteApiKeyParams,
  ValidateApiKeyBody,
} from "@workspace/api-zod";
import { requireAuth, getUserId } from "../lib/auth";
import { validateApiKey, type LLMProvider } from "../lib/llm";
import { encrypt } from "../lib/encryption";

const router: IRouter = Router();

// List API keys — never return encryptedKey
router.get("/api-keys", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const keys = await db
    .select({
      id: apiKeysTable.id,
      userId: apiKeysTable.userId,
      provider: apiKeysTable.provider,
      name: apiKeysTable.name,
      keyPreview: apiKeysTable.keyPreview,
      isActive: apiKeysTable.isActive,
      createdAt: apiKeysTable.createdAt,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, userId));

  res.json(keys);
});

// Save API key — encrypt before storing
router.post("/api-keys", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = CreateApiKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { provider, name, key } = parsed.data;
  const keyPreview = key.slice(-4);
  const encryptedKey = encrypt(key);

  const [saved] = await db
    .insert(apiKeysTable)
    .values({
      userId,
      provider,
      name,
      encryptedKey,
      keyPreview,
      isActive: true,
    })
    .returning({
      id: apiKeysTable.id,
      userId: apiKeysTable.userId,
      provider: apiKeysTable.provider,
      name: apiKeysTable.name,
      keyPreview: apiKeysTable.keyPreview,
      isActive: apiKeysTable.isActive,
      createdAt: apiKeysTable.createdAt,
    });

  res.status(201).json(saved);
});

// Delete API key
router.delete("/api-keys/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = DeleteApiKeyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(apiKeysTable)
    .where(and(eq(apiKeysTable.id, params.data.id), eq(apiKeysTable.userId, userId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "API key not found" });
    return;
  }

  res.sendStatus(204);
});

// Validate API key — test key against provider before saving
router.post("/api-keys/validate", requireAuth, async (req, res): Promise<void> => {
  const parsed = ValidateApiKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { provider, key } = parsed.data;

  try {
    const valid = await validateApiKey(provider as LLMProvider, key);
    res.json({
      valid,
      message: valid
        ? "API key is valid"
        : "API key validation failed. Check that the key is correct and has the required permissions.",
    });
  } catch {
    res.json({
      valid: false,
      message: "Could not validate key. Check your network connection.",
    });
  }
});

export default router;
