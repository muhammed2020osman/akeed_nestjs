import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MentionsService } from './mentions.service';

@Controller('mentions')
@UseGuards(JwtAuthGuard)
export class MentionsController {
  constructor(private readonly mentionsService: MentionsService) {}

  @Get()
  async index(@Query() query: any, @CurrentUser() user: any) {
    const userId = Number(user?.userId ?? user?.id);
    const companyId = user?.companyId ?? user?.company_id;
    return this.mentionsService.findAll({
      userId,
      companyId: companyId !== undefined && companyId !== null ? Number(companyId) : undefined,
      page: query.page,
      perPage: query.per_page,
    });
  }

  @Get('channel/:channelId')
  async byChannel(
    @Param('channelId') channelId: string,
    @Query() query: any,
    @CurrentUser() user: any,
  ) {
    const userId = Number(user?.userId ?? user?.id);
    const companyId = user?.companyId ?? user?.company_id;
    return this.mentionsService.findByChannel({
      channelId: Number(channelId),
      userId,
      companyId: companyId !== undefined && companyId !== null ? Number(companyId) : undefined,
      page: query.page,
      perPage: query.per_page,
    });
  }

  @Get('unread-count')
  async unreadCount() {
    return {
      status: true,
      code: 200,
      message: 'OK',
      payload: {
        unread_count: 0,
      },
    };
  }

  @Get('_count')
  async count(@CurrentUser() user: any) {
    const userId = Number(user?.userId ?? user?.id);
    const companyId = user?.companyId ?? user?.company_id;
    return this.mentionsService.countForUser({
      userId,
      companyId: companyId !== undefined && companyId !== null ? Number(companyId) : undefined,
    });
  }

  @Get('_latest')
  async latest(@CurrentUser() user: any) {
    const userId = Number(user?.userId ?? user?.id);
    const companyId = user?.companyId ?? user?.company_id;
    return this.mentionsService.latestForUser({
      userId,
      companyId: companyId !== undefined && companyId !== null ? Number(companyId) : undefined,
      limit: 5,
    });
  }
}
