import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImageKitBlogHelper } from '../helpers/imagekit-blog.helper';
import { FingerprintHelper } from '../helpers/fingerprint.helper';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { RejectPostDto } from './dto/reject-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { LikePostDto } from './dto/like-post.dto';
import {
  toPublicPost,
  toPostListItem,
  toAdminPost,
} from './dto/post-response.dto';
import { getPaginationParams, paginate } from '../helpers/pagination.helper';
import { BlogPostStatus, NotificationType, Role } from '@prisma/client';
import sanitizeHtml from 'sanitize-html';

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SANITIZE_OPTIONS = {
  allowedTags: [
    'h1',
    'h2',
    'h3',
    'h4',
    'p',
    'br',
    'strong',
    'em',
    'u',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'blockquote',
    'code',
    'pre',
    'span',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    span: ['style'],
  },
  allowedSchemes: ['http', 'https'],
};

@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly imagekitBlog: ImageKitBlogHelper,
    private readonly fingerprintHelper: FingerprintHelper,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  // ── GENERATE UNIQUE SLUG ─────────────────────────────────

  private async generateUniqueSlug(title: string): Promise<string> {
    const baseSlug = toSlug(title);
    let slug = baseSlug;
    let counter = 2;

    while (await this.prisma.blogPost.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  // ── CREATE POST (GURU — draft) ──────────────────────────

  async createDraft(
    authorId: string,
    dto: CreatePostDto,
    coverImage?: Express.Multer.File,
  ) {
    const category = await this.prisma.blogCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');

    const slug = await this.generateUniqueSlug(dto.title);
    const cleanContent = sanitizeHtml(dto.content, SANITIZE_OPTIONS);

    let coverImageUrl: string | null = null;
    let coverImageFileId: string | null = null;

    if (coverImage) {
      const uploaded = await this.imagekitBlog.uploadCoverImage(
        coverImage,
        slug,
      );
      coverImageUrl = uploaded.url;
      coverImageFileId = uploaded.fileId;
    }

    const post = await this.prisma.blogPost.create({
      data: {
        title: dto.title,
        slug,
        content: cleanContent,
        excerpt: dto.excerpt,
        categoryId: dto.categoryId,
        authorId,
        status: BlogPostStatus.DRAFT,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        metaKeywords: dto.metaKeywords ?? [],
        coverImageUrl,
        coverImageFileId,
      },
      include: { category: true, author: true },
    });

    this.logger.log(
      `Blog draft created — post: ${post.id} author: ${authorId}`,
    );

    return toAdminPost(post);
  }

  // ── CREATE + PUBLISH DIRECTLY (ADMIN) ───────────────────

  async adminCreateAndPublish(
    authorId: string,
    dto: CreatePostDto,
    coverImage?: Express.Multer.File,
  ) {
    const category = await this.prisma.blogCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Category not found');

    const slug = await this.generateUniqueSlug(dto.title);
    const cleanContent = sanitizeHtml(dto.content, SANITIZE_OPTIONS);

    let coverImageUrl: string | null = null;
    let coverImageFileId: string | null = null;

    if (coverImage) {
      const uploaded = await this.imagekitBlog.uploadCoverImage(
        coverImage,
        slug,
      );
      coverImageUrl = uploaded.url;
      coverImageFileId = uploaded.fileId;
    }

    const post = await this.prisma.blogPost.create({
      data: {
        title: dto.title,
        slug,
        content: cleanContent,
        excerpt: dto.excerpt,
        categoryId: dto.categoryId,
        authorId,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: new Date(),
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        metaKeywords: dto.metaKeywords ?? [],
        coverImageUrl,
        coverImageFileId,
      },
      include: { category: true, author: true },
    });

    this.logger.log(`Blog post published by admin — post: ${post.id}`);

    return toAdminPost(post);
  }

  // ── UPDATE POST (GURU — own draft/rejected only) ────────

  async updateOwnPost(
    postId: string,
    authorId: string,
    dto: UpdatePostDto,
    coverImage?: Express.Multer.File,
  ) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id: postId },
    });
    if (!post) throw new NotFoundException('Post not found');

    if (post.authorId !== authorId) {
      throw new ForbiddenException('You do not have access to this post');
    }

    const editableStatuses: BlogPostStatus[] = [
      BlogPostStatus.DRAFT,
      BlogPostStatus.REJECTED,
    ];

    if (!editableStatuses.includes(post.status)) {
      throw new BadRequestException(
        'Only draft or rejected posts can be edited',
      );
    }

    let coverImageUrl = post.coverImageUrl;
    let coverImageFileId = post.coverImageFileId;

    if (coverImage) {
      if (post.coverImageFileId) {
        await this.imagekitBlog.deleteCoverImage(post.coverImageFileId);
      }
      const uploaded = await this.imagekitBlog.uploadCoverImage(
        coverImage,
        post.slug,
      );
      coverImageUrl = uploaded.url;
      coverImageFileId = uploaded.fileId;
    }

    const cleanContent = dto.content
      ? sanitizeHtml(dto.content, SANITIZE_OPTIONS)
      : undefined;

    const updated = await this.prisma.blogPost.update({
      where: { id: postId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(cleanContent && { content: cleanContent }),
        ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
        ...(dto.categoryId && { categoryId: dto.categoryId }),
        ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle }),
        ...(dto.metaDescription !== undefined && {
          metaDescription: dto.metaDescription,
        }),
        ...(dto.metaKeywords && { metaKeywords: dto.metaKeywords }),
        coverImageUrl,
        coverImageFileId,
        // Reset rejection state on edit
        status: BlogPostStatus.DRAFT,
        rejectionReason: null,
      },
      include: { category: true, author: true },
    });

    return toAdminPost(updated);
  }

  // ── SUBMIT FOR REVIEW (GURU) ────────────────────────────

  async submitForReview(postId: string, authorId: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id: postId },
      include: { author: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    if (post.authorId !== authorId) {
      throw new ForbiddenException('You do not have access to this post');
    }

    const editableStatuses: BlogPostStatus[] = [
      BlogPostStatus.DRAFT,
      BlogPostStatus.REJECTED,
    ];

    if (!editableStatuses.includes(post.status)) {
      throw new BadRequestException(
        'Only draft or rejected posts can be submitted for review',
      );
    }

    await this.prisma.blogPost.update({
      where: { id: postId },
      data: { status: BlogPostStatus.PENDING_REVIEW, rejectionReason: null },
    });

    // Notify admins
    await this.notifications.notifyAdmins({
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'New Blog Post Pending Review',
      body: `${post.author.name} submitted "${post.title}" for review.`,
    });

    this.logger.log(`Post submitted for review — post: ${postId}`);

    return { message: 'Your post has been submitted for review.' };
  }

  // ── ADMIN: APPROVE POST ─────────────────────────────────

  async adminApprovePost(postId: string, adminId: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id: postId },
      include: { author: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    if (post.status !== BlogPostStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Only posts pending review can be approved',
      );
    }

    await this.prisma.blogPost.update({
      where: { id: postId },
      data: { status: BlogPostStatus.PUBLISHED, publishedAt: new Date() },
    });

    await this.notifications.createAndSend({
      userId: post.authorId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Blog Post Approved',
      body: `Your post "${post.title}" has been approved and is now live.`,
    });

    this.logger.log(`Post approved — post: ${postId} by admin: ${adminId}`);

    return { message: 'Post approved and published successfully.' };
  }

  // ── ADMIN: REJECT POST ──────────────────────────────────

  async adminRejectPost(postId: string, dto: RejectPostDto, adminId: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id: postId },
      include: { author: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    if (post.status !== BlogPostStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Only posts pending review can be rejected',
      );
    }

    await this.prisma.blogPost.update({
      where: { id: postId },
      data: {
        status: BlogPostStatus.REJECTED,
        rejectionReason: dto.reason,
      },
    });

    await this.notifications.createAndSend({
      userId: post.authorId,
      type: NotificationType.BOOKING_CANCELLED,
      title: 'Blog Post Rejected',
      body: `Your post "${post.title}" was not approved. Reason: ${dto.reason}`,
    });

    this.logger.log(`Post rejected — post: ${postId} by admin: ${adminId}`);

    return { message: 'Post rejected.' };
  }

  // ── ADMIN: ARCHIVE POST ─────────────────────────────────

  async adminArchivePost(postId: string, adminId: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id: postId },
    });
    if (!post) throw new NotFoundException('Post not found');

    await this.prisma.blogPost.update({
      where: { id: postId },
      data: { status: BlogPostStatus.ARCHIVED },
    });

    this.logger.log(`Post archived — post: ${postId} by admin: ${adminId}`);

    return { message: 'Post archived successfully.' };
  }

  // ── ADMIN: DELETE POST ──────────────────────────────────

  async adminDeletePost(postId: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id: postId },
    });
    if (!post) throw new NotFoundException('Post not found');

    if (post.coverImageFileId) {
      await this.imagekitBlog.deleteCoverImage(post.coverImageFileId);
    }

    await this.prisma.blogPost.delete({ where: { id: postId } });

    return { message: 'Post deleted successfully.' };
  }

  // ── ADMIN: UPDATE ANY POST ──────────────────────────────

  async adminUpdatePost(
    postId: string,
    dto: UpdatePostDto,
    coverImage?: Express.Multer.File,
  ) {
    const post = await this.prisma.blogPost.findUnique({
      where: { id: postId },
    });
    if (!post) throw new NotFoundException('Post not found');

    let coverImageUrl = post.coverImageUrl;
    let coverImageFileId = post.coverImageFileId;

    if (coverImage) {
      if (post.coverImageFileId) {
        await this.imagekitBlog.deleteCoverImage(post.coverImageFileId);
      }
      const uploaded = await this.imagekitBlog.uploadCoverImage(
        coverImage,
        post.slug,
      );
      coverImageUrl = uploaded.url;
      coverImageFileId = uploaded.fileId;
    }

    const cleanContent = dto.content
      ? sanitizeHtml(dto.content, SANITIZE_OPTIONS)
      : undefined;

    const updated = await this.prisma.blogPost.update({
      where: { id: postId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(cleanContent && { content: cleanContent }),
        ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
        ...(dto.categoryId && { categoryId: dto.categoryId }),
        ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle }),
        ...(dto.metaDescription !== undefined && {
          metaDescription: dto.metaDescription,
        }),
        ...(dto.metaKeywords && { metaKeywords: dto.metaKeywords }),
        coverImageUrl,
        coverImageFileId,
      },
      include: { category: true, author: true },
    });

    return toAdminPost(updated);
  }

  // ── GET MY POSTS (GURU) ─────────────────────────────────

  async getMyPosts(authorId: string, page: number = 1, limit: number = 20) {
    const { skip, take } = getPaginationParams(page, limit);

    const [posts, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where: { authorId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { category: true, author: true },
      }),
      this.prisma.blogPost.count({ where: { authorId } }),
    ]);

    return paginate(posts.map(toAdminPost), total, page, limit);
  }

  // ── ADMIN: GET PENDING POSTS ─────────────────────────────

  async adminGetPending(page: number = 1, limit: number = 20) {
    const { skip, take } = getPaginationParams(page, limit);

    const [posts, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where: { status: BlogPostStatus.PENDING_REVIEW },
        orderBy: { createdAt: 'asc' },
        skip,
        take,
        include: { category: true, author: true },
      }),
      this.prisma.blogPost.count({
        where: { status: BlogPostStatus.PENDING_REVIEW },
      }),
    ]);

    return paginate(posts.map(toAdminPost), total, page, limit);
  }

  // ── ADMIN: GET ALL POSTS ─────────────────────────────────

  async adminGetAll(
    page: number = 1,
    limit: number = 20,
    status?: BlogPostStatus,
  ) {
    const { skip, take } = getPaginationParams(page, limit);
    const where: any = {};
    if (status) where.status = status;

    const [posts, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { category: true, author: true },
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return paginate(posts.map(toAdminPost), total, page, limit);
  }

  // ── PUBLIC: GET PUBLISHED POSTS ─────────────────────────

  async getPublicPosts(
    page: number = 1,
    limit: number = 20,
    categorySlug?: string,
  ) {
    const { skip, take } = getPaginationParams(page, limit);
    const where: any = { status: BlogPostStatus.PUBLISHED };

    if (categorySlug) {
      const category = await this.prisma.blogCategory.findUnique({
        where: { slug: categorySlug },
      });
      if (!category) throw new NotFoundException('Category not found');
      where.categoryId = category.id;
    }

    const [posts, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take,
        include: { category: true, author: true },
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return paginate(posts.map(toPostListItem), total, page, limit);
  }

  // ── PUBLIC: GET SINGLE POST (increments view count) ────

  async getPublicPost(slug: string) {
    const post = await this.prisma.blogPost.findUnique({
      where: { slug },
      include: { category: true, author: true },
    });

    if (!post || post.status !== BlogPostStatus.PUBLISHED) {
      throw new NotFoundException('Post not found');
    }

    // Increment view count asynchronously — don't block response
    this.prisma.blogPost
      .update({
        where: { id: post.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch((err) =>
        this.logger.error(`Failed to increment view count: ${post.id}`, err),
      );

    return toPublicPost(post);
  }

  // ── LIKE POST ────────────────────────────────────────────

  async likePost(slug: string, dto: LikePostDto) {
    const post = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (!post || post.status !== BlogPostStatus.PUBLISHED) {
      throw new NotFoundException('Post not found');
    }

    const fingerprint = this.fingerprintHelper.hash({
      userAgent: dto.userAgent || '',
      language: dto.language || '',
      timezone: dto.timezone || '',
      screenResolution: dto.screenResolution || '',
      platform: dto.platform || '',
      colorDepth: dto.colorDepth || '',
    });

    // Check if already liked
    const existing = await this.prisma.blogLike.findUnique({
      where: { postId_fingerprint: { postId: post.id, fingerprint } },
    });

    if (existing) {
      // Unlike — toggle off
      await this.prisma.blogLike.delete({ where: { id: existing.id } });
      await this.prisma.blogPost.update({
        where: { id: post.id },
        data: { likeCount: { decrement: 1 } },
      });

      return { liked: false, message: 'Like removed.' };
    }

    // Like
    await this.prisma.blogLike.create({
      data: { postId: post.id, fingerprint },
    });
    await this.prisma.blogPost.update({
      where: { id: post.id },
      data: { likeCount: { increment: 1 } },
    });

    return { liked: true, message: 'Post liked successfully.' };
  }

  // ── COMMENTS ──────────────────────────────────────────────

  async createComment(slug: string, dto: CreateCommentDto) {
    const post = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (!post || post.status !== BlogPostStatus.PUBLISHED) {
      throw new NotFoundException('Post not found');
    }

    const comment = await this.prisma.blogComment.create({
      data: {
        postId: post.id,
        name: dto.name,
        email: dto.email,
        comment: dto.comment,
      },
    });

    // Notify admins for moderation awareness
    await this.notifications.notifyAdmins({
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'New Blog Comment',
      body: `${dto.name} commented on "${post.title}".`,
    });

    return comment;
  }

  async getComments(slug: string, page: number = 1, limit: number = 20) {
    const post = await this.prisma.blogPost.findUnique({ where: { slug } });
    if (!post) throw new NotFoundException('Post not found');

    const { skip, take } = getPaginationParams(page, limit);

    const [comments, total] = await Promise.all([
      this.prisma.blogComment.findMany({
        where: { postId: post.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          comment: true,
          editedByAdmin: true,
          createdAt: true,
          // email intentionally excluded from public response
        },
      }),
      this.prisma.blogComment.count({ where: { postId: post.id } }),
    ]);

    return paginate(comments, total, page, limit);
  }

  async adminUpdateComment(commentId: string, dto: UpdateCommentDto) {
    const comment = await this.prisma.blogComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    return this.prisma.blogComment.update({
      where: { id: commentId },
      data: { comment: dto.comment, editedByAdmin: true },
    });
  }

  async adminDeleteComment(commentId: string) {
    const comment = await this.prisma.blogComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    await this.prisma.blogComment.delete({ where: { id: commentId } });

    return { message: 'Comment deleted successfully.' };
  }
}
