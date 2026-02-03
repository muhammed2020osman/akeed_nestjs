import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    BeforeInsert,
    BeforeUpdate,
} from 'typeorm';
import { Message } from './message.entity';
import { DirectMessage } from './direct-message.entity';

@Entity('attachments')
@Index('idx_attachments_company', ['companyId'])
@Index('idx_attachments_message', ['messageId'])
@Index('idx_attachments_direct_message', ['directMessageId'])
export class Attachment {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'company_id', type: 'bigint', unsigned: true })
    companyId: number;

    @Column({ name: 'message_id', type: 'bigint', unsigned: true, nullable: true })
    messageId: number | null;

    @Column({ name: 'direct_message_id', type: 'int', unsigned: true, nullable: true })
    directMessageId: number | null;

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

    @ManyToOne(() => DirectMessage, (dm) => dm.attachments, {
        onDelete: 'CASCADE',
        nullable: true,
    })
    @JoinColumn({ name: 'direct_message_id' })
    directMessage: DirectMessage | null;

    @BeforeInsert()
    @BeforeUpdate()
    stripDomainFromUrl() {
        // 1. Clean 'url' property
        if (this.url && this.url.includes('uploads/')) {
            const parts = this.url.split('uploads/');
            this.url = 'uploads/' + parts[parts.length - 1];
        }

        // 2. Extra safety for any other potential URL fields
        if ((this as any).attachment_url && (this as any).attachment_url.includes('uploads/')) {
            const parts = (this as any).attachment_url.split('uploads/');
            (this as any).attachment_url = 'uploads/' + parts[parts.length - 1];
        }
    }
}
