import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Public facts the console needs before sign-in. */
  @Get('meta')
  @Public()
  getMeta() {
    return this.appService.getMeta();
  }

  @Get('health')
  @Public()
  async health() {
    const health = await this.appService.getHealth();
    if (health.components.database === 'down')
      throw new ServiceUnavailableException(health);
    return health;
  }
}
