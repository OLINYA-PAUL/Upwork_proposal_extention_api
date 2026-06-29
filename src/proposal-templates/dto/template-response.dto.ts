export function toPublicTemplate(template: any) {
  const lines = template.proposalText.split('\n').filter(Boolean);
  const preview = lines.slice(0, 2).join('\n');

  return {
    id: template.id,
    jobTitle: template.jobTitle,
    category: template.category,
    priceUsd: template.priceUsd,
    purchaseCount: template.purchaseCount,
    preview,
    isBlurred: true,
    createdAt: template.createdAt,
  };
}

export function toFullTemplate(template: any) {
  return {
    id: template.id,
    jobTitle: template.jobTitle,
    jobDescription: template.jobDescription,
    proposalText: template.proposalText,
    category: template.category,
    priceUsd: template.priceUsd,
    purchaseCount: template.purchaseCount,
    createdAt: template.createdAt,
  };
}

export function toAdminTemplate(template: any) {
  return {
    id: template.id,
    jobTitle: template.jobTitle,
    jobDescription: template.jobDescription,
    proposalText: template.proposalText,
    category: template.category,
    priceUsd: template.priceUsd,
    status: template.status,
    purchaseCount: template.purchaseCount,
    addedFromProposalId: template.addedFromProposalId,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}
