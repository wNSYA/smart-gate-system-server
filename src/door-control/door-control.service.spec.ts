import { Test, TestingModule } from '@nestjs/testing';
import { DoorControlService } from './door-control.service';

describe('DoorControlService', () => {
  let service: DoorControlService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DoorControlService],
    }).compile();

    service = module.get<DoorControlService>(DoorControlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
