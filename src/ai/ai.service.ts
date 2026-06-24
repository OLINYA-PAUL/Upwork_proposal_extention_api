import { Injectable, Logger, RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PromptBuilder } from './prompt.builder';
import { ValidatorService } from './validator.service';
import { GenerateProposalDto } from '../proposals/dto/generate-proposal.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  private readonly MAX_RETRIES = 1;
  private readonly RETRY_DELAY_MS = 1000;
  private readonly TIMEOUT_MS = 120000; // increased — non-streaming needs more time

  constructor(
    private readonly config: ConfigService,
    private readonly promptBuilder: PromptBuilder,
    private readonly validator: ValidatorService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
      timeout: this.TIMEOUT_MS,
      maxRetries: 0,
    });

    this.model = this.config.get<string>('OPENAI_MODEL') || 'gpt-4o';
  }

  // ── GENERATE PROPOSAL — NON-STREAMING ──────────────────

  async generateProposal(dto: GenerateProposalDto): Promise<{
    proposal: string;
    screeningAnswers: { question: string; answer: string }[];
  }> {
    let attempt = 0;
    let retryInstruction = '';

    while (attempt < this.MAX_RETRIES) {
      attempt++;

      try {
        const { systemPrompt, userPrompt } =
          this.promptBuilder.buildProposalMessages(dto);

        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          {
            role: 'system',
            content: retryInstruction
              ? `${systemPrompt}\n\n${retryInstruction}`
              : systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ];

        this.logger.log(
          `Generating proposal — attempt ${attempt}/${this.MAX_RETRIES}`,
        );

        const response = await Promise.race([
          this.openai.chat.completions.create({
            model: this.model,
            messages,
            stream: false,
            temperature: 1,
            max_completion_tokens: 6000,
          }),
          this.timeout(),
        ]);

        const fullText =
          (response as OpenAI.Chat.ChatCompletion).choices[0]?.message
            ?.content || '';

        const { isValid, reason } = this.validator.validate(fullText);

        if (!isValid && attempt < this.MAX_RETRIES) {
          this.logger.warn(
            `Attempt ${attempt} failed validation (${reason}) — retrying`,
          );
          retryInstruction = this.validator.buildRetryInstruction(reason!);
          await this.delay(this.RETRY_DELAY_MS);
          continue;
        }

        this.logger.log(
          `Proposal generated successfully on attempt ${attempt}`,
        );

        // ── SCREENING ANSWERS ──────────────────────────────
        const screeningAnswers = await this.generateScreeningAnswers(
          dto.screeningQuestions || [],
          dto,
        );

        this.logger.log(
          `Screening answers ready — ${screeningAnswers.length} question(s) answered`,
        );

        return { proposal: fullText, screeningAnswers };
      } catch (error) {
        this.logger.error(
          `AI error on attempt ${attempt}/${this.MAX_RETRIES}:`,
          error,
        );

        if (attempt < this.MAX_RETRIES) {
          await this.delay(this.RETRY_DELAY_MS);
          continue;
        }

        throw new Error('Failed to generate proposal. Please try again.');
      }
    }

    throw new Error('Failed to generate proposal after maximum retries.');
  }

  // ── GENERATE SCREENING ANSWERS — NON-STREAMING ──────────

  async generateScreeningAnswers(
    questions: { question: string }[],
    dto: GenerateProposalDto,
  ): Promise<{ question: string; answer: string }[]> {
    if (!questions || questions.length === 0) {
      return [];
    }

    let attempt = 0;

    while (attempt < this.MAX_RETRIES) {
      attempt++;

      try {
        const { systemPrompt, userPrompt } =
          this.promptBuilder.buildScreeningMessages(questions, dto);

        this.logger.log(
          `Generating screening answers — attempt ${attempt}/${this.MAX_RETRIES}`,
        );

        const response = await Promise.race([
          this.openai.chat.completions.create({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            stream: false,
            temperature: 0.5,
            max_tokens: 1000,
          }),
          this.timeout(),
        ]);

        const raw =
          (response as OpenAI.Chat.ChatCompletion).choices[0]?.message
            ?.content || '[]';

        const cleaned = raw
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim();

        const answers = JSON.parse(cleaned);

        if (!Array.isArray(answers)) {
          throw new Error('Screening answers response is not a valid array');
        }

        this.logger.log(
          `Screening answers generated — ${answers.length} answered`,
        );

        return answers;
      } catch (error) {
        this.logger.error(
          `Screening answers error on attempt ${attempt}:`,
          error,
        );

        if (attempt < this.MAX_RETRIES) {
          await this.delay(this.RETRY_DELAY_MS);
          continue;
        }

        this.logger.warn(
          'All screening answer attempts failed — returning empty array',
        );
        return [];
      }
    }

    return [];
  }

  // ── PRIVATE HELPERS ─────────────────────────────────────

  private timeout(): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new RequestTimeoutException(
              `AI request timed out after ${this.TIMEOUT_MS / 1000} seconds`,
            ),
          ),
        this.TIMEOUT_MS,
      ),
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
