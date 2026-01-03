import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Message } from './message.entity';
import { PollOption } from './poll-option.entity';

@Entity('polls')
export class Poll {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'company_id', type: 'bigint', unsigned: true })
    companyId: number;

    @Column({ type: 'text' })
    question: string;

    @Column({ name: 'allow_multiple_selection', type: 'tinyint', width: 1, default: false })
    allowMultipleSelection: boolean;

    @Column({ name: 'is_anonymous', type: 'tinyint', width: 1, default: false })
    isAnonymous: boolean;

    @Column({ name: 'created_by', type: 'bigint', unsigned: true })
    createdBy: number;

    @Column({ name: 'is_closed', type: 'tinyint', width: 1, default: false })
    isClosed: boolean;

    @Column({ name: 'message_id', type: 'bigint', unsigned: true, nullable: true })
    messageId: number | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    // Relations
    @ManyToOne(() => User)
    @JoinColumn({ name: 'created_by' })
    user: User;

    @ManyToOne(() => Message, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Message;

    @OneToMany(() => PollOption, (option) => option.poll, { cascade: true })
    options: PollOption[];
}
