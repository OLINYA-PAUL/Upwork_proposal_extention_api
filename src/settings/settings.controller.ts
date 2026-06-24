import {
  Controller,
  Get,
  Patch,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateTrialSettingDto } from './dto/update-setting.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.interface';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ── GET ALL SETTINGS ────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  // ── GET TRIAL STATUS ────────────────────────────────────

  @Get('trial')
  @HttpCode(HttpStatus.OK)
  async getTrialStatus() {
    const enabled = await this.settingsService.isTrialEnabled();
    return {
      trialEnabled: enabled,
      message: enabled
        ? 'Free trial is currently active'
        : 'Free trial is currently disabled',
    };
  }

  // ── TOGGLE TRIAL ────────────────────────────────────────

  @Patch('trial')
  @HttpCode(HttpStatus.OK)
  setTrialEnabled(
    @Body() dto: UpdateTrialSettingDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.settingsService.setTrialEnabled(
      dto.enabled,
      admin.sub,
      admin.email,
    );
  }

  // ── GET AUDIT LOG ───────────────────────────────────────

  @Get('audit-log')
  @HttpCode(HttpStatus.OK)
  getAuditLog(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.settingsService.getAuditLog(page, limit);
  }
}
