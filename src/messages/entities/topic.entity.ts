import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';
import { Message } from './message.entity';

@Entity('topics')
@Index('idx_topics_channel', ['channelId'])
export class Topic {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'channel_id', type: 'bigint', unsigned: true })
    channelId: number;

    @Column({ length: 255 })
    name: string;

    @Column({ type: 'varchar', length: 7, nullable: true })
    color: string | null;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    @Column({ name: 'created_by', type: 'bigint', unsigned: true })
    createdBy: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @ManyToOne(() => Channel, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'channel_id' })
    channel: Channel;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'created_by' })
    creator: User;

    @OneToMany(() => Message, (message) => message.topic)
    messages: Message[];
}
