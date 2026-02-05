import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from './entities/ticket.entity';
import { ActionItem } from '../action-items/entities/action-item.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';

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

            // Build query for Tickets
            const ticketQuery = this.ticketsRepository.createQueryBuilder('ticket')
                .leftJoinAndSelect('ticket.creator', 'creator')
                .leftJoinAndSelect('ticket.assignee', 'assignee');

            // Build query for Action Items
            const actionItemQuery = this.actionItemsRepository.createQueryBuilder('action_item')
                .leftJoinAndSelect('action_item.creator', 'creator_ai')
                .leftJoinAndSelect('action_item.assignee', 'assignee_ai');

            // Apply filters
            if (query.status) {
                const statuses = query.status.split(',').map(s => s.trim());
                ticketQuery.andWhere('ticket.status IN (:...statuses)', { statuses });

                const upperStatuses = statuses.map(s => s.toUpperCase());
                actionItemQuery.andWhere('action_item.status IN (:...upperStatuses)', { upperStatuses });
            }

            if (query.assigned_to) {
                ticketQuery.andWhere('ticket.assignedTo = :assignedTo', { assignedTo: query.assigned_to });
                actionItemQuery.andWhere('action_item.assigneeId = :assignedTo', { assignedTo: query.assigned_to });
            }

            if (query.created_by) {
                ticketQuery.andWhere('ticket.createdBy = :createdBy', { createdBy: query.created_by });
                actionItemQuery.andWhere('action_item.userId = :createdBy', { createdBy: query.created_by });
            }

            // Fetch results using limit/offset instead of take/skip to avoid TypeORM bug with complex metadata
            const [tickets, totalTickets] = await ticketQuery
                .orderBy('ticket.createdAt', 'DESC')
                .limit(limit)
                .offset(skip)
                .getManyAndCount();

            const [actionItems, totalActionItems] = await actionItemQuery
                .orderBy('action_item.createdAt', 'DESC')
                .limit(limit)
                .offset(skip)
                .getManyAndCount();

            // Map ActionItems to Ticket shape
            const mappedActionItems = actionItems.length > 0 ? actionItems.map(ai => ({
                id: ai.id,
                title: ai.title,
                description: ai.description,
                type: ai.type.toLowerCase(),
                status: ai.status.toLowerCase(),
                priority: ai.priority.toLowerCase(),
                created_by: ai.userId.toString(),
                assigned_to: ai.assigneeId?.toString(),
                created_by_user: ai.creator,
                assigned_to_user: ai.assignee,
                createdAt: ai.createdAt,
                updatedAt: ai.updatedAt,
                message_id: ai.messageId,
                channel_id: ai.channelId,
                is_action_item: true,
                approval_status: ai.status === 'APPROVED' ? 'approved' :
                    ai.status === 'REJECTED' ? 'rejected' : 'pending',
            })) : [];

            // Merge and Sort
            const allItems = [...mappedActionItems, ...tickets].sort((a, b) => {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

            const paginatedItems = allItems.slice(0, limit);

            return {
                data: paginatedItems,
                total: totalTickets + totalActionItems,
                per_page: limit,
                current_page: page,
                last_page: Math.ceil((totalTickets + totalActionItems) / limit),
            };
        } catch (error) {
            console.error('Error in findAll:', error);
            throw error; // Re-throw to be caught by NestJS global error handler and our middleware
        }
    }
}
