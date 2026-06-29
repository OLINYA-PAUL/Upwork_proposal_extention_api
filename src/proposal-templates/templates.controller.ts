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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.interface';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  // ── PUBLIC ROUTES ───────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  getPublicTemplates(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('category') category?: string,
  ) {
    return this.templatesService.getPublicTemplates(page, limit, category);
  }

  @Get('library')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  getUserLibrary(
    @CurrentUser() user: JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.templatesService.getUserLibrary(user.sub, page, limit);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  getPublicTemplate(@Param('id') id: string) {
    return this.templatesService.getPublicTemplate(id);
  }

  // ── USER ROUTES ─────────────────────────────────────────

  @Post(':id/purchase')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  purchaseTemplate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.templatesService.purchaseTemplate(id, user.sub, user.email);
  }

  // ── ADMIN ROUTES ────────────────────────────────────────

  @Get('admin/proposals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminGetProposals(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.templatesService.adminGetProposals(page, limit);
  }

  @Post('admin/add')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  adminAddToTemplate(@Body() dto: CreateTemplateDto) {
    return this.templatesService.adminAddToTemplate(dto);
  }

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminUpdateTemplate(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.adminUpdateTemplate(id, dto);
  }

  @Delete('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminDeleteTemplate(@Param('id') id: string) {
    return this.templatesService.adminDeleteTemplate(id);
  }
}
