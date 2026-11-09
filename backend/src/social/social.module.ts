import { Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser, Me } from '../common/auth.js';
import { daysAgo, num } from '../common/util.js';

class PostDto {
  @IsString() @MinLength(1) @MaxLength(2000) body: string;
  @IsOptional() @IsIn(['TEXT', 'MEDIA', 'QUOTE', 'WORKOUT_SHARE']) kind?: 'TEXT' | 'MEDIA' | 'QUOTE' | 'WORKOUT_SHARE';
  @IsOptional() @IsArray() @ArrayMaxSize(4) mediaUrls?: string[];
  @IsOptional() @IsUUID() workoutSessionId?: string;
}
class CommentDto { @IsString() @MinLength(1) @MaxLength(600) body: string }

@Injectable()
export class SocialService {
  constructor(private db: PrismaService) {}

  private async shape(viewer: string, posts: any[]) {
    const ids = posts.map((p) => p.id);
    const [likes, marks, comments, mine, myMarks] = await Promise.all([
      this.db.postLike.groupBy({ by: ['postId'], where: { postId: { in: ids } }, _count: true }),
      this.db.postBookmark.findMany({ where: { postId: { in: ids }, userId: viewer }, select: { postId: true } }),
      this.db.postComment.groupBy({ by: ['postId'], where: { postId: { in: ids }, deletedAt: null }, _count: true }),
      this.db.postLike.findMany({ where: { postId: { in: ids }, userId: viewer }, select: { postId: true } }),
      Promise.resolve(null),
    ]);
    const L = new Map(likes.map((l) => [l.postId, l._count])), C = new Map(comments.map((c) => [c.postId, c._count]));
    const liked = new Set(mine.map((m) => m.postId)), marked = new Set(marks.map((m) => m.postId));
    return posts.map((p) => ({
      id: p.id, kind: p.kind, body: p.body, mediaUrls: p.mediaUrls, createdAt: p.createdAt, workoutSessionId: p.workoutSessionId,
      author: { id: p.author.id, username: p.author.athlete?.username ?? p.author.email.split('@')[0], isCoach: p.author.role === 'COACH', avatarUrl: p.author.athlete?.avatarUrl ?? null },
      likeCount: L.get(p.id) ?? 0, commentCount: C.get(p.id) ?? 0, liked: liked.has(p.id), bookmarked: marked.has(p.id),
    }));
  }
  private readonly include = { author: { select: { id: true, email: true, role: true, athlete: { select: { username: true, avatarUrl: true } } } } };

  async feed(viewer: string, cursor?: string) {
    const following = (await this.db.follow.findMany({ where: { followerId: viewer }, select: { followingId: true } })).map((f) => f.followingId);
    const rows = await this.db.post.findMany({ where: { deletedAt: null, authorId: { in: [...following, viewer] } }, orderBy: { createdAt: 'desc' }, take: 21, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: this.include });
    const page = rows.slice(0, 20);
    return { items: await this.shape(viewer, page), nextCursor: rows.length > 20 ? page[page.length - 1].id : null };
  }

  async create(viewer: string, d: PostDto) {
    if (d.workoutSessionId) {
      const w = await this.db.workoutSession.findFirst({ where: { id: d.workoutSessionId, athleteId: viewer } });
      if (!w) throw new ForbiddenException('You can only share your own workouts');
    }
    const p = await this.db.post.create({ data: { authorId: viewer, body: d.body, kind: d.kind ?? (d.mediaUrls?.length ? 'MEDIA' : 'TEXT'), mediaUrls: d.mediaUrls ?? [], workoutSessionId: d.workoutSessionId }, include: this.include });
    return (await this.shape(viewer, [p]))[0];
  }

