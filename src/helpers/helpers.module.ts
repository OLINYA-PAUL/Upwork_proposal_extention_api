import { Global, Module } from '@nestjs/common';
import { ImageKitHelper } from './imagekit.helper';
import { FingerprintHelper } from './fingerprint.helper';

@Global()
@Module({
  providers: [ImageKitHelper, FingerprintHelper],
  exports: [ImageKitHelper, FingerprintHelper],
})
export class HelpersModule {}
