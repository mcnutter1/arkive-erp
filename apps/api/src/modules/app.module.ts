import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AdminModule } from './admin/admin.module.js';
import { ApprovalsModule } from './approvals/approvals.module.js';
import { AuditInterceptor } from './audit/audit.interceptor.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { RequestContextInterceptor } from './common/request-context.interceptor.js';
import { DocumentsModule } from './documents/documents.module.js';
import { EquityModule } from './equity/equity.module.js';
import { EquityLifecycleModule } from './equity-lifecycle/equity-lifecycle.module.js';
import { FundraisingModule } from './fundraising/fundraising.module.js';
import { HealthController } from './health.controller.js';
import { M365Module } from './m365/m365.module.js';
import { PeopleModule } from './people/people.module.js';
import { PortalModule } from './portal/portal.module.js';
import { PermissionsGuard } from './authorization/permissions.guard.js';
import { ReportsModule } from './reports/reports.module.js';
import { SearchModule } from './search/search.module.js';
import { SignaturesModule } from './signatures/signatures.module.js';
import { SystemController } from './system/system.controller.js';
import { TasksModule } from './tasks/tasks.module.js';
import { ValuationsModule } from './valuations/valuations.module.js';
import { VestingModule } from './vesting/vesting.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
      },
    ]),
    AuthModule,
    AuthorizationModule,
    AuditModule,
    AdminModule,
    ApprovalsModule,
    M365Module,
    PeopleModule,
    PortalModule,
    ReportsModule,
    SearchModule,
    SignaturesModule,
    TasksModule,
    DocumentsModule,
    EquityModule,
    EquityLifecycleModule,
    FundraisingModule,
    ValuationsModule,
    VestingModule,
  ],
  controllers: [HealthController, SystemController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
