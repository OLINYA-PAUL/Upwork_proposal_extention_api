import { Module } from '@nestjs/common';
import { BlogCategoriesService } from './blog-categories.service';
import { BlogCategoriesController } from './blog-categories.controller';

@Module({
  controllers: [BlogCategoriesController],
  providers: [BlogCategoriesService],
  exports: [BlogCategoriesService],
})
export class BlogCategoriesModule {}
