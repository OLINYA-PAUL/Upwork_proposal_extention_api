import { registerAs } from '@nestjs/config';

export default registerAs('openai', () => ({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-5',
  timeout: 10000, // 10 seconds
  maxRetries: 3,
}));
