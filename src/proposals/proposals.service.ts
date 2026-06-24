import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toProposalResponse } from './dto/proposal-response.dto';
import { getPaginationParams, paginate } from '../helpers/pagination.helper';
import { UpdateStatusDto } from './dto/update-status.dto';
import { GenerateProposalDto } from './dto/generate-proposal.dto';

@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── SAVE PROPOSAL ───────────────────────────────────────
  // Called after AI generation completes successfully

  async saveProposal(
    userId: string,
    dto: GenerateProposalDto,
    proposalText: string,
    screeningAnswers: { question: string; answer: string }[],
  ) {
    const proposal = await this.prisma.proposal.create({
      data: {
        userId,
        jobTitle: dto.jobTitle,
        jobUrl: dto.jobUrl,
        jobDescription: dto.jobDescription,
        proposalText,
        screeningAnswers,
      },
    });

    this.logger.log(
      `Proposal saved — user: ${userId} proposal: ${proposal.id}`,
    );

    return toProposalResponse(proposal);
  }

  // ── GET HISTORY ─────────────────────────────────────────

  async getHistory(userId: string, page: number = 1, limit: number = 10) {
    const { skip, take } = getPaginationParams(page, limit);

    const [proposals, total] = await Promise.all([
      this.prisma.proposal.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.proposal.count({
        where: { userId },
      }),
    ]);

    return paginate(proposals.map(toProposalResponse), total, page, limit);
  }

  // ── GET SINGLE PROPOSAL ─────────────────────────────────

  async getProposal(proposalId: string, userId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.userId !== userId) {
      throw new ForbiddenException('You do not have access to this proposal');
    }

    return toProposalResponse(proposal);
  }

  // ── UPDATE STATUS ───────────────────────────────────────

  async updateStatus(proposalId: string, dto: UpdateStatusDto, userId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.userId !== userId) {
      throw new ForbiddenException('You do not have access to this proposal');
    }

    const updated = await this.prisma.proposal.update({
      where: { id: proposalId },
      data: { status: dto.status },
    });

    this.logger.log(
      `Proposal status updated — proposal: ${proposalId} status: ${dto.status}`,
    );

    return toProposalResponse(updated);
  }

  // ── DELETE PROPOSAL ─────────────────────────────────────

  async deleteProposal(proposalId: string, userId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.userId !== userId) {
      throw new ForbiddenException('You do not have access to this proposal');
    }

    await this.prisma.proposal.delete({
      where: { id: proposalId },
    });

    this.logger.log(
      `Proposal deleted — user: ${userId} proposal: ${proposalId}`,
    );

    return { message: 'Proposal deleted successfully.' };
  }
}
