import { registerAs } from '@nestjs/config';

export default registerAs('imagekitBlog', () => ({
  publicKey: process.env.IMAGEKIT_BLOG_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_BLOG_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_BLOG_URL_ENDPOINT,
}));
