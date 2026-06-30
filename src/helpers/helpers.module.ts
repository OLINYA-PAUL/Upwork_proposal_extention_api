import { Global, Module } from '@nestjs/common';
import { ImageKitHelper } from './imagekit.helper';
import { ImageKitBlogHelper } from './imagekit-blog.helper';
import { FingerprintHelper } from './fingerprint.helper';
import { StatsCacheHelper } from './stats-cache.helper';

@Global()
@Module({
  providers: [
    ImageKitHelper,
    ImageKitBlogHelper,
    FingerprintHelper,
    StatsCacheHelper,
  ],
  exports: [
    ImageKitHelper,
    ImageKitBlogHelper,
    FingerprintHelper,
    StatsCacheHelper,
  ],
})
export class HelpersModule {}
