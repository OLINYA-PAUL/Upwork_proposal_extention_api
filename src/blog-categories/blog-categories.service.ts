import {
  Injectable,
  Logger,
  OnModuleInit,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBlogCategoryDto } from './dto/create-blog-category.dto';
import { UpdateBlogCategoryDto } from './dto/update-blog-category.dto';

const DEFAULT_BLOG_CATEGORIES = [
  'Proposal Writing',
  'Client Acquisition',
  'Freelance Tips',
  'Upwork Strategy',
  'Pricing & Negotiation',
  'Portfolio Building',
];

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class BlogCategoriesService implements OnModuleInit {
  private readonly logger = new Logger(BlogCategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

  private async seedDefaults(): Promise<void> {
    for (const name of DEFAULT_BLOG_CATEGORIES) {
      const slug = toSlug(name);
      const existing = await this.prisma.blogCategory.findUnique({
        where: { slug },
      });

      if (!existing) {
        await this.prisma.blogCategory.create({
          data: { name, slug, isDefault: true },
        });
        this.logger.log(`Default blog category seeded: ${name}`);
      }
    }
  }

  async getAll() {
    const categories = await this.prisma.blogCategory.findMany({
      orderBy: { name: 'asc' },
    });
    return { categories };
  }

  async create(dto: CreateBlogCategoryDto) {
    const slug = toSlug(dto.name);
    const existing = await this.prisma.blogCategory.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    return this.prisma.blogCategory.create({
      data: { name: dto.name, slug, isDefault: false },
    });
  }

  async update(id: string, dto: UpdateBlogCategoryDto) {
    const category = await this.prisma.blogCategory.findUnique({
      where: { id },
    });

    if (!category) throw new NotFoundException('Category not found');

    const slug = toSlug(dto.name);
    const existing = await this.prisma.blogCategory.findUnique({
      where: { slug },
    });

    if (existing && existing.id !== id) {
      throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    return this.prisma.blogCategory.update({
      where: { id },
      data: { name: dto.name, slug },
    });
  }

  async delete(id: string) {
    const category = await this.prisma.blogCategory.findUnique({
      where: { id },
      include: { posts: { take: 1 } },
    });

    if (!category) throw new NotFoundException('Category not found');

    if (category.isDefault) {
      throw new BadRequestException('Default categories cannot be deleted');
    }

    if (category.posts.length > 0) {
      throw new BadRequestException(
        'Cannot delete a category that has blog posts. Reassign posts first.',
      );
    }

    await this.prisma.blogCategory.delete({ where: { id } });

    return { message: 'Blog category deleted successfully.' };
  }
}
