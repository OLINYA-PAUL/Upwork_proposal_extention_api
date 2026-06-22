import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'Internal server error';

    // ─── NestJS HTTP Exceptions ───────────────────────────────────────
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as any).message || exception.message;
    }

    // ─── Prisma Known Request Errors ─────────────────────────────────
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          // Unique constraint violation
          status = HttpStatus.CONFLICT;
          message = `A record with this ${(exception.meta?.target as string[])?.join(', ')} already exists`;
          break;

        case 'P2025':
          // Record not found
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found';
          break;

        case 'P2003':
          // Foreign key constraint
          status = HttpStatus.BAD_REQUEST;
          message = 'Related record not found';
          break;

        case 'P2014':
          // Relation violation
          status = HttpStatus.BAD_REQUEST;
          message = 'Invalid relation between records';
          break;

        default:
          status = HttpStatus.BAD_REQUEST;
          message = `Database error: ${exception.code}`;
          break;
      }
    }

    // ─── Prisma Validation Errors ─────────────────────────────────────
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Invalid data provided to the database';
    }

    // ─── Prisma Initialization Errors ────────────────────────────────
    else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Database connection failed';
    }

    // ─── Prisma Unknown Request Errors ───────────────────────────────
    else if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unknown database error occurred';
    }

    // ─── Generic JS Errors ───────────────────────────────────────────
    else if (exception instanceof Error) {
      message = exception.message || 'Internal server error';
    }

    const errorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
    };

    this.logger.error(
      `[${request.method}] ${request.url} → ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json(errorResponse);
  }
}