  async toggleLike(viewer: string, postId: string) {
    const key = { postId_userId: { postId, userId: viewer } };
    const had = await this.db.postLike.findUnique({ where: key });
    if (had) await this.db.postLike.delete({ where: key }); else await this.db.postLike.create({ data: { postId, userId: viewer } });
    return { liked: !had, likeCount: await this.db.postLike.count({ where: { postId } }) };
  }
  async toggleBookmark(viewer: string, postId: string) {
    const key = { postId_userId: { postId, userId: viewer } };
    const had = await this.db.postBookmark.findUnique({ where: key });
    if (had) await this.db.postBookmark.delete({ where: key }); else await this.db.postBookmark.create({ data: { postId, userId: viewer } });
    return { bookmarked: !had };
  }
  async comments(postId: string) {
    const rows = await this.db.postComment.findMany({ where: { postId, deletedAt: null }, orderBy: { createdAt: 'asc' }, take: 100, include: { author: { select: { id: true, email: true, athlete: { select: { username: true } } } } } });
    return rows.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, author: { id: c.author.id, username: c.author.athlete?.username ?? c.author.email.split('@')[0] } }));
  }
  async addComment(viewer: string, postId: string, d: CommentDto) {
    if (!(await this.db.post.findFirst({ where: { id: postId, deletedAt: null } }))) throw new NotFoundException('Post not found');
    const c = await this.db.postComment.create({ data: { postId, authorId: viewer, body: d.body } });
    return { id: c.id, body: c.body, createdAt: c.createdAt };
  }

  /** Explore > Top: popular programs, suggested athletes, trending posts. */
  async exploreTop(viewer: string) {
    const [programs, trending] = await Promise.all([
      this.db.program.findMany({ where: { status: 'PUBLISHED', visibility: 'PUBLIC' }, orderBy: [{ enrolledCount: 'desc' }, { ratingAvg: 'desc' }], take: 6, include: { owner: { select: { id: true, email: true, athlete: { select: { username: true } } } }, goal: true } }),
      this.db.post.findMany({ where: { deletedAt: null, createdAt: { gte: daysAgo(14) } }, orderBy: { createdAt: 'desc' }, take: 30, include: this.include }),
    ]);
    const shaped = await this.shape(viewer, trending);
    return {
      programs: programs.map((p) => ({ id: p.id, title: p.title, durationWeeks: p.durationWeeks, goal: p.goal?.name ?? null, ratingAvg: num(p.ratingAvg), ratingCount: p.ratingCount, coach: { id: p.owner.id, name: p.owner.athlete?.username ?? 'Coach' } })),
      trendingPosts: shaped.sort((a, b) => b.likeCount + b.commentCount - (a.likeCount + a.commentCount)).slice(0, 5),
    };
  }
  async explorePosts(viewer: string) {
    const rows = await this.db.post.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 30, include: this.include });
    return this.shape(viewer, rows);
  }
}

@Controller()
export class SocialController {
  constructor(private s: SocialService) {}
  @Get('feed') feed(@Me() u: AuthUser, @Query('cursor') c?: string) { return this.s.feed(u.id, c); }
  @Post('posts') create(@Me() u: AuthUser, @Body() d: PostDto) { return this.s.create(u.id, d); }
  @Post('posts/:id/like') like(@Me() u: AuthUser, @Param('id') id: string) { return this.s.toggleLike(u.id, id); }
  @Post('posts/:id/bookmark') bookmark(@Me() u: AuthUser, @Param('id') id: string) { return this.s.toggleBookmark(u.id, id); }
  @Get('posts/:id/comments') comments(@Param('id') id: string) { return this.s.comments(id); }
  @Post('posts/:id/comments') addComment(@Me() u: AuthUser, @Param('id') id: string, @Body() d: CommentDto) { return this.s.addComment(u.id, id, d); }
  @Get('explore/top') top(@Me() u: AuthUser) { return this.s.exploreTop(u.id); }
  @Get('explore/posts') posts(@Me() u: AuthUser) { return this.s.explorePosts(u.id); }
}

@Module({ controllers: [SocialController], providers: [SocialService] })
export class SocialModule {}
