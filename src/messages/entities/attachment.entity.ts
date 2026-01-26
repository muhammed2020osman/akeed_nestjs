import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';
import { Message } from './message.entity';

@Entity('attachments')
@Index('idx_attachments_company', ['companyId'])
@Index('idx_attachments_message', ['messageId'])
export class Attachment {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'company_id', type: 'bigint', unsigned: true })
    companyId: number;

    @Column({ name: 'message_id', type: 'bigint', unsigned: true })
    messageId: number;

    @Column({ type: 'varchar', length: 255 })
    filename: string;

    @Column({ name: 'original_name', type: 'varchar', length: 255 })
    originalName: string;

    @Column({ name: 'mime_type', type: 'varchar', length: 100 })
    mimeType: string;

    @Column({ type: 'varchar', length: 50 })
    size: string;

    @Column({ type: 'text' })
    url: string;

    @Column({ name: 'created_by', type: 'bigint', unsigned: true })
    createdBy: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @ManyToOne(() => Message, (message) => message.attachments, {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'message_id' })
    message: Message;
}
