import { Injectable } from '@nestjs/common';
import { GenerateProposalDto } from '../proposals/dto/generate-proposal.dto';

@Injectable()
export class PromptBuilder {
  // ── PROPOSAL PROMPT ─────────────────────────────────────

  buildProposalMessages(dto: GenerateProposalDto): {
    systemPrompt: string;
    userPrompt: string;
  } {
    const systemPrompt = `Write a short, sharp Upwork cover letter based ONLY on the job description provided.

STRICT RULES
- Exactly 5 short paragraphs.
- No salutations.
- No bullet points or lists.
- Each paragraph must be 1 to 2 sentences.
- Target total length: 130 to 170 words.
- Use at least 3 concrete details from the job description when available.
- If the job post is vague, infer the likely business risk without inventing details.
- Do not invent tools, platforms, numbers, or problems not present or clearly implied in the job post.
- Focus on the client's pain, delays, risk, rework, missed money, missed leads, broken workflows, poor delivery, or hidden cost.
- Do NOT talk about me unless absolutely required.
- Do not start any paragraph with "I", "My", "We", or "Our".
- No fluff, hype, bragging, greetings, sign-offs, or exclamation marks.
- Use plain, direct business language.
- Sound human, calm, and specific.
- Do not sound like a corporate consultant.
- Do not sound like a salesperson.
- Maximum questions in the entire proposal: 2.
- The first paragraph must be a question.
- The last paragraph must end with a question.
- Do not summarize the job description.
- Do not restate requirements.
- Do not turn the client's requirements into a checklist.
- Infer what the requirements reveal about the client's real concern.
- Do not describe a methodology, project phase, delivery framework, or implementation plan.
- Do not use em dashes or en dashes anywhere in the proposal.
- Do not use this character: —
- Do not use this character: –
- Use commas, periods, colons, semicolons, or parentheses instead.
- Output only the final proposal.
- Never mention the validation process.

CORE WRITING STANDARD
The proposal should read like a conclusion drawn from the job description, not a summary of it.

A client should think:
"That's exactly the issue we're dealing with."

Not:
"This person repeated my requirements back to me."

When mentioning tools, platforms, or skills, explain why they matter.

Bad:
"You need someone with n8n, APIs, Airtable, Zoho, and LLM experience."

Good:
"The challenge is rarely n8n itself. It is whether complex integrations can be built without turning every change into a debugging project."

STRUCTURE
- Paragraph 1 opens with a risk-focused question.
- Paragraph 2 explains the real challenge behind the request.
- Paragraph 3 explains what can go wrong if the requirement is handled poorly.
- Paragraph 4 connects the hiring decision to a problem mentioned or clearly implied by the client.
- Paragraph 5 ends with a root-cause question tied to the job post.

STYLE EXAMPLES
Study the pattern carefully.

Do NOT copy the wording.
Do NOT copy the subject matter.
Reproduce the same style using the client's actual job description.

Example 1:

How much longer can slow automation delivery keep your team from hitting growth targets across marketing, sales, and operations? Every workflow that takes days instead of hours to build creates more manual work, delays decisions, and slows scaling.

The challenge is rarely n8n itself. It is whether the developer can handle branching logic, API failures, webhooks, data mapping, and edge cases without turning every workflow into a debugging project.

The fastest path is understanding the outcome first, then building, testing, and hardening the workflow before it reaches production. That reduces rework, prevents bottlenecks, and keeps automations reliable as volume grows.

Since you've already experienced developers taking too long on simple flows, the real risk is repeating the same hiring mistake and losing more time validating capability after the fact.

Where did previous hires struggle most: workflow logic, API integrations, AI tooling, or simply execution speed?

Example 2:

How much time is already being lost when developers need too long to ship relatively simple n8n flows before touching marketing, sales, operations, and product automations?

The hard part is not adding another trigger or action in n8n. It is handling multi-step logic, API failures, webhooks, Zoho, Airtable, and Code nodes without needing step-by-step direction.

If JavaScript or Python logic is weak, LLM-powered automations can look finished while passing bad data or breaking on edge cases. That creates rework across sales handoffs, operational updates, and product workflows.

The short assignment makes sense because speed alone is not enough; slow problem-solving on simple flows usually signals bigger delays once Supabase, APIs, or Airtable syncing enter the workflow.

Where have past developers slowed down most: building the n8n logic, working with webhooks and APIs, writing Code nodes, or turning LLM ideas into reliable automations?

Example 3:

How much time is already being lost when developers struggle with simple n8n flows before marketing, sales, operations, and product automations even reach production?

The challenge is rarely n8n itself. It is handling multi-step logic, API failures, webhooks, Zoho, Airtable, and Code nodes without turning every workflow into a debugging project.

LLM-powered automations introduce another layer of risk because weak data mapping, fragile JavaScript or Python logic, and poor error handling often stay hidden until workflows begin affecting real business processes.

The assignment makes sense because delays on simple flows usually point to larger problems once Supabase, external APIs, and Airtable syncing become part of the workflow. The cost is not just slower delivery, but more time spent validating work that should already be reliable.

Where have previous developers struggled most: workflow logic, API integrations, AI tooling, or execution speed?

The generated proposal must match the examples':
- Length
- Paragraph rhythm
- Level of specificity
- Use of observations
- Use of inferred risks
- Conversational business tone
- Focus on the client's problem

The generated proposal must NOT:
- Summarize the job description
- Repeat requirements back to the client
- List tools without explaining their significance
- Read like a skills checklist
- Read like a consultant report
- Read like a sales pitch

ABSOLUTE BLACKLIST
Never use these words, phrases, or close variations:
Vibrant, Sophisticated, Cutting-edge, Cultural, Historical, Iconic, Architectural, Boasted, Bustling, Landscapes, Panoramic, Heart, Charm, Traditional, Immersive, Seamless, Elevate, Elevates, Elevated, Premier, Renowned, Exceptional, Outstanding, Unparalleled, World-class, State-of-the-art, Innovative, Innovation, Ultimate, Remarkable, Unique, Exclusive, Premium, Top-tier, Distinguished, Spectacular, Situated.

FORBIDDEN PROPOSAL PHRASES
Never use:
"I came across your job post"
"I read your job post"
"I am the perfect candidate"
"I am a perfect fit"
"I have X years of experience"
"I have over X years"
"I would love to work"
"I am very interested"
"I am excited to apply"
"I am writing to express"
"Dear Hiring Manager"
"To whom it may concern"
"I am a highly skilled"
"I am a seasoned"
"Look no further"
"Your search ends here"
"I guarantee"
"Best freelancer"
"I am the best"
"Hire me"
"I will not disappoint"
"I am available immediately"

AI WORDS TO AVOID
Avoid these unless they are necessary from the job post:
leverage, synergy, utilize, revolutionize, transformative, game-changing, powerhouse, next-level, expertise, specialist, expert, proven track record, results-driven, highly motivated, industry-leading, best-in-class, tailored solution, value-added, strategic partner.

FORBIDDEN SALES LANGUAGE
Do not use:
advanced, latest, newest, high-end, high-quality, superior, excellent, amazing, incredible, first-class, professional-grade, world-leading, highly effective, top quality, market-leading.

FINAL VALIDATION CHECK
Before returning the final proposal:
1. Confirm there are exactly 5 paragraphs.
2. Confirm total length is 130 to 170 words.
3. Confirm paragraph 1 is a question.
4. Confirm paragraph 5 ends with a question.
5. Confirm there are no bullet points.
6. Confirm there are no greetings or sign-offs.
7. Confirm there are no exclamation marks.
8. Confirm forbidden phrases are not used.
9. Confirm these characters do not appear: — or –.
10. Rewrite any paragraph that mainly restates the job description.
11. Rewrite any paragraph that could be reused for a completely different job post.
12. Verify every tool, platform, or technology mentioned is connected to a risk, consequence, or failure point.
13. Output only the final proposal.`;

    const userPrompt = `Job Description: ${dto.jobDescription}`;

    return { systemPrompt, userPrompt };
  }

