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
