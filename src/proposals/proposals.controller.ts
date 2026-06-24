import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ProposalsService } from './proposals.service';
import { AiService } from '../ai/ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsageLimiterInterceptor } from '../common/interceptors/usage-limiter.interceptor';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.interface';
import { UpdateStatusDto } from './dto/update-status.dto';
import { GenerateProposalDto } from './dto/generate-proposal.dto';

@Controller('proposals')
@UseGuards(JwtAuthGuard)
export class ProposalsController {
  private readonly logger = new Logger(ProposalsController.name);

  constructor(
    private readonly proposalsService: ProposalsService,
    private readonly aiService: AiService,
  ) {}

  // ── GENERATE ────────────────────────────────────────────

  @Post('generate')
  @UseInterceptors(UsageLimiterInterceptor)
  @HttpCode(HttpStatus.OK)
  async generate(
    @Body() dto: GenerateProposalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.logger.log(`Proposal generation started — user: ${user.sub}`);

    const { proposal, screeningAnswers } =
      await this.aiService.generateProposal(dto);

    await this.proposalsService
      .saveProposal(user.sub, dto, proposal, screeningAnswers)
      .catch((err) =>
        this.logger.error('Failed to save proposal after generation', err),
      );

    return { proposal, screeningAnswers };
  }

  // ── REGENERATE ──────────────────────────────────────────

  @Post('regenerate')
  @UseInterceptors(UsageLimiterInterceptor)
  @HttpCode(HttpStatus.OK)
  async regenerate(
    @Body() dto: GenerateProposalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    this.logger.log(`Proposal regeneration started — user: ${user.sub}`);

    const { proposal, screeningAnswers } =
      await this.aiService.generateProposal(dto);

    await this.proposalsService
      .saveProposal(user.sub, dto, proposal, screeningAnswers)
      .catch((err) =>
        this.logger.error('Failed to save proposal after regeneration', err),
      );

    return { proposal, screeningAnswers };
  }

  // ── GET HISTORY ─────────────────────────────────────────

  @Get('history')
  @HttpCode(HttpStatus.OK)
  getHistory(
    @CurrentUser() user: JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.proposalsService.getHistory(user.sub, page, limit);
  }

  // ── GET SINGLE PROPOSAL ─────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  getProposal(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.proposalsService.getProposal(id, user.sub);
  }

  // ── UPDATE STATUS ───────────────────────────────────────

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.proposalsService.updateStatus(id, dto, user.sub);
  }

  // ── DELETE ──────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteProposal(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.proposalsService.deleteProposal(id, user.sub);
  }
}
