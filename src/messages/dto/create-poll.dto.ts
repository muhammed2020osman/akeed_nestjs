import {
    IsString,
    IsBoolean,
    IsArray,
    IsNotEmpty,
    ArrayMinSize,
} from 'class-validator';

export class CreatePollDto {
    @IsString()
    @IsNotEmpty()
    question: string;

    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(2)
    options: string[];

    @IsBoolean()
    allowMultipleSelection: boolean;

    @IsBoolean()
    isAnonymous: boolean;
}
