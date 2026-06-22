import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ImageKit from 'imagekit';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

@Injectable()
export class ImageKitHelper {
  private readonly logger = new Logger(ImageKitHelper.name);
  private readonly imagekit: ImageKit;

  constructor(private readonly config: ConfigService) {
    this.imagekit = new ImageKit({
      publicKey: this.config.get<string>('IMAGEKIT_PUBLIC_KEY')!,
      privateKey: this.config.get<string>('IMAGEKIT_PRIVATE_KEY')!,
      urlEndpoint: this.config.get<string>('IMAGEKIT_URL_ENDPOINT')!,
    });
  }

  // ── VALIDATE FILE ───────────────────────────────────────

  validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPG, PNG, and WEBP are allowed',
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File size exceeds the 2MB limit');
    }
  }

  // ── UPLOAD FILE ─────────────────────────────────────────

  async uploadAvatar(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{ avatarUrl: string; fileId: string }> {
    this.validateFile(file);

    try {
      const response = await this.imagekit.upload({
        file: file.buffer,
        fileName: `avatar_${userId}_${Date.now()}`,
        folder: `/upwork-proposal/avatars/${userId}/`,
        useUniqueFileName: true,
        tags: [`user_${userId}`, 'avatar'],
      });

      this.logger.log(`Avatar uploaded for user: ${userId}`);

      return {
        avatarUrl: response.url,
        fileId: response.fileId,
      };
    } catch (error) {
      this.logger.error(`Failed to upload avatar for user: ${userId}`, error);
      throw new InternalServerErrorException(
        'Failed to upload image. Please try again.',
      );
    }
  }

  // ── DELETE FILE ─────────────────────────────────────────

  async deleteAvatar(fileId: string): Promise<void> {
    try {
      await this.imagekit.deleteFile(fileId);
      this.logger.log(`Avatar deleted from ImageKit: ${fileId}`);
    } catch (error) {
      // Log but don't throw — old image cleanup failure should not block user update
      this.logger.error(
        `Failed to delete old avatar from ImageKit: ${fileId}`,
        error,
      );
    }
  }
}
