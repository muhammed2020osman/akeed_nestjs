import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';

@Entity('tickets')
export class Ticket {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'company_id', type: 'bigint', unsigned: true })
    companyId: number;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ type: 'varchar', length: 50, default: 'issue' })
    type: string;

    @Column({ type: 'varchar', length: 50, default: 'open' })
    status: string;

    @Column({ type: 'varchar', length: 50, default: 'medium' })
    priority: string;

    // Add other columns if needed, keeping it minimal for listing to fix 404
    @Column({ name: 'assigned_to', type: 'bigint', unsigned: true, nullable: true })
    assignedTo: number | null;

    @Column({ name: 'created_by', type: 'bigint', unsigned: true })
    createdBy: number;

    @Column({ name: 'reporter', type: 'bigint', unsigned: true, nullable: true })
    reporter: number | null;

    @Column({ name: 'channel_id', type: 'bigint', unsigned: true, nullable: true })
    channelId: number | null;

    @Column({ name: 'message_id', type: 'bigint', unsigned: true, nullable: true })
    messageId: number | null;

    @Column({ name: 'due_date', type: 'timestamp', nullable: true })
    dueDate: Date | null;

    @Column({ name: 'approver_id', type: 'bigint', unsigned: true, nullable: true })
    approverId: number | null;

    @Column({ name: 'requires_approval', type: 'boolean', default: false })
    requiresApproval: boolean;

    @Column({ name: 'location_context', type: 'json', nullable: true })
    locationContext: any;

    @Column({ name: 'material_items', type: 'json', nullable: true })
    materialItems: any;

    @Column({ type: 'varchar', length: 100, nullable: true })
    category: string | null;

    @Column({ type: 'json', nullable: true })
    tags: any; // Simplified for now

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    // Relations
    @ManyToOne(() => User)
    @JoinColumn({ name: 'created_by' })
    createdByUser: User;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'assigned_to' })
    assignedToUser: User;

    @ManyToOne(() => Channel)
    @JoinColumn({ name: 'channel_id' })
    channel: Channel;
}
