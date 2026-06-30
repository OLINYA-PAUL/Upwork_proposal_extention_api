export interface ProposalStatusBreakdown {
  status: string;
  count: number;
}

export interface RecentProposal {
  id: string;
  jobTitle: string;
  status: string;
  createdAt: Date;
}

export interface BaseUserStats {
  totalProposals: number;
  proposalsThisMonth: number;
  proposalStatusBreakdown: ProposalStatusBreakdown[];
  successRate: number;
  plan: string;
  trialActive: boolean;
  trialRemaining: number | null;
  nextRequestAvailableIn: number | null;
  recentProposals: RecentProposal[];
  memberSince: Date;
  templatesPurchased: number;
  bookingsMade: number;
}

export interface GuruStats {
  totalBookingsReceived: number;
  upcomingSessions: number;
  totalEarningsPaid: number;
  totalEarningsPending: number;
  averageRating: number;
  totalReviews: number;
  blogPostsPublished: number;
}

export interface FullUserStats extends BaseUserStats {
  guruStats?: GuruStats;
}
