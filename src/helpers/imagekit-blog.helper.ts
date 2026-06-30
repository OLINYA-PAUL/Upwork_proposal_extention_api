import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ImageKit from 'imagekit';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB for blog covers

@Injectable()
export class ImageKitBlogHelper {
  private readonly logger = new Logger(ImageKitBlogHelper.name);
  private readonly imagekit: ImageKit;

  constructor(private readonly config: ConfigService) {
    this.imagekit = new ImageKit({
      publicKey: this.config.get<string>('IMAGEKIT_BLOG_PUBLIC_KEY')!,
      privateKey: this.config.get<string>('IMAGEKIT_BLOG_PRIVATE_KEY')!,
      urlEndpoint: this.config.get<string>('IMAGEKIT_BLOG_URL_ENDPOINT')!,
    });
  }

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
      throw new BadRequestException('File size exceeds the 5MB limit');
    }
  }

  async uploadCoverImage(
    file: Express.Multer.File,
    postSlug: string,
  ): Promise<{ url: string; fileId: string }> {
    this.validateFile(file);

    try {
      const response = await this.imagekit.upload({
        file: file.buffer,
        fileName: `cover_${postSlug}_${Date.now()}`,
        folder: `/geniusbid-blog/covers/`,
        useUniqueFileName: true,
        tags: ['blog-cover', postSlug],
      });

      this.logger.log(`Blog cover uploaded for post: ${postSlug}`);

      return { url: response.url, fileId: response.fileId };
    } catch (error) {
      this.logger.error(
        `Failed to upload blog cover for post: ${postSlug}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to upload cover image. Please try again.',
      );
    }
  }

  async deleteCoverImage(fileId: string): Promise<void> {
    try {
      await this.imagekit.deleteFile(fileId);
      this.logger.log(`Blog cover deleted: ${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to delete blog cover: ${fileId}`, error);
    }
  }
}
