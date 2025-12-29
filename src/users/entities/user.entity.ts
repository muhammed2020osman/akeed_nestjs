import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import { Message } from '../../messages/entities/message.entity';

@Entity('users')
@Index('idx_users_email_company', ['email', 'companyId'])
@Index('idx_users_company', ['companyId'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'bigint', unsigned: true, nullable: true })
  companyId: number | null;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'password', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ name: 'profile_image_url', type: 'text', nullable: true })
  profileImageUrl: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status: string | null;

  @Column({ name: 'is_online', type: 'tinyint', width: 1, default: false })
  isOnline: boolean;

  @Column({ name: 'last_seen', type: 'timestamp', nullable: true })
  lastSeen: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'member' })
  role: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'department_id', type: 'bigint', unsigned: true, nullable: true })
  departmentId: number | null;

  @Column({ name: 'job_title', type: 'varchar', length: 255, nullable: true })
  jobTitle: string | null;

  @Column({ name: 'is_approved', type: 'tinyint', width: 1, default: false })
  isApproved: boolean;

  // Relations
  @OneToMany(() => Message, (message) => message.user)
  messages: Message[];

  @OneToMany(() => Channel, (channel) => channel.creator)
  createdChannels: Channel[];

  @ManyToMany(() => Channel, (channel) => channel.members)
  channels: Channel[];
}

