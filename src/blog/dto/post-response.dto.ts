export function toPublicPost(post: any) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    coverImageUrl: post.coverImageUrl,
    category: post.category,
    author: {
      name: post.author?.name,
      avatarUrl: post.author?.avatarUrl ?? null,
    },
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    metaKeywords: post.metaKeywords,
    canonicalUrl: post.canonicalUrl,
    viewCount: post.viewCount,
    likeCount: post.likeCount,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
  };
}

export function toPostListItem(post: any) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    coverImageUrl: post.coverImageUrl,
    category: post.category,
    author: {
      name: post.author?.name,
      avatarUrl: post.author?.avatarUrl ?? null,
    },
    viewCount: post.viewCount,
    likeCount: post.likeCount,
    publishedAt: post.publishedAt,
  };
}

export function toAdminPost(post: any) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    coverImageUrl: post.coverImageUrl,
    category: post.category,
    author: {
      id: post.author?.id,
      name: post.author?.name,
      email: post.author?.email,
    },
    status: post.status,
    rejectionReason: post.rejectionReason,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    metaKeywords: post.metaKeywords,
    viewCount: post.viewCount,
    likeCount: post.likeCount,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}
