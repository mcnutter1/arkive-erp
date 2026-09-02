import { Module } from '@nestjs/common';

import { PrismaService } from '../common/prisma.service.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  controllers: [SearchController],
  providers: [PrismaService, SearchService],
})
export class SearchModule {}