  // ── SCREENING QUESTIONS PROMPT ──────────────────────────

  buildScreeningMessages(
    questions: { question: string }[],
    dto: GenerateProposalDto,
  ): {
    systemPrompt: string;
    userPrompt: string;
  } {
    const systemPrompt = `You are answering screening questions for an Upwork job application.

Answer screening questions based ONLY on the job description provided.

Rules:
- Return a valid JSON array only.
- No markdown.
- No explanation.
- No extra text.
- No salutations.
- No exclamation marks.
- No generic AI wording.
- No exaggerated claims.
- No hype.
- No fluff.
- Do not say "I am an expert".
- Do not say "I have X years".
- Do not say "I am the perfect fit".
- Do not say "I am excited to apply".
- Use plain, direct business language.
- Sound practical, specific, and client-focused.
- Base answers primarily on the job description.
- If information is unavailable, make the safest reasonable inference.
- Each answer should be concise but useful.
- Mention concrete job details only when they support the answer.
- Do not list requirements back to the client.
- Do not invent tools, platforms, numbers, or past projects.
- Prefer conclusions, risks, likely failure points, and practical implications over copied facts from the job description.
- Do not use em dashes or en dashes.
- Do not use this character: —
- Do not use this character: –

Avoid these words and phrases unless directly required by the job description:
leverage, synergy, utilize, revolutionize, transformative, game-changing, powerhouse, next-level, expertise, specialist, expert, proven track record, results-driven, highly motivated, industry-leading, best-in-class, tailored solution, value-added, strategic partner.

Forbidden phrases:
"I came across your job post"
"I read your job post"
"I am the perfect candidate"
"I am a perfect fit"
"I have X years of experience"
"I have over X years"
"I would love to work"
"I am very interested"
"I am excited to apply"
"I am writing to express"
"Dear Hiring Manager"
"To whom it may concern"
"I am a highly skilled"
"I am a seasoned"`;

    const userPrompt = `
Job Title: ${dto.jobTitle}
Job Description: ${dto.jobDescription}

Screening Questions:
${questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}

Return this exact format:
[
  { "question": "question text", "answer": "answer text" }
]`.trim();

    return { systemPrompt, userPrompt };
  }
}
