import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name];
}

/**
 * Server configuration. Values that gate live integrations (Supabase, n8n,
 * Gemma, Buffer) are optional at boot so the skeleton can start before
 * credentials exist; each integration checks its own value before use.
 */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 3000),
  appBaseUrl: optional("APP_BASE_URL") ?? "http://localhost:5173",
  apiBaseUrl: optional("API_BASE_URL") ?? "http://localhost:3000",

  supabase: {
    url: optional("SUPABASE_URL"),
    // New key names (sb_publishable_*/sb_secret_*) replace anon/service_role
    // (legacy names deprecated end of 2026). Legacy names accepted as fallback.
    publishableKey:
      optional("SUPABASE_PUBLISHABLE_KEY") ?? optional("SUPABASE_ANON_KEY"),
    secretKey:
      optional("SUPABASE_SECRET_KEY") ?? optional("SUPABASE_SERVICE_ROLE_KEY"),
    mediaBucket: optional("SUPABASE_MEDIA_BUCKET") ?? "shareable-assets",
  },

  ownerUserId: optional("OWNER_USER_ID"),

  n8n: {
    baseUrl: optional("N8N_BASE_URL") ?? "http://localhost:5678",
    generationWebhookUrl: optional("N8N_GENERATION_WEBHOOK_URL"),
    distributionWebhookUrl: optional("N8N_DISTRIBUTION_WEBHOOK_URL"),
    webhookSecret: optional("N8N_WEBHOOK_SECRET"),
    callbackBaseUrl: optional("N8N_CALLBACK_BASE_URL") ?? "http://host.docker.internal:3000",
    callbackSecret: optional("N8N_CALLBACK_SECRET"),
  },

  gemma: {
    apiKey: optional("GEMMA_API_KEY"),
    model: optional("GEMMA_MODEL") ?? "gemma-4-26b-a4b-it",
  },

  buffer: {
    apiKey: optional("BUFFER_API_KEY"),
    organizationId: optional("BUFFER_ORGANIZATION_ID"),
    channels: {
      instagram: optional("BUFFER_INSTAGRAM_CHANNEL_ID"),
      facebook: optional("BUFFER_FACEBOOK_CHANNEL_ID"),
      x: optional("BUFFER_X_CHANNEL_ID"),
    },
  },

  defaultTimezone: optional("DEFAULT_TIMEZONE") ?? "Asia/Karachi",

  // Reserved for later phases (e.g. webhook signature verification schemes).
  requireEnv: required,
};
