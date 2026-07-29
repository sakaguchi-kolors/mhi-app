import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { AsOfService } from './as-of.service';

@Global()
@Module({
  providers: [AppConfigService, AsOfService],
  exports: [AppConfigService, AsOfService],
})
export class AppConfigModule {}
