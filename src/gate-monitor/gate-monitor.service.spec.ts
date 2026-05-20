import { Test, TestingModule } from '@nestjs/testing';
import { GateMonitorService } from './gate-monitor.service';

describe('GateMonitorService', () => {
  let service: GateMonitorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GateMonitorService],
    }).compile();

    service = module.get<GateMonitorService>(GateMonitorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
