import { IsUrl } from 'class-validator';

export class AddMeetingLinkDto {
  @IsUrl({}, { message: 'Please provide a valid meeting URL' })
  meetingLink!: string;
}
