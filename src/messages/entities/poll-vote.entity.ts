import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    Index,
} from 'typeorm';
import { Poll } from './poll.entity';
import { PollOption } from './poll-option.entity';
import { User } from '../../users/entities/user.entity';

@Entity('poll_votes')
@Index('idx_poll_votes_user_poll', ['userId', 'pollId'])
export class PollVote {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'poll_id', type: 'bigint', unsigned: true })
    pollId: number;

    @Column({ name: 'poll_option_id', type: 'bigint', unsigned: true })
    pollOptionId: number;

    @Column({ name: 'user_id', type: 'bigint', unsigned: true })
    userId: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    // Relations
    @ManyToOne(() => Poll, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'poll_id' })
    poll: Poll;

    @ManyToOne(() => PollOption, (option) => option.votes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'poll_option_id' })
    option: PollOption;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;
}
