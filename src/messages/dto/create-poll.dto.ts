import {
    IsString,
    IsBoolean,
    IsArray,
    IsNotEmpty,
    ArrayMinSize,
    IsOptional,
} from 'class-validator';
import { Expose } from 'class-transformer';

export class CreatePollDto {
    @IsString()
    @IsNotEmpty()
    question: string;

    @IsArray()
    @ArrayMinSize(2)
    options: any[];

    @IsBoolean()
    @IsOptional()
    @Expose({ name: 'allow_multiple_selection' })
    allowMultipleSelection: boolean;

    @IsBoolean()
    @IsOptional()
    @Expose({ name: 'is_anonymous' })
    isAnonymous: boolean;
}
