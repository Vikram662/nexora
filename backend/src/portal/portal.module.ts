import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller.js';
import { KycGatewayService } from './kyc-gateway.service.js';

@Module({
  controllers: [PortalController],
  providers: [KycGatewayService],
  exports: [KycGatewayService],
})
export class PortalModule {}
