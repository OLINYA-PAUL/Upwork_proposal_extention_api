import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { RejectPostDto } from './dto/reject-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { LikePostDto } from './dto/like-post.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.interface';
import { BlogPostStatus } from '@prisma/client';

@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // ── PUBLIC ──────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  getPublicPosts(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('category') category?: string,
  ) {
    return this.blogService.getPublicPosts(page, limit, category);
  }

  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  getPublicPost(@Param('slug') slug: string) {
    return this.blogService.getPublicPost(slug);
  }

  @Post(':slug/like')
  @HttpCode(HttpStatus.OK)
  likePost(@Param('slug') slug: string, @Body() dto: LikePostDto) {
    return this.blogService.likePost(slug, dto);
  }

  @Post(':slug/comments')
  @HttpCode(HttpStatus.CREATED)
  createComment(@Param('slug') slug: string, @Body() dto: CreateCommentDto) {
    return this.blogService.createComment(slug, dto);
  }

  @Get(':slug/comments')
  @HttpCode(HttpStatus.OK)
  getComments(
    @Param('slug') slug: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.blogService.getComments(slug, page, limit);
  }

  // ── GURU ────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('GURU')
  @UseInterceptors(FileInterceptor('coverImage', { storage: memoryStorage() }))
  @HttpCode(HttpStatus.CREATED)
  createDraft(
    @Body() dto: CreatePostDto,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() coverImage?: Express.Multer.File,
  ) {
    return this.blogService.createDraft(user.sub, dto, coverImage);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('GURU')
  @UseInterceptors(FileInterceptor('coverImage', { storage: memoryStorage() }))
  @HttpCode(HttpStatus.OK)
  updateOwnPost(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() coverImage?: Express.Multer.File,
  ) {
    return this.blogService.updateOwnPost(id, user.sub, dto, coverImage);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('GURU')
  @HttpCode(HttpStatus.OK)
  submitForReview(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.blogService.submitForReview(id, user.sub);
  }

  @Get('me/posts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('GURU')
  @HttpCode(HttpStatus.OK)
  getMyPosts(
    @CurrentUser() user: JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.blogService.getMyPosts(user.sub, page, limit);
  }

  // ── ADMIN ────────────────────────────────────────────────

  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('coverImage', { storage: memoryStorage() }))
  @HttpCode(HttpStatus.CREATED)
  adminCreateAndPublish(
    @Body() dto: CreatePostDto,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() coverImage?: Express.Multer.File,
  ) {
    return this.blogService.adminCreateAndPublish(user.sub, dto, coverImage);
  }

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('coverImage', { storage: memoryStorage() }))
  @HttpCode(HttpStatus.OK)
  adminUpdatePost(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @UploadedFile() coverImage?: Express.Multer.File,
  ) {
    return this.blogService.adminUpdatePost(id, dto, coverImage);
  }

  @Get('admin/pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminGetPending(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.blogService.adminGetPending(page, limit);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminGetAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: BlogPostStatus,
  ) {
    return this.blogService.adminGetAll(page, limit, status);
  }

  @Patch('admin/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminApprovePost(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    return this.blogService.adminApprovePost(id, admin.sub);
  }

  @Patch('admin/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminRejectPost(
    @Param('id') id: string,
    @Body() dto: RejectPostDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.blogService.adminRejectPost(id, dto, admin.sub);
  }

  @Patch('admin/:id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminArchivePost(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    return this.blogService.adminArchivePost(id, admin.sub);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminDeletePost(@Param('id') id: string) {
    return this.blogService.adminDeletePost(id);
  }

  @Patch('admin/comments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminUpdateComment(@Param('id') id: string, @Body() dto: UpdateCommentDto) {
    return this.blogService.adminUpdateComment(id, dto);
  }

  @Delete('admin/comments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminDeleteComment(@Param('id') id: string) {
    return this.blogService.adminDeleteComment(id);
  }
}
