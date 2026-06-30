import * as Joi from 'joi';

// =============================================================================
// Environment Variable Validation Schema
// =============================================================================
// Uses Joi to validate all required environment variables at application
// startup. The app will throw immediately if any required variable is missing
// or invalid, preventing silent misconfiguration bugs.
// =============================================================================

export const envValidationSchema = Joi.object({
  // ---------------------------------------------------------------------------
  // App
  // ---------------------------------------------------------------------------
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().default(3000),

  // ---------------------------------------------------------------------------
  // Database — Prisma requires a single connection string (DSN)
  // ---------------------------------------------------------------------------
  // Individual DB_* vars are kept for human readability / documentation but
  // Prisma itself only uses DATABASE_URL.
  // ---------------------------------------------------------------------------
  DATABASE_URL: Joi.string().uri().required(),

  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),

  // ---------------------------------------------------------------------------
  // WhatsApp Cloud API
  // ---------------------------------------------------------------------------
  WHATSAPP_VERIFY_TOKEN: Joi.string().required(),
  WHATSAPP_ACCESS_TOKEN: Joi.string().required(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().required(),

  // ---------------------------------------------------------------------------
  // Worker Service
  // ---------------------------------------------------------------------------
  WORKER_SERVICE_URL: Joi.string().uri().required(),
  WORKER_TIMEOUT_MS: Joi.number().default(5000),
  WORKER_MAX_RETRIES: Joi.number().default(3),

  // ---------------------------------------------------------------------------
  // Application URL — base untuk static assets (uploads)
  // ---------------------------------------------------------------------------
  APP_URL: Joi.string().uri().default('http://localhost:3000'),

  // ---------------------------------------------------------------------------
  // Temporary Uploads
  // ---------------------------------------------------------------------------
  TEMP_UPLOAD_DIR: Joi.string().default('temp/uploads'),
});

// =============================================================================
// validateEnv
// =============================================================================
// Factory function passed to ConfigModule.forRoot({ validate }) in AppModule.
// NestJS calls this during module initialization.
// =============================================================================
export function validateEnv(config: Record<string, any>) {
  const { error, value } = envValidationSchema.validate(config, {
    allowUnknown: true, // Allow OS/CI env vars not in our schema
    abortEarly: false, // Report ALL validation errors at once
  });

  if (error) {
    throw new Error(
      `[Config] Environment variable validation failed:\n${error.message}`,
    );
  }

  return value;
}
