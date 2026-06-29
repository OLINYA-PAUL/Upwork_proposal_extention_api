import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import {
  toPublicTemplate,
  toFullTemplate,
  toAdminTemplate,
} from './dto/template-response.dto';
import { getPaginationParams, paginate } from '../helpers/pagination.helper';
import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import { TemplateStatus } from '@prisma/client';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);
  private readonly paddle: Paddle;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.paddle = new Paddle(this.config.get<string>('PADDLE_API_KEY')!, {
      environment: Environment.sandbox,
    });
  }

  // ── ADMIN: GET ALL USER PROPOSALS ───────────────────────

  async adminGetProposals(page: number = 1, limit: number = 20) {
    const { skip, take } = getPaginationParams(page, limit);

    const [proposals, total] = await Promise.all([
      this.prisma.proposal.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          jobTitle: true,
          jobDescription: true,
          proposalText: true,
          addedToTemplate: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.proposal.count(),
    ]);

    return paginate(proposals, total, page, limit);
  }

  // ── ADMIN: ADD PROPOSAL TO TEMPLATE ────────────────────

  async adminAddToTemplate(dto: CreateTemplateDto) {
    // Get proposal
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: dto.proposalId },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.addedToTemplate) {
      throw new BadRequestException(
        'This proposal has already been added to templates',
      );
    }

    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Create template — no user info stored
    const template = await this.prisma.template.create({
      data: {
        jobTitle: proposal.jobTitle,
        jobDescription: proposal.jobDescription,
        proposalText: proposal.proposalText,
        categoryId: dto.categoryId,
        priceUsd: dto.priceUsd ?? 2.0,
        status: TemplateStatus.PUBLISHED,
        addedFromProposalId: proposal.id,
      },
      include: { category: true },
    });

    // Mark original proposal as added
    await this.prisma.proposal.update({
      where: { id: dto.proposalId },
      data: { addedToTemplate: true },
    });

    this.logger.log(`Template created from proposal: ${dto.proposalId}`);

    return toAdminTemplate(template);
  }

  // ── ADMIN: UPDATE TEMPLATE ──────────────────────────────

  async adminUpdateTemplate(id: string, dto: UpdateTemplateDto) {
    const template = await this.prisma.template.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    const updated = await this.prisma.template.update({
      where: { id },
      data: {
        ...(dto.categoryId && { categoryId: dto.categoryId }),
        ...(dto.priceUsd !== undefined && { priceUsd: dto.priceUsd }),
        ...(dto.status && { status: dto.status }),
      },
      include: { category: true },
    });

    this.logger.log(`Template updated: ${id}`);

    return toAdminTemplate(updated);
  }

  // ── ADMIN: DELETE TEMPLATE ──────────────────────────────

  async adminDeleteTemplate(id: string) {
    const template = await this.prisma.template.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    await this.prisma.template.delete({ where: { id } });

    this.logger.log(`Template deleted: ${id}`);

    return { message: 'Template deleted successfully.' };
  }

  // ── PUBLIC: GET ALL PUBLISHED TEMPLATES ─────────────────

  async getPublicTemplates(
    page: number = 1,
    limit: number = 20,
    categorySlug?: string,
  ) {
    const { skip, take } = getPaginationParams(page, limit);

    const where: any = { status: TemplateStatus.PUBLISHED };

    if (categorySlug) {
      const category = await this.prisma.category.findUnique({
        where: { slug: categorySlug },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      where.categoryId = category.id;
    }

    const [templates, total] = await Promise.all([
      this.prisma.template.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { category: true },
      }),
      this.prisma.template.count({ where }),
    ]);

    return paginate(templates.map(toPublicTemplate), total, page, limit);
  }

  // ── PUBLIC: GET SINGLE TEMPLATE ─────────────────────────

  async getPublicTemplate(id: string) {
    const template = await this.prisma.template.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!template || template.status !== TemplateStatus.PUBLISHED) {
      throw new NotFoundException('Template not found');
    }

    return toPublicTemplate(template);
  }

  // ── USER: PURCHASE TEMPLATE ─────────────────────────────

  async purchaseTemplate(
    templateId: string,
    userId: string,
    userEmail: string,
  ): Promise<{ checkoutUrl: string }> {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
    });

    if (!template || template.status !== TemplateStatus.PUBLISHED) {
      throw new NotFoundException('Template not found');
    }

    // Check if already purchased
    const existing = await this.prisma.purchasedTemplate.findUnique({
      where: {
        userId_templateId: {
          userId,
          templateId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('You have already purchased this template');
    }

    // Get or create Paddle customer
    let customerId = await this.getPaddleCustomerId(userId);

    if (!customerId) {
      customerId = await this.createPaddleCustomer(userId, userEmail);
    }

    try {
      // Create Paddle transaction for template purchase
      const transaction = await this.paddle.transactions.create({
        items: [
          {
            price: {
              description: `GeniusBid Template — ${template.jobTitle}`,
              taxMode: 'account_setting',
              unitPrice: {
                amount: String(Math.round(template.priceUsd * 100)),
                currencyCode: 'USD',
              },
              product: {
                name: `GeniusBid Template`,
                taxCategory: 'saas',
              },
            },
            quantity: 1,
          },
        ],
        customerId,
        customData: {
          type: 'template_purchase',
          userId,
          templateId,
        },
      });

      const checkoutUrl = transaction.checkout?.url;

      if (!checkoutUrl) {
        throw new InternalServerErrorException(
          'Failed to generate checkout URL',
        );
      }

      this.logger.log(
        `Template purchase checkout created — user: ${userId} template: ${templateId}`,
      );

      return { checkoutUrl };
    } catch (error) {
      this.logger.error(
        `Failed to create template purchase checkout — user: ${userId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to create checkout. Please try again.',
      );
    }
  }

  // ── USER: GET PURCHASED TEMPLATES ───────────────────────

  async getUserLibrary(userId: string, page: number = 1, limit: number = 20) {
    const { skip, take } = getPaginationParams(page, limit);

    const [purchases, total] = await Promise.all([
      this.prisma.purchasedTemplate.findMany({
        where: { userId },
        orderBy: { purchasedAt: 'desc' },
        skip,
        take,
        include: {
          template: {
            include: { category: true },
          },
        },
      }),
      this.prisma.purchasedTemplate.count({ where: { userId } }),
    ]);

    return paginate(
      purchases.map((p) => ({
        purchasedAt: p.purchasedAt,
        amountPaid: p.amountPaidUsd,
        template: toFullTemplate(p.template),
      })),
      total,
      page,
      limit,
    );
  }

  // ── PRIVATE HELPERS ─────────────────────────────────────

  private async getPaddleCustomerId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { paddleCustomerId: true },
    });
    return user?.paddleCustomerId ?? null;
  }

  private async createPaddleCustomer(
    userId: string,
    email: string,
  ): Promise<string> {
    const customer = await this.paddle.customers.create({
      email,
      customData: { userId },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { paddleCustomerId: customer.id },
    });

    return customer.id;
  }
}
