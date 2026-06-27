import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),
  WHATSAPP_VERIFY_TOKEN: Joi.string().required(),
  WHATSAPP_ACCESS_TOKEN: Joi.string().required(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().required(),
  WORKER_SERVICE_URL: Joi.string().uri().required(),
});

export function validateEnv(config: Record<string, any>) {
  const { error, value } = envValidationSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
  });
  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }
  return value;
}
