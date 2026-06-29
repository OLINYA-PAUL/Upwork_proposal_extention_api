import {
  Injectable,
  Logger,
  OnModuleInit,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const DEFAULT_CATEGORIES = [
  'Web Development',
  'Mobile Development',
  'Graphic Design',
  'Copywriting',
  'Content Writing',
  'Digital Marketing',
  'SEO',
  'Video Editing',
  'Data Entry',
  'Virtual Assistant',
  'UI/UX Design',
  'Software Testing',
];

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class CategoriesService implements OnModuleInit {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── SEED DEFAULT CATEGORIES ─────────────────────────────

  async onModuleInit() {
    await this.seedDefaults();
  }

  private async seedDefaults(): Promise<void> {
    for (const name of DEFAULT_CATEGORIES) {
      const slug = toSlug(name);

      const existing = await this.prisma.category.findUnique({
        where: { slug },
      });

      if (!existing) {
        await this.prisma.category.create({
          data: { name, slug, isDefault: true },
        });
        this.logger.log(`Default category seeded: ${name}`);
      }
    }
  }

  // ── GET ALL CATEGORIES ──────────────────────────────────

  async getAll() {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        isDefault: true,
        createdAt: true,
      },
    });

    return { categories };
  }

  // ── CREATE CATEGORY ─────────────────────────────────────

  async create(dto: CreateCategoryDto) {
    const slug = toSlug(dto.name);

    const existing = await this.prisma.category.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    const category = await this.prisma.category.create({
      data: { name: dto.name, slug, isDefault: false },
    });

    this.logger.log(`Category created: ${dto.name}`);

    return category;
  }

  // ── UPDATE CATEGORY ─────────────────────────────────────

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const slug = toSlug(dto.name);

    const existing = await this.prisma.category.findUnique({
      where: { slug },
    });

    if (existing && existing.id !== id) {
      throw new ConflictException(`Category "${dto.name}" already exists`);
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: { name: dto.name, slug },
    });

    this.logger.log(`Category updated: ${dto.name}`);

    return updated;
  }

  // ── DELETE CATEGORY ─────────────────────────────────────

  async delete(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { templates: { take: 1 } },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.isDefault) {
      throw new BadRequestException('Default categories cannot be deleted');
    }

    if (category.templates.length > 0) {
      throw new BadRequestException(
        'Cannot delete a category that has templates. Reassign templates first.',
      );
    }

    await this.prisma.category.delete({ where: { id } });

    this.logger.log(`Category deleted: ${category.name}`);

    return { message: 'Category deleted successfully.' };
  }
}
