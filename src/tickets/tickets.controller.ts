import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketsService } from './tickets.service';

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

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.ticketsService.findOne(id);
    }
}
