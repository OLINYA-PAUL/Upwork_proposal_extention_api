import { ProposalStatus } from '@prisma/client';

export class ProposalResponseDto {
  id!: string;
  jobTitle!: string;
  jobUrl!: string;
  jobDescription!: string;
  proposalText!: string;
  screeningAnswers!: { question: string; answer: string }[];
  aiScore!: number | null;
  status!: ProposalStatus;
  createdAt!: Date;
  updatedAt!: Date;
}

export function toProposalResponse(proposal: any): ProposalResponseDto {
  return {
    id: proposal.id,
    jobTitle: proposal.jobTitle,
    jobUrl: proposal.jobUrl,
    jobDescription: proposal.jobDescription,
    proposalText: proposal.proposalText,
    screeningAnswers: proposal.screeningAnswers ?? [],
    aiScore: proposal.aiScore ?? null,
    status: proposal.status,
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
  };
}
