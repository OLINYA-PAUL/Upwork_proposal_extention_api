import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminQueryDto } from './dto/admin-query.dto';
import {
  AdminUpdateRoleDto,
  AdminUpdatePlanDto,
} from './dto/admin-update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtPayload } from '../common/types/jwt-payload.interface';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── USER ROUTES ─────────────────────────────────────────

  @Get('me')
  @HttpCode(HttpStatus.OK)
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMe(user.sub);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
    }),
  )
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.usersService.updateMe(user.sub, dto, file);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  deleteMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.deleteMe(user.sub);
  }

  // ── ADMIN ROUTES ────────────────────────────────────────

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminGetAllUsers(@Query() query: AdminQueryDto) {
    return this.usersService.adminGetAllUsers(query);
  }

  @Get('admin/export')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async adminExportUsers(@Res() res: Response) {
    const csv = await this.usersService.adminExportUsers();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="users_${Date.now()}.csv"`,
    );

    return res.send(csv);
  }

  @Get('admin/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminGetUser(@Param('id') id: string) {
    return this.usersService.adminGetUser(id);
  }

  @Patch('admin/:id/restrict')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminRestrictUser(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    return this.usersService.adminRestrictUser(id, admin.sub);
  }

  @Patch('admin/:id/unrestrict')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminUnrestrictUser(
    @Param('id') id: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.usersService.adminUnrestrictUser(id, admin.sub);
  }

  @Delete('admin/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminSoftDeleteUser(
    @Param('id') id: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.usersService.adminSoftDeleteUser(id, admin.sub);
  }

  @Patch('admin/:id/restore')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminRestoreUser(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    return this.usersService.adminRestoreUser(id, admin.sub);
  }

  @Patch('admin/:id/role')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminChangeRole(
    @Param('id') id: string,
    @Body() dto: AdminUpdateRoleDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.usersService.adminChangeRole(id, dto, admin.sub);
  }

  @Patch('admin/:id/plan')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminChangePlan(
    @Param('id') id: string,
    @Body() dto: AdminUpdatePlanDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.usersService.adminChangePlan(id, dto, admin.sub);
  }

  @Patch('admin/:id/force-logout')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminForceLogout(@Param('id') id: string, @CurrentUser() admin: JwtPayload) {
    return this.usersService.adminForceLogout(id, admin.sub);
  }

  @Delete('admin/:id/permanent')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adminPermanentDeleteUser(
    @Param('id') id: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.usersService.adminPermanentDeleteUser(id, admin.sub);
  }
}
