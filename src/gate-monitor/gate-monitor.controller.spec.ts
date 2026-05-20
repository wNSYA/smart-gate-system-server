import { Test, TestingModule } from '@nestjs/testing';
import { GateMonitorController } from './gate-monitor.controller';

describe('GateMonitorController', () => {
  let controller: GateMonitorController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GateMonitorController],
    }).compile();

    controller = module.get<GateMonitorController>(GateMonitorController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
