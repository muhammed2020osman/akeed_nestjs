import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
    constructor(private readonly ticketsService: TicketsService) { }

    @Get()
    findAll(@Query() query: any) {
        return this.ticketsService.findAll(query);
    }

    @Post()
    create(
        @Body() createTicketDto: CreateTicketDto,
        @CurrentUser() user: any,
    ) {
        return this.ticketsService.create(createTicketDto, user.userId, user.companyId || user.company_id);
    }
}
