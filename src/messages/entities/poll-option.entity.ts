import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { Poll } from './poll.entity';
import { PollVote } from './poll-vote.entity';

@Entity('poll_options')
export class PollOption {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'poll_id', type: 'bigint', unsigned: true })
    pollId: number;

    @Column({ type: 'text' })
    text: string;

    // Relations
    @ManyToOne(() => Poll, (poll) => poll.options, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'poll_id' })
    poll: Poll;

    @OneToMany(() => PollVote, (vote) => vote.option)
    votes: PollVote[];
}
