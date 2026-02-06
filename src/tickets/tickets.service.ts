import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionItem } from '../action-items/entities/action-item.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { Ticket } from './entities/ticket.entity';

@Injectable()
export class TicketsService {
    constructor(
        @InjectRepository(Ticket)
        private ticketsRepository: Repository<Ticket>,
        @InjectRepository(ActionItem)
        private actionItemsRepository: Repository<ActionItem>,
    ) { }

    async create(createTicketDto: CreateTicketDto, userId: number, companyId: number): Promise<Ticket> {
        const ticket = this.ticketsRepository.create({
            title: createTicketDto.title,
            description: createTicketDto.description ?? null,
            type: createTicketDto.type || 'issue',
            status: createTicketDto.status || 'open',
            priority: createTicketDto.priority || 'medium',
            companyId: companyId,
            createdBy: userId,
            channelId: createTicketDto.channel_id ?? createTicketDto.channelId ?? null,
            messageId: createTicketDto.message_id ?? createTicketDto.messageId ?? null,
            assignedTo: createTicketDto.assigned_to ?? createTicketDto.assigneeId ?? null,
            requiresApproval: createTicketDto.requires_approval || false,
            approverId: createTicketDto.approver_id ?? createTicketDto.approverId ?? null,
            dueDate: createTicketDto.due_at || createTicketDto.dueDate || null,
            locationContext: createTicketDto.location_context ?? null,
            materialItems: createTicketDto.material_items ?? null,
            category: createTicketDto.category ?? null,
            tags: createTicketDto.tags || [],
        });

        return await this.ticketsRepository.save(ticket);
    }

    async findAll(query: any) {
        try {
            const page = query.page ? parseInt(query.page) : 1;
            const limit = query.per_page ? parseInt(query.per_page) : 15;
            const skip = (page - 1) * limit;

            const ticketQuery = this.ticketsRepository.createQueryBuilder('ticket')
                .leftJoinAndSelect('ticket.createdByUser', 'createdByUser')
                .leftJoinAndSelect('ticket.assignedToUser', 'assignedToUser')
                .leftJoinAndSelect('ticket.channel', 'channel');

            if (query.status) {
                const statuses = query.status.split(',').map(s => s.trim());
                ticketQuery.andWhere('ticket.status IN (:...statuses)', { statuses });
            }

            if (query.assigned_to) {
                ticketQuery.andWhere('ticket.assignedTo = :assignedTo', { assignedTo: parseInt(query.assigned_to) });
            }

            if (query.created_by) {
                ticketQuery.andWhere('ticket.createdBy = :createdBy', { createdBy: parseInt(query.created_by) });
            }

            if (query.channel_id) {
                ticketQuery.andWhere('ticket.channelId = :channelId', { channelId: parseInt(query.channel_id) });
            }

            const [tickets, total] = await ticketQuery
                .orderBy('ticket.createdAt', 'DESC')
                .limit(limit)
                .offset(skip)
                .getManyAndCount();

            return {
                data: tickets,
                total: total,
                per_page: limit,
                current_page: page,
                last_page: Math.ceil(total / limit),
            };
        } catch (error) {
            console.error('Error in findAll:', error);
            throw error;
        }
    }

    async findOne(id: string) {
        try {
            const ticketId = parseInt(id);
            if (isNaN(ticketId)) return null;

            return await this.ticketsRepository.createQueryBuilder('ticket')
                .leftJoinAndSelect('ticket.createdByUser', 'createdByUser')
                .leftJoinAndSelect('ticket.assignedToUser', 'assignedToUser')
                .leftJoinAndSelect('ticket.channel', 'channel')
                .where('ticket.id = :id', { id: ticketId })
                .getOne();
        } catch (error) {
            console.error('Error in findOne:', error);
            throw error;
        }
    }
}
