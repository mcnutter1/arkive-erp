import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from './auth/public.decorator.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get('liveness')
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  @Public()
  @Get('readiness')
  readiness(): { status: string } {
    return { status: 'ready' };
  }
}
