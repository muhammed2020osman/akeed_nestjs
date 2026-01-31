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
import { User } from '../../users/entities/user.entity';

@Entity('message_actions')
@Index('message_id', ['messageId'])
@Index('user_id', ['userId'])
export class MessageAction {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'message_id', type: 'bigint', unsigned: true })
    messageId: number;

    @Column({ name: 'user_id', type: 'bigint', unsigned: true })
    userId: number;

    @Column({ name: 'action_type', type: 'varchar', length: 50 })
    actionType: string; // pin, favorite

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @ManyToOne(() => Message, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Message;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;
}
