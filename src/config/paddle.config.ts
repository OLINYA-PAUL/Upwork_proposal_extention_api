import { registerAs } from '@nestjs/config';

export default registerAs('paddle', () => ({
  apiKey: process.env.PADDLE_API_KEY,
  webhookSecret: process.env.PADDLE_WEBHOOK_SECRET,
  starterPriceId: process.env.PADDLE_STARTER_PRICE_ID,
  proPriceId: process.env.PADDLE_PRO_PRICE_ID,
}));
